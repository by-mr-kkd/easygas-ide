import { spawn } from "node:child_process";
import { existsSync, realpathSync, statSync } from "node:fs";
import { mkdir, readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRunResult, Emit } from "@/lib/anthropic-agent";
import type { AttachedImage } from "@/lib/chat-images";
import { childEnv } from "@/lib/child-env";
import { locateCli } from "@/lib/engines/cli-locate";
import { CODEX_ANSWER_SCHEMA, CodexAnswerError, codexDisableFlags, parseFeatureList } from "@/lib/engines/codex-answer";
import {
  applyAnswer,
  buildTurnPrompt,
  instructionsFor,
  jsonAnswerAdapter,
  projectLintErrors,
  stageImages,
  turnImagesDir,
} from "@/lib/engines/json-answer-turn";
import { markSessionCaughtUp, readEngineSession, recapFor, saveEngineSession } from "@/lib/engines/session-context";
import { planSession, settingsNotice, toldAfterFailure } from "@/lib/engines/session-prompt";
import { engineDir } from "@/lib/local/paths";
import { appendMessages } from "@/lib/messages";
import { getProject } from "@/lib/projects";
import { parseCodexModels, type CodexModel } from "@/lib/engines/codex-models";
import type { EgsProject } from "@/types/db";

/**
 * Subscription engine #2: drives the user's OWN installed, logged-in OpenAI Codex CLI (`codex exec`).
 *
 * Codex is run as a pure model, with no reach into the machine at all:
 *  - every Codex feature that is on is switched off except known-harmless internals (an allowlist,
 *    codexDisableFlags), web search is off, and the sandbox is read-only as a further layer — verified:
 *    Codex then has no tool that reads or writes files, and it cannot open a file planted nearby;
 *  - it runs in an EMPTY folder of its own (engine/codex/work), with project docs off, the user's
 *    ~/.codex/config.toml and execpolicy rules ignored (--ignore-user-config, --ignore-rules), so
 *    nothing from the user's other Codex use — MCP servers, plugins, agents — joins in;
 *  - the app sends the project's current files and the matching rule cards in the message, and Codex
 *    answers with ONE JSON object (--output-schema, lib/engines/codex-answer.ts). The app applies the
 *    changes itself through the same path checks and lint as the API engines (executeEgsTool).
 * Instructions go in a file (model_instructions_file): ~37 KB does not fit a Windows command line.
 * A resumed session keeps the instructions it started with (verified), so changed settings travel in
 * the message, exactly as for Claude Code (lib/engines/session-prompt.ts).
 * Login stays Codex's own (CODEX_HOME); the app never reads it. Provider API keys are stripped from the
 * child's environment so a stray OPENAI_API_KEY cannot move the user off their ChatGPT plan.
 */

const TURN_TIMEOUT_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 30_000;
const DEAD_SESSION = /no rollout found|thread\/resume failed|session not found|thread not found/i;
const NOT_LOGGED_IN = /not logged in|please (log|sign) ?in|codex login|unauthori[sz]ed|\b401 unauthori/i;
/** Codex thread ids are UUIDs; anything else is never put on a command line. */
const THREAD_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_LINE_CHARS = 8_000_000;

const ENGINE = "codex";
const ENGINE_ID = "codex-cli" as const;
const CODEX_ADAPTER = jsonAnswerAdapter("Codex");

export class CodexNotFoundError extends Error {
  readonly code = "CODEX_CLI_NOT_FOUND";
  constructor() {
    super("ไม่พบ Codex ในเครื่องนี้ ดูวิธีติดตั้งในหน้า ตั้งค่า → AI ที่ใช้สร้างโค้ด แล้วล็อกอินด้วยบัญชี ChatGPT");
  }
}

class CodexTurnError extends Error {
  constructor(
    message: string,
    readonly threadId: string | null,
  ) {
    super(message);
  }
}

/** Locate the codex executable (spawned directly — never through a shell or .cmd shim). */
export function findCodexExecutable(override?: string): string | null {
  return locateCli("codex", { env: process.env, platform: process.platform, exists: existsSync, override });
}

