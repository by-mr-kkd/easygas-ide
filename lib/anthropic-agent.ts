import Anthropic from "@anthropic-ai/sdk";
import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { validateGasFiles } from "@/lib/gas-codegen";
import { reviewProject } from "@/lib/critic";
import { noteLintIssues, proposeLesson } from "@/lib/lessons-store";
import { PREF_FIELDS } from "@/lib/preferences";
import { buildSystemPromptParts, buildTurnContext, readRuleCards, saveProjectPreference } from "@/lib/rulebook/context";
import { deleteFile, getFile, getFiles, writeFile } from "@/lib/files";
import { appendMessages, getHistory } from "@/lib/messages";
import { getProject, updateProject } from "@/lib/projects";
import type { AttachedImage } from "@/lib/chat-images";
import { lintScope } from "@/lib/import";
import type { EgsProject } from "@/types/db";

/**
 * The easygas agent loop — Claude writes/edits GAS files via tool-use, streamed over SSE.
 * Server owns egs_files; each mutation is echoed to the client. Gate 0 (validateGasFiles) runs
 * after each write and feeds errors back so the model self-corrects within the same turn.
 */

// ── model routing (§A6/A7) ──
const MODEL_CODEGEN = "claude-sonnet-4-6";
const MODEL_PLAN = "claude-opus-4-8";
function pickModel(turn: "codegen" | "plan"): string {
  return turn === "plan" ? MODEL_PLAN : MODEL_CODEGEN;
}

const MAX_ITERATIONS = 8;
const REPAIR_MAX_ITERATIONS = 6; // critic auto-repair — enough for a server+client multi-file fix, still bounded
const MAX_TOKENS = 32000; // claude (sonnet-4-6) handles ≥64K output; high cap → big files rarely truncate mid-tool_use
const AUTO_CONTINUE_MAX = 2; // when a turn caps mid-build, auto-fire "ทำต่อ" this many times before handing back

// Prompt-cache control. 1h TTL so the rulebook + conversation prefix survive the gap between turns —
// the default 5m expires between turns at low traffic, so each turn re-paid the cache WRITE instead of
// a cheap read (real console data: 343K of 5m cache-writes). `ttl` is GA on the API but untyped in this
// SDK version → cast. If a request ever 400s on `ttl`, drop it to `{ type: "ephemeral" }` (5m) — the
// breakpoints still work, just shorter-lived.
const CACHE_CTRL = { type: "ephemeral", ttl: "1h" } as Anthropic.CacheControlEphemeral;

/**
 * Per-request copy of `messages` with a cache breakpoint on the last block of the last message, so the
 * whole conversation prefix is read from cache (0.1×) instead of re-billed in full on every iteration
 * /turn (was the 460K "no-cache" input in the real bill). NEVER mutates the input — the originals are
 * persisted to history WITHOUT cache_control.
 */
function withPrefixCache(messages: Anthropic.MessageParam[]): Anthropic.MessageParam[] {
  if (messages.length === 0) return messages;
  const last = messages[messages.length - 1];
  const blocks: Anthropic.ContentBlockParam[] =
    typeof last.content === "string" ? [{ type: "text", text: last.content }] : last.content.slice();
  if (blocks.length === 0) return messages;
  blocks[blocks.length - 1] = {
    ...blocks[blocks.length - 1],
    cache_control: CACHE_CTRL,
  } as Anthropic.ContentBlockParam;
  const out = messages.slice();
  out[out.length - 1] = { ...last, content: blocks };
  return out;
}

// ── project spec (Guided UX §5 — proposed before generating, confirmed by the user) ──
export interface ProjectSpec {
  title: string;
  summary: string;
  features: string[];
  dataModel?: string[];
  storage?: string;
  outputs?: string[];
}

// ── SSE events emitted to the client ──
export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "status"; text: string } // transient working state for the status bar (not chat)
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "file_mutation"; op: "write" | "edit" | "delete"; path: string; content?: string }
  | { type: "lint"; messages: string[] }
  // a lesson OFFERED to the user at the end of a turn (pending until they keep it — lib/lessons)
  | { type: "lesson"; lesson: { id: string; rule: string; symptom: string; card: string; hits: number } }
  | { type: "spec"; spec: ProjectSpec }
  | { type: "generation"; id: string }
  | { type: "done"; tokens?: number } // tokens = this turn's input+output, for the energy bar
  | { type: "verdict"; ok: boolean; text: string } // Gate-2 run-and-repair result, rendered as an icon card
  // premium camera gate for this turn (lib/premium/camera-gate) — the chat shows a card under the answer;
  // `first` = this turn switched the project to GitHub Pages hosting
  | { type: "camera_gate"; gate: "allowed" | "need-github" | "need-premium"; first?: boolean }
  | { type: "error"; message: string };

