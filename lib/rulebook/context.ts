import { mkdir, readFile, readdir, rm, stat, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { briefFeatureIds, sanitizeBrief } from "@/lib/brief";
import { buildCodegenSystemPrompt } from "@/lib/gas-codegen";
import { pickAiPrefs, renderPrefsBlock, resolvePrefs, sanitizePrefs, type SaveHint, type StylePrefs } from "@/lib/preferences";
import { pickLessonsForTurn, renderLessonsBlock, renderLessonsGuide, type ProposeHint } from "@/lib/lessons";
import { proposeLesson, readLessons } from "@/lib/lessons-store";
import { getProject, mutateProject } from "@/lib/projects";
import { cameraGateFor } from "@/lib/premium/camera-gate";
import { renderCameraGateBlock } from "@/lib/premium/camera-rules";
import { cachedCameraRules, refreshCameraRules } from "@/lib/premium/content";
import { getActivePack } from "@/lib/rulebook/store";
import { planTurnContext, renderCards, renderIndex, rulesForKind, type CardAccess, type TurnPlan } from "@/lib/rulebook/select";
import { getSettings } from "@/lib/settings";

/** Turn note for a script imported from the user's Google account (lib/import.ts). */
const IMPORTED_BLOCK = `## Existing script (imported from the user's Google account)
This project is the user's EXISTING Apps Script, already in use. Change only what the user asks for, in the
smallest way that works. Keep every existing function name and signature (menus, triggers, other scripts and
sheet formulas may call them), keep the file layout, and do not reformat or "clean up" code you were not asked
to touch. Do not edit appsscript.json unless the request needs it (then say which line and why). If you notice
a real problem elsewhere, mention it in one Thai sentence and leave it unless the user asks.`;
import type { EgsProject } from "@/types/db";

/**
 * What every engine tells the AI beyond the core rulebook (server-only): the rule-card index, the
 * project's look & feel block, and the per-turn pick of cards. Kept in one place so the three engines
 * (Anthropic API, OpenAI-format API, CLI) cannot drift apart.
 */

/** Cap on rule-card text inlined into one build turn (≈ the three largest cards). */
const INLINE_BUDGET_BYTES = 56_000;
const MAX_CARDS_PER_READ = 4;

/**
 * Effective look & feel for a project: defaults ← Settings ← the project's own choices. The project's
 * choices are read from disk, not from the caller's object: the AI can save one in the middle of a
 * request (save_preference), and the rest of that request — auto-continue, the critic, the repair
 * turn — must see it rather than the copy loaded when the request started.
 */
export async function projectPrefs(project: EgsProject): Promise<StylePrefs> {
  const [settings, fresh] = await Promise.all([getSettings(), getProject(project.id)]);
  return resolvePrefs(settings.prefs, (fresh ?? project).prefs);
}

export interface SystemPromptParts {
  /** Core rulebook + rule-card index — identical for every project of a kind (cache this). */
  core: string;
  /** Look & feel block + how to propose a lesson — stable within a project. Goes AFTER `core`. */
  prefs: string;
}

export async function buildSystemPromptParts(
  project: EgsProject,
  access: CardAccess,
  save: SaveHint,
  propose: ProposeHint,
): Promise<SystemPromptParts> {
  const { pack } = await getActivePack();
  // The lessons guide is the same for every project unless it names a per-project file (Claude Code),
  // so it normally belongs in the shared block; the file wording travels with the settings part.
  const guide = renderLessonsGuide(propose);
  const shared = propose.via !== "file";
  return {
    core: buildCodegenSystemPrompt({ kind: project.kind }) + renderIndex(pack, project.kind, access) + (shared ? guide : ""),
    prefs: renderPrefsBlock(await projectPrefs(project), save) + (shared ? "" : guide),
  };
}

function specText(spec: Record<string, unknown> | null): string {
  if (!spec) return "";
  const parts: string[] = [];
  for (const key of ["title", "summary", "description", "storage"]) {
    if (typeof spec[key] === "string") parts.push(spec[key] as string);
  }
  for (const key of ["features", "dataModel", "outputs"]) {
    if (Array.isArray(spec[key])) parts.push((spec[key] as unknown[]).map(String).join(" "));
  }
  return parts.join(" ");
}

/**
 * What rides on the user's message this turn: the rule cards (see planTurnContext for the policy) and
 * the user's approved lessons that apply (lib/lessons pickLessonsForTurn).
 */
export async function buildTurnContext(args: {
  project: EgsProject;
  userMessage: string;
  hasFiles: boolean;
  access: CardAccess;
  inline: boolean;
  /** skip the premium camera gate (internal/repair turns that are not a user request) */
  noCameraGate?: boolean;
}): Promise<TurnPlan> {
  const { project } = args;
  const { pack } = await getActivePack();
  const brief = sanitizeBrief(project.brief);
  const plan = planTurnContext({
    pack,
    kind: project.kind,
    userMessage: args.userMessage,
    projectText: `${specText(project.spec)} ${brief.detail}`,
    features: briefFeatureIds(brief),
    hasFiles: args.hasFiles,
    specConfirmed: typeof project.spec?.title === "string" && project.spec.title.length > 0,
    allowInline: args.inline,
    access: args.access,
    inlineBudgetBytes: INLINE_BUDGET_BYTES,
  });
  // lessons are an extra: a problem reading them must not cost the turn its rule cards
  let lessonsBlock = "";
  try {
    const book = await readLessons();
    lessonsBlock = renderLessonsBlock(pickLessonsForTurn(book.lessons, { cards: plan.sources, newBuild: !args.hasFiles }));
  } catch (e) {
    console.error("[lessons] not added to this turn (non-fatal):", e);
  }
  // premium camera gate: rides on the turn like the cards, so a resumed CLI session (whose fixed
  // prompt still forbids the camera) learns the override in the message itself
  let cameraBlock = "";
  if (!args.noCameraGate) {
    try {
      const gate = await cameraGateFor(project, args.userMessage);
      // the paid instructions come from the licence server; a request (not a render) may fetch them once
      const rules = gate.gate === "allowed" ? ((await cachedCameraRules()) ?? (await refreshCameraRules())) : null;
      cameraBlock = renderCameraGateBlock(gate, rules);
    } catch (e) {
      console.error("[camera-gate] not added to this turn (non-fatal):", e);
    }
  }
  const importedBlock = project.origin === "imported" ? IMPORTED_BLOCK : "";
  return { text: [importedBlock, plan.text, lessonsBlock, cameraBlock].filter(Boolean).join("\n\n"), sources: plan.sources };
}

/** read_rule tool: full text of the requested cards (unknown ids are reported, not guessed). */
export async function readRuleCards(project: EgsProject, ids: unknown): Promise<{ content: string; isError: boolean }> {
  const { pack } = await getActivePack();
  const available = rulesForKind(pack, project.kind);
  const wanted = (Array.isArray(ids) ? ids : [ids]).map((x) => String(x ?? "").trim()).filter(Boolean);
  const matched = available.filter((r) => wanted.includes(r.id));
  const found = matched.slice(0, MAX_CARDS_PER_READ);
  const unknown = wanted.filter((id) => !available.some((r) => r.id === id));
  if (found.length === 0) {
    return { isError: true, content: `ไม่พบ rule card: ${wanted.join(", ") || "(ไม่ได้ระบุ id)"} — id ที่มี: ${available.map((r) => r.id).join(", ")}` };
  }
  const notes: string[] = [];
  if (unknown.length) notes.push(`ไม่พบ id: ${unknown.join(", ")}`);
  if (matched.length > found.length) {
    notes.push(`อ่านได้ครั้งละ ${MAX_CARDS_PER_READ} ใบ — ยังไม่ได้ส่ง: ${matched.slice(MAX_CARDS_PER_READ).map((r) => r.id).join(", ")} (เรียก read_rule อีกครั้งถ้าต้องใช้)`);
  }
  return { isError: false, content: renderCards(found, Number.MAX_SAFE_INTEGER).text + (notes.length ? `\n\n(${notes.join(" · ")})` : "") };
}

/**
 * Record a look & feel preference the user stated in chat (save_preference tool, or the CLI engine's
 * request file). Fixed options only (see pickAiPrefs); the merge happens inside the project's write
 * queue so it cannot clobber, or be clobbered by, another save. Returns a line for the AI.
 */
export async function saveProjectPreference(
  projectId: string,
  input: unknown,
): Promise<{ content: string; isError: boolean; freeTextDropped: boolean }> {
  const r = await savePickedPreference(projectId, input);
  return { ...r, freeTextDropped: pickAiPrefs(input).hadFreeText };
}

async function savePickedPreference(projectId: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const { patch, rejected, hadFreeText } = pickAiPrefs(input);
  const freeTextNote = hadFreeText
    ? " (ข้อความอิสระบันทึกแทนผู้ใช้ไม่ได้ — ทำตามในรอบนี้ แล้วบอกผู้ใช้ให้ใส่เองที่ปุ่ม สไตล์ → คำสั่งเพิ่มเติม)"
    : "";
  if (Object.keys(patch).length === 0) {
    const why = rejected.length ? ` — ค่าไม่ถูกต้อง (${rejected.join(", ")})` : "";
    return { isError: true, content: `ไม่ได้บันทึก${why}${freeTextNote || (why ? "" : " — ใช้ key/ค่าตามที่ระบุในหัวข้อ Look & feel")}` };
  }
  try {
    await mutateProject(projectId, (current) => ({ prefs: { ...sanitizePrefs(current.prefs), ...patch } }));
  } catch {
    return { isError: true, content: "ไม่พบโปรเจกต์" };
  }
  const saved = Object.entries(patch).map(([k, v]) => `${k}=${v}`).join(", ");
  const skipped = rejected.length ? ` (ไม่ได้บันทึก ${rejected.join(", ")}: ค่าไม่ถูกต้อง)` : "";
  return { isError: false, content: `บันทึกสิ่งที่ผู้ใช้เลือกแล้ว: ${saved} — ใช้ตามนี้ต่อจากนี้${skipped}${freeTextNote}` };
}

// ── CLI engines: cards are plain files the CLI opens with its own Read tool ──

/** (Re)write every card for the project's kind into `dir`, and drop files that are not current cards. */
export async function writeRuleFiles(project: EgsProject, dir: string): Promise<void> {
  const { pack } = await getActivePack();
  const cards = rulesForKind(pack, project.kind);
  await mkdir(dir, { recursive: true });
  const keep = new Set(cards.map((c) => `${c.id}.md`));
  for (const name of await readdir(dir)) {
    if (!keep.has(name)) await rm(join(dir, name), { recursive: true, force: true });
  }
  await Promise.all(cards.map((c) => writeFile(join(dir, `${c.id}.md`), c.content, "utf8")));
}

const MAX_REQUEST_BYTES = 8_000;
export type PreferenceRequestOutcome = "none" | "saved" | "saved-without-free-text" | "rejected";

/**
 * Apply and remove the CLI engine's preference request file, if the AI wrote one. Unlike a tool call,
 * the AI gets no answer here and has usually already told the user "saved" — so the caller must tell
 * the user when that is not (fully) true: "rejected" = nothing could be saved; "saved-without-free-
 * text" = the fixed options were saved but free text was dropped (only the user may write that).
 */
export async function consumePreferenceRequest(projectId: string, file: string): Promise<PreferenceRequestOutcome> {
  let text = "";
  try {
    const { size } = await stat(file);
    if (size <= MAX_REQUEST_BYTES) text = await readFile(file, "utf8"); // never load an oversized file
  } catch {
    return "none";
  }
  await rm(file, { force: true });
  try {
    const r = await saveProjectPreference(projectId, JSON.parse(text));
    if (!r.isError) return r.freeTextDropped ? "saved-without-free-text" : "saved";
    console.warn("[prefs] request ignored:", r.content);
  } catch {
    console.warn("[prefs] request file was empty, too large or not valid JSON — ignored");
  }
  return "rejected";
}

/**
 * Apply and remove the CLI engine's lesson request file, if the AI wrote one. The proposal is only
 * stored as pending and offered to the user at the end of the turn (lib/lessons-store).
 */
export async function consumeLessonRequest(projectId: string, file: string): Promise<void> {
  let text = "";
  try {
    const { size } = await stat(file);
    if (size <= MAX_REQUEST_BYTES) text = await readFile(file, "utf8");
  } catch {
    return; // nothing proposed
  }
  await rm(file, { force: true });
  try {
    const r = await proposeLesson(projectId, JSON.parse(text));
    if (r.isError) console.warn("[lessons] proposal ignored:", r.content);
  } catch {
    console.warn("[lessons] request file was empty, too large or not valid JSON — ignored");
  }
}