const PROBE_OUTPUT_MAX = 200_000;

/** Run a short codex command and collect its output (version, login status, feature list, model catalog). */
function codexOutput(exe: string, args: string[], maxOut = PROBE_OUTPUT_MAX): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (v: { code: number | null; out: string }) => {
      if (!settled) {
        settled = true;
        resolve(v);
      }
    };
    let child;
    try {
      child = spawn(exe, args, { env: childEnv({}), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return done({ code: null, out: "" });
    }
    const timer = setTimeout(() => {
      child.kill();
      done({ code: null, out });
    }, PROBE_TIMEOUT_MS);
    const take = (d: Buffer) => {
      if (out.length < maxOut) out += d.toString("utf8");
    };
    child.stdout.on("data", take);
    child.stderr.on("data", take);
    child.on("error", () => {
      clearTimeout(timer);
      done({ code: null, out });
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      done({ code, out });
    });
  });
}

const MODELS_TTL_MS = 10 * 60 * 1000;
let modelsCache: { at: number; models: CodexModel[] } | null = null;

/**
 * The models this Codex can use, from its own catalog (`codex debug models`); [] when it cannot say
 * (an older CLI). Remembered for a few minutes: the chat's AI picker asks on every open.
 */
export async function codexModels(exe: string): Promise<CodexModel[]> {
  if (modelsCache && Date.now() - modelsCache.at < MODELS_TTL_MS) return modelsCache.models;
  // the catalog is big (every model's reasoning levels and tiers): about half a megabyte today
  const r = await codexOutput(exe, ["debug", "models"], 4_000_000);
  const models = r.code === 0 ? parseCodexModels(r.out) : [];
  if (models.length > 0) modelsCache = { at: Date.now(), models };
  return models;
}

/** Version line (e.g. "codex-cli 0.156.1") and whether the user is signed in, for Settings. */
export async function codexStatus(exe: string): Promise<{ version: string | null; loggedIn: boolean; account: string | null }> {
  const [v, login] = await Promise.all([codexOutput(exe, ["--version"]), codexOutput(exe, ["login", "status"])]);
  const version = v.code === 0 ? (v.out.split(/\r?\n/).find((l) => l.trim())?.trim().slice(0, 80) ?? null) : null;
  const line = login.out.split(/\r?\n/).find((l) => /logged in/i.test(l))?.trim() ?? "";
  const loggedIn = login.code === 0 && /logged in/i.test(line) && !/not logged in/i.test(line);
  // "Logged in using ChatGPT" / "Logged in using an API key" — the method only, never the token
  const account = loggedIn ? (/using (.+)$/i.exec(line)?.[1]?.slice(0, 40) ?? null) : null;
  return { version, loggedIn, account };
}

// `codex features list` per executable version (it changes only when Codex updates)
const g = globalThis as unknown as { __egsCodexFlags?: Map<string, string[] | null> };
const flagCache = (g.__egsCodexFlags ??= new Map<string, string[] | null>());

async function disableFlags(exe: string): Promise<string[] | null> {
  let stamp = exe;
  try {
    const s = statSync(exe);
    stamp = `${exe}|${s.size}|${s.mtimeMs}`;
  } catch {
    /* keep the path */
  }
  if (flagCache.has(stamp)) return flagCache.get(stamp)!;
  const r = await codexOutput(exe, ["features", "list"]);
  if (r.code !== 0) return null; // a timeout or a hiccup — not cached, the next turn asks again
  const flags = codexDisableFlags(parseFeatureList(r.out));
  flagCache.set(stamp, flags);
  return flags;
}

interface CodexFiles {
  /** Absent for a one-shot (the review): Codex then keeps its own instructions and answers in free text. */
  instructionsFile?: string;
  schemaFile?: string;
  lastMessageFile: string;
  /** Long path of the empty working folder Codex runs in. */
  workDir: string;
}