export type Emit = (ev: AgentEvent) => void;

// ── tool definitions ──
export const EGS_TOOLS: Anthropic.Tool[] = [
  {
    name: "write_file",
    description: "สร้างหรือแทนที่ไฟล์ทั้งไฟล์ (Code.gs / Index.html / appsscript.json ฯลฯ)",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string", description: "ชื่อไฟล์ เช่น Code.gs, Index.html, appsscript.json" },
        content: { type: "string", description: "เนื้อหาไฟล์ทั้งหมด" },
      },
      required: ["path", "content"],
    },
  },
  {
    name: "edit_file",
    description: "แก้ไฟล์แบบเจาะจงด้วยการแทนข้อความ (old_str ต้องตรงและไม่ซ้ำ)",
    input_schema: {
      type: "object",
      properties: {
        path: { type: "string" },
        old_str: { type: "string", description: "ข้อความเดิมที่จะแทน (ต้อง unique ในไฟล์)" },
        new_str: { type: "string", description: "ข้อความใหม่" },
      },
      required: ["path", "old_str", "new_str"],
    },
  },
  {
    name: "delete_file",
    description: "ลบไฟล์",
    input_schema: {
      type: "object",
      properties: { path: { type: "string" } },
      required: ["path"],
    },
  },
  {
    name: "read_project",
    description: "อ่านไฟล์ทั้งหมดในโปรเจกต์ปัจจุบัน",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "propose_spec",
    description:
      "สรุปสิ่งที่ผู้ใช้ต้องการเป็น spec แล้วแสดงให้ผู้ใช้ยืนยันก่อนเขียนโค้ด — เรียกตอนเริ่มงานใหม่ที่ยังไม่ยืนยัน แล้วหยุดรอผู้ใช้ (อย่าเขียนไฟล์ในเทิร์นเดียวกัน)",
    input_schema: {
      type: "object",
      properties: {
        title: { type: "string", description: "ชื่อระบบสั้น ๆ" },
        summary: { type: "string", description: "สรุประบบ 1-2 ประโยค" },
        features: { type: "array", items: { type: "string" }, description: "ฟีเจอร์หลักเป็นข้อ ๆ" },
        dataModel: {
          type: "array",
          items: { type: "string" },
          description: "ข้อมูล/คอลัมน์ที่เก็บ เช่น ชื่อ, เบอร์โทร, วันที่",
        },
        storage: { type: "string", description: "ที่เก็บข้อมูล เช่น 'Google Sheet ใหม่' หรือ 'ชีทเดิม (ลิงก์)'" },
        outputs: {
          type: "array",
          items: { type: "string" },
          description: "ผลลัพธ์/การกระทำ เช่น ส่งอีเมลยืนยัน, พิมพ์ PDF",
        },
      },
      required: ["title", "summary", "features"],
    },
  },
  {
    name: "read_rule",
    description:
      "อ่าน rule card (กฎละเอียดพร้อมตัวอย่างโค้ด ✗/✓) ตาม id ในตาราง Rule cards — เรียกก่อนเขียนหรือแก้โค้ดส่วนที่ card นั้นครอบคลุม",
    input_schema: {
      type: "object",
      properties: {
        ids: { type: "array", items: { type: "string" }, description: 'id ของ card ที่ต้องการ เช่น ["pdf-generation"]' },
      },
      required: ["ids"],
    },
  },
  {
    name: "save_preference",
    description:
      "บันทึกสิ่งที่ผู้ใช้เลือกเรื่องหน้าตา/ไลบรารีของโปรเจกต์นี้ ให้จำไว้ใช้ในเทิร์นถัดไป — เรียกเมื่อผู้ใช้บอกชัดว่าต้องการแบบไหน (เช่น ใช้ Bootstrap, ไม่เอา SweetAlert) ใส่เฉพาะช่องที่ผู้ใช้พูดถึง",
    input_schema: {
      type: "object",
      properties: {
        // fixed options only — free-text instructions can be written by the user alone (pickAiPrefs)
        ...Object.fromEntries(
          PREF_FIELDS.map((f) => [f.id, { type: "string", enum: f.options.map((o) => o.id), description: f.label }]),
        ),
      },
    },
  },
  {
    name: "propose_lesson",
    description:
      "เสนอบทเรียนหนึ่งข้อหลังจากแก้ข้อผิดพลาดของตัวเองที่โปรเจกต์อื่นอาจเจอซ้ำ — ผู้ใช้เป็นคนตัดสินว่าจะเก็บหรือไม่ (ดูหัวข้อ Lessons) ไม่ใช้กับเรื่องหน้าตาหรือการตัดสินใจเฉพาะโปรเจกต์",
    input_schema: {
      type: "object",
      properties: {
        rule: { type: "string", description: "กฎทั่วไปหนึ่งประโยค ภาษาไทย ไม่มีชื่อโปรเจกต์ ชื่อไฟล์ หรือข้อมูลส่วนตัว" },
        symptom: { type: "string", description: "สิ่งที่ผิดพลาด สั้น ๆ" },
        card: { type: "string", description: "id ของ rule card ที่เกี่ยวข้อง หรือ general" },
        repeatOf: { type: "string", description: "id ของบทเรียนเดิม (เช่น L-0003) ถ้าเป็นการพลาดซ้ำข้อที่มีอยู่แล้ว" },
      },
    },
  },
];

