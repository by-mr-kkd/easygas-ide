"use server";

import { revalidatePath } from "next/cache";
import { sanitizeChoice } from "@/lib/ai-choice";
import { LLM_PROVIDERS } from "@/lib/llm/catalog";
import { providerWithKey } from "@/lib/llm/provider";
import { listedModels } from "@/lib/llm/model-list";
import { orderModels, pickModel, recommendModel } from "@/lib/llm/model-pick";
import { getSettings, updateAppSettings } from "@/lib/settings";
import { detectCapabilityNeeds, routeTarget } from "@/lib/deployment-targets/router";
import { briefToMessage, isEmptyBrief, sanitizeBrief } from "@/lib/brief";
import { sanitizePrefs, type StylePrefs } from "@/lib/preferences";
import { busyProjectIds, isProjectBusy } from "@/lib/agent-lock";
import { ANNOUNCE_ID, DISMISSED_KEY, addDismissed, latestAnnouncements, readDismissed, type Announcement } from "@/lib/announcement";
import { createProject, getProject, listProjects, mutateProject, softDeleteProject } from "@/lib/projects";
import { premiumStatus } from "@/lib/premium/status";
import { sanitizeProFeatures } from "@/lib/pro-features";
import { LOOK_FONTS } from "@/lib/style-mockup";
import { getFiles } from "@/lib/files";
import { publishState } from "@/lib/deploy";
import { runUrlFor } from "@/lib/run-link";
import { allowedUses, hostingOfUse, isProjectUse, kindLockReason, kindOfUse, useOf, type ProjectUse } from "@/lib/project-use";

function buildSpec(name: string): Record<string, unknown> {
  // Capability router: record what the project seems to need + whether it wants a target we don't
  // build, so the IDE can warn honestly. Always created as GAS.
  const needs = detectCapabilityNeeds(name);
  const route = routeTarget(needs);
  return {
    description: name.trim() || null,
    capabilityNeeds: needs,
    recommendedTarget: route.target,
    webOnlyReasons: route.notImplemented ? route.reasons : [],
  };
}

/**
 * Create a project and RETURN its id (no redirect) — the projects home and the style picker stash
 * their kickoff prompt in sessionStorage before navigating into the IDE.
 */
export async function newProjectReturnId(name: string, use: unknown = "google"): Promise<{ id: string } | { error: string }> {
  // "ใช้งานผ่านอะไร" (lib/project-use.ts); an old caller may still pass a kind
  const u: ProjectUse = isProjectUse(use) ? use : use === "bound" ? "sheet" : "google";
  if (u === "github" && !(await premiumStatus()).active) return { error: "ลิงก์ GitHub Pages ใช้ได้ใน Pro" };
  const id = await createProject(name, kindOfUse(u), buildSpec(name));
  // recorded either way: the publish button asks a Pro user "Google or GitHub?" only when nothing was chosen
  await mutateProject(id, () => ({ hosting: hostingOfUse(u) }));
  return { id };
}

/**
 * Change "ใช้งานผ่านอะไร" on an existing project (the style tab). The kind may change only until Google holds
 * the script (kindLockReason); GitHub Pages is Pro and needs a standalone script. Returns whether the kind
 * changed, so the caller can ask the AI to rewrite the sheet access in code that already exists.
 */