async function prepareFiles(project: EgsProject): Promise<CodexFiles> {
  const dir = join(engineDir(project.id), "codex");
  const work = join(dir, "work");
  await rm(work, { recursive: true, force: true }); // always empty: nothing for Codex to discover
  await mkdir(work, { recursive: true });
  const schemaFile = join(dir, "answer.schema.json");
  await fsWriteFile(schemaFile, JSON.stringify(CODEX_ANSWER_SCHEMA), "utf8");
  return {
    instructionsFile: join(dir, "instructions.md"),
    schemaFile,
    lastMessageFile: join(dir, "last-message.json"),
    workDir: realpathSync.native(work),
  };
}

interface CodexRun {
  threadId: string | null;
  answerText: string;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
}

interface RunOpts {
  exe: string;
  files: CodexFiles;
  flags: string[];
  prompt: string;
  resumeId: string | null;
  model?: string;
  images: string[];
  emit: Emit;
}

function runCodex(opts: RunOpts): Promise<CodexRun> {
  const toml = (s: string) => JSON.stringify(s); // a JSON string is a valid TOML basic string
  const common = [
    "--json",
    "--skip-git-repo-check",
    "--ignore-user-config",
    "--ignore-rules",
    ...opts.flags,
    ...(opts.files.instructionsFile ? ["-c", `model_instructions_file=${toml(opts.files.instructionsFile)}`] : []),
    "-c",
    "project_doc_max_bytes=0",
    "-c",
    'web_search="disabled"',
    ...(opts.files.schemaFile ? ["--output-schema", opts.files.schemaFile] : []),
    "-o",
    opts.files.lastMessageFile,
    ...(opts.model ? ["-m", opts.model] : []),
    ...opts.images.flatMap((p) => ["-i", p]),
  ];
  if (opts.resumeId && !THREAD_ID.test(opts.resumeId)) return Promise.reject(new CodexTurnError("invalid session id", null));
  const args = opts.resumeId
    ? ["exec", "resume", ...common, "-c", 'sandbox_mode="read-only"', opts.resumeId, "-"]
    : ["exec", ...common, "-C", opts.files.workDir, "-s", "read-only", "-"];

  return new Promise((resolve, reject) => {
    const child = spawn(opts.exe, args, {
      cwd: opts.files.workDir,
      env: childEnv({ NO_COLOR: "1" }),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(opts.prompt, "utf8");

    let buf = "";
    let stderr = "";
    let threadId: string | null = null;
    let usage = { input: 0, output: 0, cached: 0 };
    let lastAgentText = "";
    let failure = "";
    const onEvent = (ev: Record<string, unknown>) => {
      if (ev.type === "thread.started" && typeof ev.thread_id === "string" && THREAD_ID.test(ev.thread_id)) threadId = ev.thread_id;
      else if (ev.type === "turn.started") opts.emit({ type: "status", text: "Codex กำลังเขียนโค้ด…" });
      else if (ev.type === "item.completed") {
        const item = (ev.item ?? {}) as Record<string, unknown>;
        if (item.type === "agent_message" && typeof item.text === "string") lastAgentText = item.text;
        else if (item.type === "reasoning") opts.emit({ type: "status", text: "Codex กำลังคิด…" });
      } else if (ev.type === "turn.completed") {
        const u = (ev.usage ?? {}) as Record<string, number>;
        usage = { input: u.input_tokens ?? 0, output: (u.output_tokens ?? 0) + (u.reasoning_output_tokens ?? 0), cached: u.cached_input_tokens ?? 0 };
      } else if (ev.type === "turn.failed" || ev.type === "error") {
        const e = (ev.error ?? ev) as Record<string, unknown>;
        failure = String(e.message ?? JSON.stringify(e)).slice(0, 400);
      }
    };
    const parseLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      try {
        onEvent(JSON.parse(line) as Record<string, unknown>);
      } catch {
        /* non-JSON noise */
      }
    };
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      if (buf.length > MAX_LINE_CHARS) buf = ""; // one runaway line: drop it, the answer comes from -o
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        parseLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 20_000) stderr += d.toString("utf8");
    });
    const timer = setTimeout(() => child.kill(), TURN_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new CodexTurnError(e.message, threadId));
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      parseLine(buf);
      // -o holds exactly the final message; fall back to the last agent message in the stream
      const fromFile = await readFile(opts.files.lastMessageFile, "utf8").catch(() => "");
      const answerText = fromFile.trim() || lastAgentText;
      if (code !== 0 || failure || !answerText) {
        const detail = (failure || stderr.trim().split(/\r?\n/).slice(-3).join(" ") || `exit ${code}`).slice(0, 400);
        console.error("[codex-cli] turn failed:", detail);
        reject(new CodexTurnError(detail, threadId));
        return;
      }
      resolve({ threadId, answerText, inputTokens: usage.input, outputTokens: usage.output, cachedTokens: usage.cached });
    });
  });
}