interface ToolOutcome {
  content: string;
  isError: boolean;
}

/**
 * Path allowlist — the AI controls the file path; only flat GAS file names are valid.
 * Blocks path traversal / odd names that would corrupt the deployed Apps Script project.
 */
const VALID_GAS_PATH = /^[A-Za-z0-9_-]+\.(gs|html|json)$/;
function isValidGasPath(p: string): boolean {
  return VALID_GAS_PATH.test(p) && !p.includes("..") && !p.includes("/") && !p.includes("\\");
}

async function lintWritten(projectId: string, path: string, content: string, emit: Emit): Promise<ToolOutcome> {
  // the camera findings are skipped for a premium project published to GitHub Pages (camera-gate)
  const allowCamera = cameraAllowedFor(await getProject(projectId).catch(() => null));
  const { errors } = validateGasFiles([{ name: path, content }], { isWebApp: false, allowCamera });
  if (errors.length > 0) {
    noteLintIssues(projectId, errors); // judged for lessons at the end of the turn
    const messages = errors.map((e) => e.message);
    emit({ type: "lint", messages });
    return {
      isError: true,
      content: `บันทึก ${path} แล้ว แต่ผิดกติกา GAS:\n${messages.map((m) => "- " + m).join("\n")}\nแก้แล้วบันทึกใหม่`,
    };
  }
  return { isError: false, content: `บันทึก ${path} เรียบร้อย` };
}