export async function setProjectUseAction(id: string, input: unknown): Promise<{ ok: true; kindChanged: boolean } | { ok: false; error: string }> {
  if (!isProjectUse(input)) return { ok: false, error: "ค่าไม่ถูกต้อง" };
  const project = await getProject(id);
  if (!project) return { ok: false, error: "ไม่พบโปรเจกต์" };
  const current = useOf(project.kind, project.hosting);
  const lock = kindLockReason(project);
  if (!allowedUses(current, lock).includes(input)) return { ok: false, error: lock ?? "เปลี่ยนเป็นแบบนี้ไม่ได้" };
  if (input === "github" && !(await premiumStatus()).active) return { ok: false, error: "ลิงก์ GitHub Pages ใช้ได้ใน Pro" };
  if (await isProjectBusy(id)) return { ok: false, error: "AI กำลังทำงานกับโปรเจกต์นี้อยู่ รอให้เสร็จก่อนแล้วลองอีกครั้ง" };
  const kind = kindOfUse(input);
  const hosting = hostingOfUse(input);
  // leaving GitHub with camera code: Google's page cannot run it (same check as setHostingAction)
  if (hosting === "gas" && project.hosting === "github") {
    const files = await getFiles(id);
    if (files.some((f) => /getUserMedia|capture=["']?(camera|environment)/.test(f.content))) {
      return { ok: false, error: "โปรเจกต์นี้ใช้กล้อง ซึ่งหน้าเว็บของ Google เปิดกล้องไม่ได้ ต้องอยู่บน GitHub Pages ต่อไป" };
    }
  }
  await mutateProject(id, () => ({ kind, hosting }));
  revalidatePath(`/projects/${id}`);
  revalidatePath("/projects");
  return { ok: true, kindChanged: kind !== project.kind };
}

/**
 * Delete a project from the app (its folder stays on disk, recoverable). The Apps Script project on
 * Google is NOT touched: clasp's Google sign-in has no Drive write access to the scripts it creates,
 * so the UI links the user to script.google.com to remove it themselves.
 */
export async function deleteProjectAction(id: string) {
  if (!(await getProject(id))) throw new Error("not_found");
  await softDeleteProject(id);
  revalidatePath("/projects");
}

/** Look & feel for one project; only the keys present override the user's defaults from Settings. */
export async function saveProjectPrefsAction(id: string, input: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!(await getProject(id))) return { ok: false, error: "ไม่พบโปรเจกต์" };
  // the AI may be saving a choice of its own right now (save_preference) — don't overwrite it blind
  if (await isProjectBusy(id)) return { ok: false, error: "AI กำลังทำงานกับโปรเจกต์นี้อยู่ รอให้เสร็จก่อนแล้วบันทึกอีกครั้ง" };
  await mutateProject(id, () => ({ prefs: sanitizePrefs(input) }));
  return { ok: true };
}

/**
 * Finish the new-project wizard: store the brief (the app picks rule cards from it) and any look & feel
 * the user changed, and return the first chat message for the client to send.
 */
export async function startFromBriefAction(
  id: string,
  briefInput: unknown,
  prefsInput: unknown,
): Promise<{ message: string } | { error: string }> {
  const project = await getProject(id);
  if (!project) return { error: "ไม่พบโปรเจกต์" };
  const brief = sanitizeBrief(briefInput);
  if (isEmptyBrief(brief)) return { error: "ยังไม่ได้เลือกอะไรเลย เลือกอย่างน้อยหนึ่งข้อ หรือกด พิมพ์เอง" };
  await mutateProject(id, (current) => ({
    brief,
    prefs: { ...sanitizePrefs(current.prefs), ...sanitizePrefs(prefsInput) },
  }));
  return { message: briefToMessage(brief) };
}

/** This project's own look & feel choices as stored now (the AI may have saved one during the chat). */
/** The home screen's notices bar (lib/announcement.ts) minus the ones the user closed; asked from a client effect, never at render time. */
export async function appAnnouncementAction(): Promise<Announcement[]> {
  const [all, settings] = await Promise.all([latestAnnouncements(), getSettings()]);
  const closed = new Set(readDismissed(settings.app[DISMISSED_KEY]));
  return all.filter((a) => !closed.has(a.id));
}

/** Closing a notice hides it on this computer until the website posts a new one (a new id). */
export async function dismissAnnouncementAction(id: string): Promise<void> {
  if (typeof id !== "string" || !ANNOUNCE_ID.test(id)) return;
  const settings = await getSettings();
  await updateAppSettings({ [DISMISSED_KEY]: addDismissed(settings.app[DISMISSED_KEY], id) });
}

/** Whether an AI turn (or deploy / verify) is running on the project — the chat polls it after a reload. */
export async function projectRunningAction(id: string): Promise<boolean> {
  return (await getProject(id)) ? isProjectBusy(id) : false;
}

export async function getProjectPrefsAction(id: string): Promise<Partial<StylePrefs>> {
  return sanitizePrefs((await getProject(id))?.prefs);
}

/** Remember the AI picked in this project's chat (the re-check and the after-publish repair follow it). */
export async function saveProjectAiAction(id: string, input: unknown): Promise<{ ok: boolean }> {
  const choice = sanitizeChoice(input);
  if (!choice || !(await getProject(id))) return { ok: false };
  await mutateProject(id, () => ({ ai: choice }));
  return { ok: true };
}

/** Which projects the AI is working on now (the home screen's list follows it while open). */
export async function busyProjectsAction(): Promise<string[]> {
  return busyProjectIds();
}

/**
 * The models the user's own key can use, asked from the provider (remembered a day, lib/llm/model-list),
 * with the one to recommend and the one a default pick runs on. The picker loads it when it opens;
 * `force` = the "ดึงรายชื่อใหม่" button. Returns ids only; the key stays on the server.
 */
export async function listModelsAction(
  provider: unknown,
  force = false,
): Promise<{ models: string[]; recommended: string | null; defaultModel: string } | { error: string }> {
  const p = LLM_PROVIDERS.find((x) => x === provider);
  if (!p) return { error: "ผู้ให้บริการไม่ถูกต้อง" };
  const cfg = await providerWithKey(p);
  if (!cfg.apiKey) return { error: `ยังไม่ได้ใส่ API key ของ ${cfg.label}` };
  try {
    const models = (await listedModels(cfg, { force: force === true })) ?? [];
    if (models.length === 0) return { error: "ผู้ให้บริการไม่ได้ส่งรายชื่อโมเดลกลับมา พิมพ์ชื่อโมเดลเองได้" };
    const settingsModel = (await getSettings()).models[p]?.trim() || null;
    return {
      models: orderModels(p, models),
      recommended: recommendModel(p, models),
      defaultModel: settingsModel || pickModel(p, { builtIn: cfg.model, listed: models }).model,
    };
  } catch {
    return { error: "ดึงรายชื่อโมเดลไม่สำเร็จ ตรวจ API key หรืออินเทอร์เน็ต แล้วลองใหม่ หรือพิมพ์ชื่อโมเดลเอง" };
  }
}

const NAME_MAX = 80;

/**
 * Rename a project in this app. The name on Google (the script's title) is not touched: clasp's sign-in
 * cannot rename a script, and an imported script keeps the name its owner gave it there.
 */
export async function renameProjectAction(id: string, input: unknown): Promise<{ ok: true; name: string } | { ok: false; error: string }> {
  const name = typeof input === "string" ? input.replace(/\s+/g, " ").trim() : "";
  if (!name) return { ok: false, error: "ตั้งชื่อก่อน" };
  if (name.length > NAME_MAX) return { ok: false, error: `ชื่อยาวได้ไม่เกิน ${NAME_MAX} ตัวอักษร` };
  if (!(await getProject(id))) return { ok: false, error: "ไม่พบโปรเจกต์" };
  const taken = (await listProjects()).some((p) => p.id !== id && p.name === name);
  if (taken) return { ok: false, error: "มีโปรเจกต์ชื่อนี้อยู่แล้ว" };
  await mutateProject(id, () => ({ name }));
  revalidatePath("/projects");
  revalidatePath(`/projects/${id}`);
  return { ok: true, name };
}

/** The last thing asked for was a screen-only demo (on) or the real build (off): the chat offers the next step. */
export async function setProjectDemoAction(id: string, on: boolean): Promise<{ ok: boolean }> {
  if (!(await getProject(id))) return { ok: false };
  await mutateProject(id, () => ({ demo: on === true }));
  return { ok: true };
}

/**
 * The look picked for a demo (colour · font · tone). The font is also saved as the project's font choice
 * (lib/preferences), so the "Look & feel" block the AI reads agrees with what the message asks for.
 */
export async function saveProjectLookAction(id: string, input: unknown): Promise<{ ok: boolean }> {
  if (!(await getProject(id))) return { ok: false };
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  const color = typeof o.color === "string" && /^#[0-9a-f]{6}$/i.test(o.color) ? o.color : undefined;
  const font = LOOK_FONTS.find((f) => f.family === o.font);
  const tone: "light" | "dark" = o.tone === "dark" ? "dark" : "light";
  await mutateProject(id, (current) => ({
    look: { color, font: font?.family, tone },
    prefs: font ? { ...sanitizePrefs(current.prefs), font: font.prefId } : current.prefs,
  }));
  return { ok: true };
}

/**
 * The style tab's "ติดตั้งแบบไหน" card. Pro only, like the hosting switch it goes with (setHostingAction):
 * a free install can tick the boxes to see the mock-up change, but nothing is stored.
 */
export async function saveProFeaturesAction(id: string, input: unknown): Promise<{ ok: true } | { ok: false; error: string }> {
  if (!(await getProject(id))) return { ok: false, error: "ไม่พบโปรเจกต์" };
  if (!(await premiumStatus()).active) return { ok: false, error: "ความสามารถนี้เป็นของ Pro" };
  const features = sanitizeProFeatures(input);
  await mutateProject(id, () => ({ pro_features: features }));
  return { ok: true };
}

/** Chat next steps: published already, and is that copy up to date? (lib/deploy.ts publishState) */
export async function publishStateAction(id: string): Promise<{ state: "none" | "current" | "changed"; url: string | null; shared: boolean }> {
  const project = await getProject(id);
  if (!project) return { state: "none", url: null, shared: false };
  const exec = project.deployment?.exec_url ?? null;
  const manifest = (await getFiles(id).catch(() => [])).find((f) => f.path === "appsscript.json")?.content;
  // before the owner's first Allow the sharing link only shows Google's error: open Google's own link (the consent screen)
  const authorized = !!project.backend_authorized_at || project.hosting === "github";
  // `shared` = a share link exists (the chat's overview strip counts it as the last step)
  return { state: await publishState(project), url: authorized ? runUrlFor(exec, manifest) ?? exec : exec, shared: !!project.share?.slug };
}