/** Run a turn; if the stored session is gone (cleared history, a Codex update), start a fresh one. */
async function runWithRecovery(opts: RunOpts, freshPrompt: () => string): Promise<CodexRun & { resumed: boolean }> {
  await rm(opts.files.lastMessageFile, { force: true });
  try {
    return { ...(await runCodex(opts)), resumed: !!opts.resumeId };
  } catch (e) {
    const msg = (e as Error).message;
    if (!opts.resumeId || !(DEAD_SESSION.test(msg) || msg === "invalid session id")) throw e;
    console.warn("[codex-cli] stored session is gone — starting a new one");
    await rm(opts.files.lastMessageFile, { force: true });
    return { ...(await runCodex({ ...opts, resumeId: null, prompt: freshPrompt() })), resumed: false };
  }
}

export interface CodexCliArgs {
  projectId: string;
  project: EgsProject;
  userMessage: string;
  images: AttachedImage[];
  model?: string;
  executable?: string;
  emit: Emit;
}

/** One chat turn on the Codex engine, plus one bounded repair when changes failed or the lint finds errors. */
export async function runCodexCliTurn(args: CodexCliArgs): Promise<AgentRunResult> {
  const exe = findCodexExecutable(args.executable);
  if (!exe) throw new CodexNotFoundError();
  const flags = await disableFlags(exe);
  if (!flags) {
    throw new Error("Codex รุ่นที่ติดตั้งอยู่ปิดการรันคำสั่งไม่ได้ แอปจึงไม่ใช้ เพื่อความปลอดภัยของเครื่องคุณ อัปเดต Codex แล้วลองอีกครั้ง");
  }

  const files = await prepareFiles(args.project);

  const current = await instructionsFor(args.project, CODEX_ADAPTER);
  const session = readEngineSession(args.project, ENGINE_ID);
  const told = session.told;
  const plan = planSession(session.id && THREAD_ID.test(session.id) ? session.id : null, told, current.told);
  // turns another AI answered while this session was away (or, for a new session, the recent chat)
  const recap = await recapFor(args.projectId, session, !!plan.resumeId);
  await fsWriteFile(files.instructionsFile!, current.fixed + current.settings, "utf8");

  const images = await stageImages(args.projectId, ENGINE, args.images);
  let run: CodexRun & { resumed: boolean };
  try {
    const notice = plan.sendNotice ? settingsNotice(current.settings) : "";
    const prompt = await buildTurnPrompt(args.project, args.userMessage, [notice, recap].filter(Boolean).join("\n\n"), images, "Codex");
    const freshPrompt = () => (notice ? prompt.replace(notice, "").trim() : prompt); // a fresh session reads the instructions file
    args.emit({ type: "status", text: "กำลังเริ่ม Codex…" });
    run = await runWithRecovery({ exe, files, flags, prompt, resumeId: plan.resumeId, model: args.model, images, emit: args.emit }, freshPrompt);
  } catch (e) {
    const threadId = e instanceof CodexTurnError ? e.threadId : null;
    if (threadId) {
      await saveEngineSession(args.projectId, ENGINE_ID, { id: threadId, told: toldAfterFailure(plan, told, current.told) }).catch(() => {});
    }
    await appendMessages(args.projectId, [{ role: "user", content: args.userMessage }]).catch(() => {});
    if (e instanceof CodexTurnError && NOT_LOGGED_IN.test(e.message)) {
      throw new Error("Codex ยังไม่ได้ล็อกอิน ไปที่หน้า ตั้งค่า แล้วกด ล็อกอิน Codex");
    }
    throw e;
  } finally {
    if (images.length > 0) await rm(turnImagesDir(args.projectId, ENGINE), { recursive: true, force: true });
  }
  await saveEngineSession(args.projectId, ENGINE_ID, { id: run.threadId, told: current.told });

  let applied: { reply: string; problems: string[] };
  try {
    applied = await applyAnswer(args.projectId, run.answerText, args.emit);
  } catch (e) {
    await appendMessages(args.projectId, [{ role: "user", content: args.userMessage }]).catch(() => {});
    if (e instanceof CodexAnswerError) throw new Error("Codex ตอบกลับในรูปแบบที่แอปอ่านไม่ได้ ลองสั่งอีกครั้ง");
    throw e;
  }
  args.emit({ type: "text", delta: applied.reply });
  await appendMessages(args.projectId, [
    { role: "user", content: args.userMessage },
    { role: "assistant", content: applied.reply },
  ]);
  await markSessionCaughtUp(args.projectId, ENGINE_ID);

  let inputTokens = run.inputTokens;
  let outputTokens = run.outputTokens;
  let cachedTokens = run.cachedTokens;
  const fresh = (await getProject(args.projectId)) ?? args.project;
  const problems = [...applied.problems, ...(await projectLintErrors(fresh))];
  if (problems.length > 0 && run.threadId) {
    args.emit({ type: "lint", messages: problems });
    args.emit({ type: "status", text: "พบจุดที่ต้องแก้ กำลังให้ AI แก้อัตโนมัติ…" });
    try {
      const request = `ตรวจทั้งโปรเจกต์แล้วพบปัญหาที่ต้องแก้:\n${problems.map((m) => `- ${m}`).join("\n")}\nแก้ให้ครบผ่าน ops แล้วสรุปสั้น ๆ ใน reply`;
      const prompt = await buildTurnPrompt(fresh, request, "", [], "Codex");
      const repair = await runWithRecovery({ exe, files, flags, prompt, resumeId: run.threadId, model: args.model, images: [], emit: args.emit }, () => prompt);
      await saveEngineSession(args.projectId, ENGINE_ID, { id: repair.threadId ?? run.threadId });
      const fixed = await applyAnswer(args.projectId, repair.answerText, args.emit);
      if (fixed.reply.trim()) args.emit({ type: "text", delta: `\n\n${fixed.reply}` });
      inputTokens += repair.inputTokens;
      outputTokens += repair.outputTokens;
      cachedTokens += repair.cachedTokens;
    } catch (e) {
      // the main turn already landed; a failed repair only leaves the problems listed above
      console.error("[codex-cli] repair turn failed (non-fatal):", e);
      args.emit({ type: "text", delta: "\n\n(แก้อัตโนมัติไม่สำเร็จ พิมพ์สั่งให้แก้ต่อได้)" });
    }
  }

  return { inputTokens, outputTokens, cacheReadTokens: cachedTokens, cacheCreationTokens: 0, criticIssues: 0, criticStatus: null };
}

/**
 * One question, one free-text answer, nothing remembered: the quality review when Codex is the AI the
 * user picked. Same lockdown as a chat turn (no tools, read-only sandbox, empty folder, the user's
 * config ignored); Codex keeps its own instructions, so the rubric travels in the prompt.
 */
export async function codexOneShot(projectId: string, prompt: string, model?: string): Promise<string> {
  const exe = findCodexExecutable();
  if (!exe) throw new CodexNotFoundError();
  const flags = await disableFlags(exe);
  if (!flags) throw new Error("Codex รุ่นที่ติดตั้งอยู่ปิดการรันคำสั่งไม่ได้ แอปจึงไม่ใช้");
  const dir = join(engineDir(projectId), "codex-review");
  const work = join(dir, "work");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const files: CodexFiles = { lastMessageFile: join(dir, "last-message.txt"), workDir: realpathSync.native(work) };
  await rm(files.lastMessageFile, { force: true });
  const run = await runCodex({ exe, files, flags, prompt, resumeId: null, model, images: [], emit: () => {} });
  return run.answerText;
}