export async function executeEgsTool(
  projectId: string,
  name: string,
  input: Record<string, unknown>,
  emit: Emit,
): Promise<ToolOutcome> {
  try {
    if (
      (name === "write_file" || name === "edit_file" || name === "delete_file") &&
      !isValidGasPath(String(input.path ?? ""))
    ) {
      return {
        isError: true,
        content: `ชื่อไฟล์ไม่ถูกต้อง: "${String(input.path ?? "")}" — ใช้ได้เฉพาะ <ชื่อ>.gs / <ชื่อ>.html / appsscript.json (ห้ามมี / หรือ ..)`,
      };
    }
    if (name === "write_file") {
      const path = String(input.path);
      const content = String(input.content ?? "");
      await writeFile(projectId, path, content);
      emit({ type: "file_mutation", op: "write", path, content });
      return lintWritten(projectId, path, content, emit);
    }
    if (name === "edit_file") {
      const path = String(input.path);
      const oldStr = String(input.old_str ?? "");
      const newStr = String(input.new_str ?? "");
      const file = await getFile(projectId, path);
      if (!file) return { isError: true, content: `ไม่พบไฟล์ ${path}` };
      const occurrences = file.content.split(oldStr).length - 1;
      if (occurrences === 0) return { isError: true, content: `ไม่พบข้อความที่จะแก้ใน ${path}` };
      if (occurrences > 1)
        return { isError: true, content: `พบข้อความซ้ำ ${occurrences} ที่ใน ${path} — ใส่ context ให้ unique` };
      const at = file.content.indexOf(oldStr); // not String.replace: "$&", "$'" in GAS code would be expanded
      const updated = file.content.slice(0, at) + newStr + file.content.slice(at + oldStr.length);
      await writeFile(projectId, path, updated);
      emit({ type: "file_mutation", op: "edit", path, content: updated });
      return lintWritten(projectId, path, updated, emit);
    }
    if (name === "delete_file") {
      const path = String(input.path);
      await deleteFile(projectId, path);
      emit({ type: "file_mutation", op: "delete", path });
      return { isError: false, content: `ลบ ${path} แล้ว` };
    }
    if (name === "read_project") {
      const files = await getFiles(projectId);
      const body = files.map((f) => `=== ${f.path} ===\n${f.content}`).join("\n\n");
      return { isError: false, content: body || "(ยังไม่มีไฟล์)" };
    }
    if (name === "propose_spec") {
      const spec: ProjectSpec = {
        title: String(input.title ?? ""),
        summary: String(input.summary ?? ""),
        features: Array.isArray(input.features) ? input.features.map(String) : [],
        dataModel: Array.isArray(input.dataModel) ? input.dataModel.map(String) : undefined,
        storage: input.storage ? String(input.storage) : undefined,
        outputs: Array.isArray(input.outputs) ? input.outputs.map(String) : undefined,
      };
      // persist (merge — keep creation-time keys like webOnlyReasons) for later re-check
      try {
        const current = await getProject(projectId);
        await updateProject(projectId, { spec: { ...(current?.spec ?? {}), ...spec } });
      } catch (e) {
        console.error("[agent] store spec failed:", e);
      }
      emit({ type: "spec", spec });
      return {
        isError: false,
        content:
          "แสดงสรุป spec ให้ผู้ใช้แล้ว — จบเทิร์นนี้ รอผู้ใช้กด 'สร้างเลย' หรือบอกที่อยากแก้ ก่อนค่อยเขียนไฟล์ (อย่าเรียก tool อื่นต่อในเทิร์นนี้)",
      };
    }
    if (name === "read_rule") {
      const project = await getProject(projectId);
      if (!project) return { isError: true, content: "ไม่พบโปรเจกต์" };
      return readRuleCards(project, input.ids ?? input.id);
    }
    if (name === "save_preference") return saveProjectPreference(projectId, input);
    if (name === "propose_lesson") return proposeLesson(projectId, input);
    return { isError: true, content: `ไม่รู้จัก tool: ${name}` };
  } catch (e) {
    console.error(`[agent] tool ${name} failed:`, e);
    return { isError: true, content: `เครื่องมือ ${name} ทำงานผิดพลาด — ลองใหม่หรือปรับวิธี` };
  }
}

export interface RunAgentArgs {
  projectId: string;
  project: EgsProject;
  userMessage: string;
  /** Reference images attached to this turn (already stored by the route). Fed to the model once. */
  images?: AttachedImage[];
  turn?: "codegen" | "plan";
  /** iteration cap for this turn (critic repair passes a smaller value). Defaults to MAX_ITERATIONS. */
  maxIterations?: number;
  /** internal turn (e.g. the critic auto-repair) — suppresses user-facing "hit the cap" notes */
  internal?: boolean;
  /** BYOK: the user's own Anthropic key. Omit to use the platform key (ANTHROPIC_API_KEY). */
  apiKey?: string;
  /** The model the user picked for this message; absent = the engine's own default for the turn. */
  model?: string;
  /** Skip the Gate-1 rulebook critic (e.g. Gate-2 verify repairs — execution is the stronger oracle). */
  skipCritic?: boolean;
  /** Strip reasoning_content from OpenAI-format history — for a repair escalated to a DIFFERENT arm
   *  (e.g. a deepseek-pro project repaired on GLM) whose model must not receive the origin model's CoT. */
  stripHistoryReasoning?: boolean;
  /** Rule cards the app matched to this request (turnContextFor) — sent with the user message for
   *  this turn only, never stored in history. Set by the loops; callers leave it unset. */
  turnContext?: string;
  emit: Emit;
}

/**
 * The per-turn rule-card context for a user request (lib/rulebook/context), computed ONCE and reused
 * by the auto-continue rounds. Best-effort: a rulebook problem must never block the user's turn.
 */
export async function turnContextFor(args: RunAgentArgs): Promise<string> {
  if (args.internal) return "";
  try {
    const hasFiles = (await getFiles(args.projectId)).length > 0;
    const ctx = await buildTurnContext({
      project: args.project,
      userMessage: args.userMessage,
      hasFiles,
      access: { via: "tool" },
      inline: true,
    });
    return ctx.text;
  } catch (e) {
    console.error("[agent] rule-card context failed (non-fatal):", e);
    return "";
  }
}

export interface AgentRunResult {
  inputTokens: number;
  outputTokens: number;
  /** Anthropic cache token split (true COGS). Optional — the OpenAI-format loop omits it (logged as 0). */
  cacheReadTokens?: number;
  cacheCreationTokens?: number;
  criticIssues: number;
  /** How the rulebook critic ran: null (didn't run) | clean | issues | skipped | degraded (P1-1/1-3). */
  criticStatus?: string | null;
}

/** Token usage of a single turn — also stashed on a thrown error so a route can log partial COGS. */
export interface TurnUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

/** Read partial usage stashed on an error thrown mid-turn (so an aborted run still meters tokens). */
export function errorUsage(e: unknown): TurnUsage | undefined {
  const u = (e as { __egsUsage?: TurnUsage } | null)?.__egsUsage;
  return u && typeof u.inputTokens === "number" ? u : undefined;
}

export async function runAgentLoop(args: RunAgentArgs): Promise<AgentRunResult> {
  const client = new Anthropic(args.apiKey ? { apiKey: args.apiKey } : undefined); // BYOK or platform key
  const turnContext = await turnContextFor(args);
  const main = await runTurn(client, { ...args, turnContext });
  let inputTokens = main.inputTokens;
  let outputTokens = main.outputTokens;
  let cacheReadTokens = main.cacheReadTokens;
  let cacheCreationTokens = main.cacheCreationTokens;
  let criticIssues = 0;
  let criticStatus: string | null = null;
  const isCodegen = (args.turn ?? "codegen") === "codegen";

  // Auto-continue: a big build can hit the per-turn token/iteration cap mid-way (a file left half- or
  // un-written). Instead of waiting for the user to type "ทำต่อ", fire it ourselves a couple of times.
  // Each round streams its own tool_call/file_mutation events, so the chat status keeps showing live
  // progress ("กำลังเขียนไฟล์ …"). Tokens accumulate → the energy tank + metrics stay accurate.
  let mutated = main.mutated;
  let capped = main.capped;
  for (let round = 1; isCodegen && capped && mutated && round <= AUTO_CONTINUE_MAX; round++) {
    args.emit({ type: "status", text: `เนื้อหายาว — กำลังเขียนต่อให้อัตโนมัติ (${round}/${AUTO_CONTINUE_MAX})…` });
    // images:[] — the reference images were already fed on the first round; re-sending them here
    // re-bills the vision tokens every auto-continue and writes a false "(แนบรูป N รูป)" note.
    const cont = await runTurn(client, { ...args, images: [], userMessage: "ทำต่อ", turnContext });
    inputTokens += cont.inputTokens;
    outputTokens += cont.outputTokens;
    cacheReadTokens += cont.cacheReadTokens;
    cacheCreationTokens += cont.cacheCreationTokens;
    mutated = mutated || cont.mutated;
    capped = cont.capped;
  }

  // Gate 1 — rulebook critic + one bounded auto-repair. Only when the build actually changed files
  // AND finished (not still capped after auto-continue): a pure Q&A turn writes nothing, and a still-
  // incomplete build would get a misleading "✓ ผ่าน" — the user already saw the "พิมพ์ทำต่อ" nudge.
  if (isCodegen && mutated && !capped && !args.skipCritic) {
    const c = await runCriticGate(client, args);
    criticIssues = c.issues;
    criticStatus = c.criticStatus;
    inputTokens += c.inputTokens;
    outputTokens += c.outputTokens;
    cacheReadTokens += c.cacheReadTokens;
    cacheCreationTokens += c.cacheCreationTokens;
  }
  // NOTE: the route emits `generation` (with the logged id) then `done`.
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, criticIssues, criticStatus };
}

/**
 * One model turn: stream → resolve tool_use in a loop → persist. Does NOT emit `done`.
 * Returns whether any file was created/edited/deleted this turn (gates the critic).
 */
async function runTurn(
  client: Anthropic,
  {
    projectId,
    project,
    userMessage,
    images = [],
    turn = "codegen",
    maxIterations = MAX_ITERATIONS,
    internal = false,
    turnContext = "",
    model,
    emit,
  }: RunAgentArgs,
): Promise<{
  mutated: boolean;
  capped: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}> {
  const history = await getHistory(projectId);

  // Rule cards matched to this request ride on the user message, so the cached system block stays
  // byte-identical (preserves the prompt-cache hit).
  const effectiveUserMessage = turnContext ? `${turnContext}\n\n---\n${userMessage}` : userMessage;

  // Multimodal: when reference images are attached, the user turn is an [image…, text] block array;
  // otherwise keep it a plain string (cheaper, and the common path). media_type is pre-validated
  // against the Anthropic image union in parseAttachedImages.
  const userContent: Anthropic.MessageParam["content"] = images.length
    ? [
        ...images.map(
          (img): Anthropic.ImageBlockParam => ({
            type: "image",
            source: {
              type: "base64",
              media_type: img.mediaType as Anthropic.Base64ImageSource["media_type"],
              data: img.dataBase64,
            },
          }),
        ),
        { type: "text", text: effectiveUserMessage } satisfies Anthropic.TextBlockParam,
      ]
    : effectiveUserMessage;

  const messages: Anthropic.MessageParam[] = [
    ...history,
    { role: "user", content: userContent },
  ];

  // Block 1 = core rulebook + rule-card index: identical for every project, so it is cached
  // (model-scoped — keep byte-identical). Block 2 = this project's look & feel: small, after the
  // cache breakpoint so one project's choices never invalidate the shared cache.
  const parts = await buildSystemPromptParts(project, { via: "tool" }, { via: "tool" }, { via: "tool" });
  const system: Anthropic.TextBlockParam[] = [
    { type: "text", text: parts.core, cache_control: CACHE_CTRL },
    { type: "text", text: parts.prefs },
  ];

  let mutated = false; // did any write/edit/delete actually change a file this turn?
  let capped = false; // did the turn stop early (iteration cap / truncation) with work pending?
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;

  let flushed = false;
  // Persist this turn EXACTLY ONCE — from the normal exit AND from a mid-loop throw (provider
  // 500/timeout) — so files written this turn always keep matching history (P0-3). A container
  // restart mid-run can still skip it; getHistory() sanitizes any orphan blocks as a backstop.
  const flushTurn = async (isError: boolean): Promise<void> => {
    if (flushed) return;
    flushed = true;

    // A throw between pushing an assistant tool_use turn and pushing its tool_results leaves a
    // trailing assistant with an UNRESOLVED tool_use — persisting it 400s the next request. Drop it.
    const lastMsg = messages[messages.length - 1];
    if (
      lastMsg?.role === "assistant" &&
      Array.isArray(lastMsg.content) &&
      lastMsg.content.some((b) => (b as { type?: string }).type === "tool_use")
    ) {
      messages.pop();
    }

    // If the tail is a resolved-but-trailing tool_result (iteration cap, or a throw right after a
    // tool round), close the turn on an assistant message so the next turn doesn't start with two
    // user messages / an unresolved tool_use.
    const tail = messages[messages.length - 1];
    const dangling =
      tail?.role === "user" &&
      Array.isArray(tail.content) &&
      tail.content.some((b) => (b as { type?: string }).type === "tool_result");
    if (dangling) {
      capped = true;
      messages.pop(); // tool_result (user)
      messages.pop(); // assistant tool_use turn
      const note = internal
        ? "(แก้บางส่วนในรอบตรวจคุณภาพ)"
        : isError
          ? "(หยุดกลางคัน — ระบบขัดข้อง ลองสั่งต่อได้ครับ)"
          : "หยุดไว้ก่อน — ถึงขีดจำกัดรอบการแก้ในเทิร์นนี้ พิมพ์บอกต่อได้เลยครับ";
      if (!internal && !isError) emit({ type: "text", delta: "\n" + note });
      messages.push({ role: "assistant", content: note });
    }

    // persist the new turn(s) for resume (egs_files is the source of truth for code). Store the
    // user's ORIGINAL message as TEXT only — never the rule-card prefix nor the image blocks.
    const persisted = messages.slice(history.length);
    if (persisted[0]?.role === "user" && (turnContext || images.length)) {
      const note = images.length ? `\n\n(แนบรูปอ้างอิง ${images.length} รูป)` : "";
      persisted[0] = { role: "user", content: userMessage + note };
    }
    // Only persist a turn that ENDS on an assistant message — a lone user turn (provider threw on
    // the first call) would create consecutive user messages next turn, and nothing was produced.
    if (persisted.length === 0 || persisted[persisted.length - 1]?.role !== "assistant") return;
    try {
      await appendMessages(projectId, persisted, turn);
    } catch (pe) {
      console.error("[agent] persist failed:", pe);
      if (!isError) throw pe; // surface a real persist failure on the normal path
    }
  };

  try {
  for (let iter = 0; iter < maxIterations; iter++) {
    const stream = client.messages.stream({
      model: model || pickModel(turn),
      max_tokens: MAX_TOKENS,
      system,
      tools: EGS_TOOLS,
      messages: withPrefixCache(messages),
    });
    stream.on("text", (delta: string) => emit({ type: "text", delta }));

    const final = await stream.finalMessage();
    inputTokens += final.usage?.input_tokens ?? 0;
    outputTokens += final.usage?.output_tokens ?? 0;
    cacheReadTokens += final.usage?.cache_read_input_tokens ?? 0;
    cacheCreationTokens += final.usage?.cache_creation_input_tokens ?? 0;

    // Truncated mid-tool_use (e.g. stop_reason "max_tokens" while emitting a large write_file):
    // the assistant message carries a tool_use we can't resolve. Persisting it poisons history
    // ("tool_use ids without tool_result" → every later request 400s). Keep only the text and stop.
    if (final.stop_reason !== "tool_use" && final.content.some((b) => b.type === "tool_use")) {
      const textBlocks = final.content.filter((b) => b.type === "text");
      messages.push({
        role: "assistant",
        content: (textBlocks.length
          ? textBlocks
          : "เนื้อหายาวเกินรอบเดียว") as Anthropic.MessageParam["content"],
      });
      capped = true;
      if (!internal)
        emit({
          type: "text",
          delta: '\n\n(เนื้อหายาวเกินขีดจำกัดรอบเดียว — พิมพ์ "ทำต่อ" ให้เขียนส่วนที่เหลือได้ครับ)',
        });
      break;
    }

    messages.push({
      role: "assistant",
      content: final.content as Anthropic.MessageParam["content"],
    });

    if (final.stop_reason !== "tool_use") break;

    const toolResults: Anthropic.ToolResultBlockParam[] = [];
    for (const block of final.content) {
      if (block.type !== "tool_use") continue;
      emit({ type: "tool_call", name: block.name, input: block.input });
      const outcome = await executeEgsTool(
        projectId,
        block.name,
        block.input as Record<string, unknown>,
        emit,
      );
      if (block.name === "write_file" || block.name === "delete_file") mutated = true;
      else if (block.name === "edit_file" && !outcome.isError) mutated = true;
      toolResults.push({
        type: "tool_result",
        tool_use_id: block.id,
        content: outcome.content,
        is_error: outcome.isError,
      });
    }

    // project-level lint (catches missing required files across the whole project)
    if (toolResults.length > 0) {
      const all = await getFiles(projectId);
      const plint = validateGasFiles(
        all.map((f) => ({ name: f.path, content: f.content })),
        { isWebApp: project.kind !== "bound", allowCamera: cameraAllowedFor(project) },
      );
      noteLintIssues(projectId, [...plint.errors, ...plint.warnings], { midBuild: true });
      const inScope = await lintScope(project);
      const issues = [...plint.errors, ...plint.warnings].filter((i) => inScope(i.file)).map((i) => i.message);
      if (issues.length > 0) {
        const lastTr = toolResults[toolResults.length - 1];
        lastTr.content = `${lastTr.content}\n\n[ตรวจทั้งโปรเจกต์]\n${issues.map((m) => "- " + m).join("\n")}`;
        // Project-wide ERRORS (missing include file, getActiveSpreadsheet in a web app) are
        // blocking — mark the tool_result as an error so the model FIXES them instead of ending
        // the turn on a "success" that hides them (QUALITY-MOAT §3). Warnings stay non-blocking.
        if (plint.errors.length > 0) lastTr.is_error = true;
      }
    }
    messages.push({ role: "user", content: toolResults });
  }

  await flushTurn(false);
  } catch (e) {
    // A mid-loop throw (provider 5xx/timeout) still flushes what was produced so history matches
    // the files already written this turn, then stashes partial usage so the route can meter it.
    await flushTurn(true).catch((fe) => console.error("[agent] flush-on-error failed:", fe));
    (e as { __egsUsage?: TurnUsage }).__egsUsage = {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens,
    };
    throw e;
  }
  return { mutated, capped, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens };
}

/**
 * Gate 1 — rulebook critic (QUALITY-MOAT §2). One cheap LLM-as-judge review that catches semantic
 * best-practice violations gate 0 (regex lint) cannot, then runs ONE bounded auto-repair turn.
 * Findings are surfaced through the existing `text`/`lint` events (no client change). Non-fatal:
 * a critic failure never blocks the user's result.
 */
async function runCriticGate(
  client: Anthropic,
  args: RunAgentArgs,
): Promise<{
  issues: number;
  criticStatus: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}> {
  const { projectId, project, emit } = args;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  const acc = (t: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  }) => {
    inputTokens += t.inputTokens;
    outputTokens += t.outputTokens;
    cacheReadTokens += t.cacheReadTokens ?? 0;
    cacheCreationTokens += t.cacheCreationTokens ?? 0;
  };
  const totals = (issues: number, criticStatus: string) => ({
    issues,
    criticStatus,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
  });
  try {
    // Show the working state in the status bar (like "เขียนไฟล์…" during codegen), not as a chat
    // bubble — keeps transient progress out of the conversation. Persistent results stay in chat.
    emit({ type: "status", text: "กำลังตรวจสอบความถูกต้องของโค้ด…" });
    const review = await reviewProject(project, projectId);
    acc(review); // the review costs tokens even when it passes — always count it
    // P1-1: an unparseable/truncated verdict is NOT a clean pass — say so, never emit ✓.
    if (review.degraded) {
      emit({
        type: "text",
        delta: "\n\n⚠️ ตรวจคุณภาพอัตโนมัติไม่สมบูรณ์รอบนี้ (อ่านผลตรวจไม่ได้) — กดปุ่ม “ตรวจซ้ำ” ได้ ไม่กระทบโค้ด",
      });
      return totals(0, "degraded");
    }
    if (review.issues.length === 0) {
      emit({ type: "text", delta: "\n\n✓ ตรวจคุณภาพ (rulebook critic) — ผ่าน" });
      return totals(0, "clean");
    }

    const lines = review.issues.map(
      (i) => `- [${i.severity}] ${i.file}: ${i.problem} → ${i.fix}`,
    );
    emit({ type: "text", delta: `\n\n🔍 ตรวจคุณภาพพบ ${review.issues.length} จุด:\n${lines.join("\n")}` });

    const actionable = review.issues.filter((i) => i.severity !== "low");
    if (actionable.length === 0) return totals(review.issues.length, "issues");

    emit({ type: "status", text: "กำลังแก้ตามผลตรวจคุณภาพ…" });
    const repairMsg =
      "ตรวจคุณภาพ (rulebook critic) พบปัญหาต่อไปนี้ แก้ไฟล์ที่เกี่ยวข้องให้เรียบร้อยด้วย edit_file/write_file:\n" +
      actionable.map((i) => `- ${i.file}: ${i.problem} — แนวทาง: ${i.fix}`).join("\n");
    const repair = await runTurn(client, {
      ...args,
      images: [], // repair is a derived turn — don't re-send/re-bill the original images
      userMessage: repairMsg,
      turn: "codegen",
      maxIterations: REPAIR_MAX_ITERATIONS,
      internal: true,
    });
    acc(repair);

    // P1-2: re-run the critic ONCE to report what actually got fixed — don't just assert "✓ แก้แล้ว".
    let remaining = actionable.length;
    try {
      const after = await reviewProject(project, projectId);
      acc(after);
      if (!after.degraded) remaining = after.issues.filter((i) => i.severity !== "low").length;
    } catch (e) {
      console.error("[agent] post-repair re-review failed (non-fatal):", e);
    }
    const fixed = Math.max(0, actionable.length - remaining);
    if (remaining === 0) {
      emit({ type: "text", delta: "\n\n✓ แก้ตามผลตรวจคุณภาพแล้ว (ครบทุกจุด)" });
    } else {
      emit({
        type: "text",
        delta: `\n\n✓ แก้แล้ว ${fixed}/${actionable.length} จุด — เหลืออีก ${remaining} จุด พิมพ์ “แก้ต่อ” ได้ครับ`,
      });
    }
    return totals(review.issues.length, "issues");
  } catch (e) {
    // P1-3: a SKIPPED review is NOT a clean pass — neutral warning, no ✓, no "กด Deploy ได้เลย".
    console.error("[agent] critic gate failed (non-fatal):", e);
    emit({
      type: "text",
      delta: "\n\n⚠️ ข้ามการตรวจคุณภาพอัตโนมัติรอบนี้ (ระบบตรวจไม่พร้อม) — กดปุ่ม “ตรวจซ้ำ” ได้ ไม่กระทบโค้ด",
    });
    return totals(0, "skipped");
  }
}
