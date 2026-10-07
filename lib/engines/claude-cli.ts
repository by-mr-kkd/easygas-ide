import { spawn } from "node:child_process";
import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { createHash } from "node:crypto";
import { existsSync, realpathSync } from "node:fs";
import { mkdir, readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, isAbsolute, join, relative, sep } from "node:path";
import type { AgentEvent, AgentRunResult, Emit } from "@/lib/anthropic-agent";
import type { AttachedImage } from "@/lib/chat-images";
import { childEnv } from "@/lib/child-env";
import { getFiles } from "@/lib/files";
import { validateGasFiles } from "@/lib/gas-codegen";
import { engineDir, imagesDir, srcDir } from "@/lib/local/paths";
import { parseClaudeAuthStatus } from "@/lib/engines/claude-auth-status";
import { locateClaude } from "@/lib/engines/cli-locate";
import { markSessionCaughtUp, readEngineSession, recapFor, saveEngineSession } from "@/lib/engines/session-context";
import { planSession, settingsNotice, toldAfterFailure } from "@/lib/engines/session-prompt";
import { noteLintIssues } from "@/lib/lessons-store";
import { appendMessages } from "@/lib/messages";
import {
  buildSystemPromptParts,
  buildTurnContext,
  consumeLessonRequest,
  consumePreferenceRequest,
  writeRuleFiles,
} from "@/lib/rulebook/context";
import type { EgsProject } from "@/types/db";
import { lintScope } from "@/lib/import";

/**
 * Subscription engine: drives the user's OWN installed, logged-in Claude Code CLI (`claude -p`) inside
 * the project's src/ folder. We never read or copy Claude credentials and never use `--bare` (it
 * disables the subscription login). Isolation and permission choices (docs/SPIKES.md + security review):
 *  - CLAUDE_CODE_DISABLE_CLAUDE_MDS / _AUTO_MEMORY: keep the user's personal CLAUDE.md + memory out.
 *  - `--setting-sources ""` + --strict-mcp-config: load NO settings files, plugins, hooks or MCP
 *    servers — not even the project's, because the AI itself can write files into src/ (a planted
 *    src/.claude/settings.json hook would otherwise run on the next turn). We also delete such files
 *    before every spawn.
 *  - --tools file-only + --permission-mode acceptEdits, and NO --allowedTools: edits and reads are
 *    auto-allowed only inside cwd (a bare "Read" allow rule would approve the whole disk).
 *  - The prompt goes on stdin: as an argv value a message starting with "-" would parse as a flag,
 *    and Windows caps the command line at ~32K characters.
 *  - cwd must be the long path (8.3 names like ADMINI~1 break cwd-scoped permission checks).
 *  - Provider API keys are stripped from the child env: ANTHROPIC_API_KEY would silently switch
 *    Claude Code from the user's subscription to API billing.
 *  - Two folders OUTSIDE src/ are added with --add-dir: engine/rules (the rule cards, rewritten from
 *    the verified rulebook before every spawn) and engine/io (where the AI may leave two small JSON
 *    files — a look & feel request and a lesson proposal — which the server validates). The CLI can write there (acceptEdits), so both are reset
 *    before EVERY spawn — main turn, dead-session retry and repair — and neither is ever executed,
 *    pushed to Google, or read by the server apart from those two validated JSON files.
 */

const TURN_TIMEOUT_MS = 15 * 60 * 1000;
const TOOLS = "Read,Edit,Write,Glob,Grep";
const ENGINE_ID = "claude-cli" as const;
const TOOL_NAME_MAP: Record<string, string> = {
  Write: "write_file",
  Edit: "edit_file",
  Read: "read_project",
  Glob: "read_project",
  Grep: "read_project",
};
/** Files Claude Code would treat as configuration/instructions if they appeared in the project folder. */
const PLANTABLE_CONFIG = [".claude", ".mcp.json", "CLAUDE.md", "CLAUDE.local.md", "AGENTS.md"];
const DEAD_SESSION = /No conversation found|session .*not found|Invalid session/i;
const PREFS_REQUEST_FILE = "prefs-request.json";
const LESSON_REQUEST_FILE = "lesson-request.json";

const CLI_ADAPTER = `

## Engine adapter (CLI mode) — overrides the tool names above
You are running inside a local project folder. The current working directory IS the Apps Script project.
- write_file → use the Write tool with a path relative to the current directory (e.g. Code.gs, Index.html, appsscript.json).
- edit_file → use the Edit tool. delete_file → not available; tell the user which file to remove.
- read_project → use Glob + Read on the current directory.
- propose_spec → not available in this mode. Skip the spec step and build directly.
- read_rule → rule cards are plain files: Read them from the folder named under "Rule cards" (never edit them).
- save_preference → Write the JSON file named under "Look & feel" (that one file only).
- propose_lesson → Write the JSON file named under "Lessons" (that one file only).
- NEVER read or write anything else outside the current directory, except reference images you are explicitly given a path to.
- NEVER create configuration folders or files such as .claude/, .mcp.json or CLAUDE.md.`;

export class ClaudeCliNotFoundError extends Error {
  readonly code = "CLAUDE_CLI_NOT_FOUND";
  constructor() {
    super("ไม่พบ Claude Code ในเครื่องนี้ ดูวิธีติดตั้งในหน้า ตั้งค่า → AI ที่ใช้สร้างโค้ด แล้วล็อกอินด้วยคำสั่ง claude");
  }
}

/** A failed CLI turn; carries the session id so the caller can keep the conversation going. */
class CliTurnError extends Error {
  constructor(
    message: string,
    readonly sessionId: string | null,
  ) {
    super(message);
  }
}

/** Locate the native claude executable (spawned directly — never through a shell or .cmd shim). */
export function findClaudeExecutable(override?: string): string | null {
  return locateClaude({ env: process.env, platform: process.platform, exists: existsSync, override });
}

const VERSION_TIMEOUT_MS = 20_000;

/** stdout of one short `claude <args>` call (a few KB at most); code null when it did not run or timed out. */
function claudeOutput(exe: string, args: string[]): Promise<{ code: number | null; out: string }> {
  return new Promise((resolve) => {
    let out = "";
    let settled = false;
    const done = (v: { code: number | null; out: string }) => {
      if (settled) return;
      settled = true;
      resolve(v);
    };
    let child;
    try {
      child = spawn(exe, args, { env: childEnv({}), windowsHide: true, stdio: ["ignore", "pipe", "ignore"] });
    } catch {
      return done({ code: null, out: "" });
    }
    const timer = setTimeout(() => {
      child.kill();
      done({ code: null, out });
    }, VERSION_TIMEOUT_MS);
    child.stdout.on("data", (d: Buffer) => {
      if (out.length < 20_000) out += d.toString("utf8");
    });
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

/**
 * Run `claude --version` to prove the binary we found actually starts. Returns the first line of its
 * output (e.g. "2.1.211 (Claude Code)") or null. Says nothing about whether the user is logged in.
 */
export async function claudeVersion(exe: string): Promise<string | null> {
  const { code, out } = await claudeOutput(exe, ["--version"]);
  const line = out.split(/\r?\n/).find((l) => l.trim())?.trim() ?? "";
  return code === 0 && line ? line.slice(0, 80) : null;
}

/**
 * Version and whether the user is signed in, for Settings. Login comes from `claude auth status --json`
 * (the CLI's own answer): nothing under ~/.claude is read, and no request is made to Anthropic.
 * loggedIn is null when the CLI could not answer (too old for `auth status`, or it did not start).
 */
export async function claudeStatus(exe: string): Promise<{ version: string | null; loggedIn: boolean | null; account: string | null }> {
  const [version, auth] = await Promise.all([claudeVersion(exe), claudeOutput(exe, ["auth", "status", "--json"])]);
  return { version, ...parseClaudeAuthStatus(auth.out) };
}

interface CliTurnOutcome {
  sessionId: string | null;
  text: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface StreamJsonEvent {
  type: string;
  subtype?: string;
  session_id?: string;
  event?: { type?: string; delta?: { type?: string; text?: string } };
  message?: { content?: Array<Record<string, unknown>> };
  result?: string;
  is_error?: boolean;
  usage?: {
    input_tokens?: number;
    output_tokens?: number;
    cache_read_input_tokens?: number;
    cache_creation_input_tokens?: number;
  };
}

/** Project-relative path for a tool's absolute file_path, or null when it isn't inside src/. */
function relInSrc(root: string, filePath: unknown): string | null {
  if (typeof filePath !== "string" || !filePath) return null;
  const abs = isAbsolute(filePath) ? filePath : join(root, filePath);
  const rel = relative(root, abs);
  if (!rel || isAbsolute(rel) || rel === ".." || rel.startsWith(`..${sep}`)) return null;
  return rel.replace(/\\/g, "/");
}

interface EngineFiles {
  systemPromptFile: string;
  /** Long path of the folder holding this turn's rule cards. */
  rulesDir: string;
  /** Long path of the folder the AI may write its look & feel request into. */
  ioDir: string;
  prefsRequestFile: string;
  lessonRequestFile: string;
}

/**
 * Run before EVERY spawn: an empty io folder, rule cards rewritten from the verified rulebook, and the
 * system prompt rebuilt — its look & feel block is read fresh, so a choice saved by the previous spawn
 * (main turn → repair) is the one the next spawn sees.
 */
async function refreshEngineFiles(project: EgsProject, engine: EngineFiles): Promise<void> {
  await rm(engine.ioDir, { recursive: true, force: true }); // nothing an earlier spawn left behind survives
  await mkdir(engine.ioDir, { recursive: true });
  await writeRuleFiles(project, engine.rulesDir);
  const prompt = await engineSystemPrompt(project, engine);
  await fsWriteFile(engine.systemPromptFile, prompt.fixed + prompt.settings, "utf8");
}

const fingerprint = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

/**
 * The system prompt in the two parts that matter for a RESUMED session. Claude Code keeps the system
 * prompt a session started with: a later --append-system-prompt-file is not applied on --resume
 * (verified live — a resumed session quoted its original look & feel block after the file changed).
 *  - fixed:    core rulebook + rule-card index + the CLI adapter. Changes only with an app or rulebook
 *              update; when it does, the next turn starts a fresh session.
 *  - settings: look & feel + how to propose a lesson. Changes when the user edits their style; a
 *              resumed session is told the new text in the turn's message (settingsNotice).
 */
async function engineSystemPrompt(
  project: EgsProject,
  engine: EngineFiles,
): Promise<{ fixed: string; settings: string; told: NonNullable<EgsProject["engine_prompt"]> }> {
  const parts = await buildSystemPromptParts(
    project,
    { via: "files", dir: engine.rulesDir },
    { via: "file", path: engine.prefsRequestFile },
    { via: "file", path: engine.lessonRequestFile },
  );
  const fixed = parts.core + CLI_ADAPTER;
  return { fixed, settings: parts.prefs, told: { core: fingerprint(fixed), prefs: fingerprint(parts.prefs) } };
}


/** Where this project's engine files live (folders created; contents come from refreshEngineFiles). */
async function prepareEngineFiles(project: EgsProject): Promise<EngineFiles> {
  const dir = engineDir(project.id);
  const rules = join(dir, "rules");
  const io = join(dir, "io");
  await Promise.all([mkdir(rules, { recursive: true }), mkdir(io, { recursive: true })]);
  const rulesDir = realpathSync.native(rules);
  const ioDir = realpathSync.native(io);
  return {
    systemPromptFile: join(dir, "claude-system.md"),
    rulesDir,
    ioDir,
    prefsRequestFile: join(ioDir, PREFS_REQUEST_FILE),
    lessonRequestFile: join(ioDir, LESSON_REQUEST_FILE),
  };
}

const samePath = (a: string, b: string): boolean =>
  process.platform === "win32" ? a.toLowerCase() === b.toLowerCase() : a === b;

/**
 * Status-bar name for a tool call on one of OUR files outside src/ (a rule card, or the preference
 * request). Matched on the exact folder/file, so a look-alike path elsewhere is never given the label.
 */
function engineToolCall(engine: EngineFiles, tool: string, filePath: unknown): { name: string; path: string } | null {
  if (typeof filePath !== "string" || !isAbsolute(filePath)) return null;
  const abs = join(filePath); // normalise separators
  if (tool === "Read" && abs.endsWith(".md") && samePath(dirname(abs), engine.rulesDir)) {
    return { name: "read_rule", path: abs.slice(dirname(abs).length + 1, -3) };
  }
  if ((tool === "Write" || tool === "Edit") && samePath(abs, engine.prefsRequestFile)) return { name: "save_preference", path: "" };
  if ((tool === "Write" || tool === "Edit") && samePath(abs, engine.lessonRequestFile)) return { name: "propose_lesson", path: "" };
  return null;
}

/** Remove any configuration a previous turn could have planted in the project folder. */
async function removePlantedConfig(cwd: string): Promise<void> {
  await Promise.all(PLANTABLE_CONFIG.map((name) => rm(join(cwd, name), { recursive: true, force: true })));
}

const turnImagesDir = (projectId: string): string => join(imagesDir(projectId), "turn");

/** Save this turn's reference images where the CLI may read them (added with --add-dir). */
async function stageImages(projectId: string, images: AttachedImage[]): Promise<string[]> {
  if (images.length === 0) return [];
  const dir = turnImagesDir(projectId);
  await mkdir(dir, { recursive: true });
  const stamp = Date.now();
  return Promise.all(
    images.map(async (img, i) => {
      const ext = img.mediaType.split("/")[1] ?? "png";
      const file = join(dir, `${stamp}-${i}.${ext === "jpeg" ? "jpg" : ext}`);
      await fsWriteFile(file, Buffer.from(img.dataBase64, "base64"));
      return file;
    }),
  );
}

function runCliTurn(opts: {
  exe: string;
  cwd: string;
  prompt: string;
  project: EgsProject;
  engine: EngineFiles;
  resumeId: string | null;
  model?: string;
  extraDirs: string[];
  emit: Emit;
  silent?: boolean;
}): Promise<CliTurnOutcome> {
  const args = [
    "-p",
    "--output-format",
    "stream-json",
    "--verbose",
    "--include-partial-messages",
    "--append-system-prompt-file",
    opts.engine.systemPromptFile,
    "--tools",
    TOOLS,
    "--permission-mode",
    "acceptEdits",
    "--setting-sources",
    "",
    "--strict-mcp-config",
  ];
  if (opts.model) args.push("--model", opts.model);
  if (opts.resumeId) args.push("--resume", opts.resumeId);
  for (const d of opts.extraDirs) args.push("--add-dir", d);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(opts.exe, args, {
      cwd: opts.cwd,
      env: childEnv({ CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(opts.prompt, "utf8");

    const pendingTools = new Map<string, { name: string; path: string | null }>();
    const pendingReads: Promise<void>[] = [];
    let buf = "";
    let stderr = "";
    let text = "";
    let result: StreamJsonEvent | null = null;
    let sessionId: string | null = null;
    const emit = (ev: AgentEvent) => {
      if (!opts.silent || ev.type === "file_mutation" || ev.type === "tool_call") opts.emit(ev);
    };

    const onEvent = (ev: StreamJsonEvent) => {
      if (ev.session_id) sessionId = ev.session_id;
      if (ev.type === "stream_event" && ev.event?.delta?.type === "text_delta" && ev.event.delta.text) {
        text += ev.event.delta.text;
        emit({ type: "text", delta: ev.event.delta.text });
      } else if (ev.type === "stream_event" && ev.event?.type === "message_start" && text) {
        // a new assistant message after tool use — keep the chat readable
        text += "\n\n";
        emit({ type: "text", delta: "\n\n" });
      } else if (ev.type === "assistant") {
        for (const block of ev.message?.content ?? []) {
          if (block.type !== "tool_use") continue;
          const name = String(block.name ?? "");
          const input = (block.input ?? {}) as Record<string, unknown>;
          const path = relInSrc(opts.cwd, input.file_path ?? input.path);
          pendingTools.set(String(block.id), { name, path });
          const outside = path ? null : engineToolCall(opts.engine, name, input.file_path);
          emit(
            outside
              ? { type: "tool_call", name: outside.name, input: { path: outside.path || undefined } }
              : { type: "tool_call", name: TOOL_NAME_MAP[name] ?? name, input: { path: path ?? undefined } },
          );
        }
      } else if (ev.type === "user") {
        for (const block of ev.message?.content ?? []) {
          if (block.type !== "tool_result") continue;
          const tool = pendingTools.get(String(block.tool_use_id));
          if (!tool || block.is_error || !tool.path || (tool.name !== "Write" && tool.name !== "Edit")) continue;
          const path = tool.path;
          pendingReads.push(
            readFile(join(opts.cwd, path), "utf8")
              .then((content) => emit({ type: "file_mutation", op: tool.name === "Write" ? "write" : "edit", path, content }))
              .catch(() => {}),
          );
        }
      } else if (ev.type === "result") {
        result = ev;
      }
    };

    const parseLine = (raw: string) => {
      const line = raw.trim();
      if (!line) return;
      try {
        onEvent(JSON.parse(line) as StreamJsonEvent);
      } catch {
        /* non-JSON noise */
      }
    };

    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let i: number;
      while ((i = buf.indexOf("\n")) >= 0) {
        parseLine(buf.slice(0, i));
        buf = buf.slice(i + 1);
      }
    });
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));

    const timer = setTimeout(() => child.kill(), TURN_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new CliTurnError(e.message, sessionId));
    });
    child.on("close", async (code) => {
      clearTimeout(timer);
      parseLine(buf); // a final line without a trailing newline
      await Promise.all(pendingReads); // emit every file_mutation before the caller closes the stream
      const r = result as StreamJsonEvent | null;
      if (!r || r.is_error || code !== 0) {
        const detail = (r?.result || stderr || `exit ${code}`).trim().slice(0, 400);
        console.error("[claude-cli] turn failed:", detail);
        reject(new CliTurnError(`Claude Code: ${detail}`, r?.session_id ?? sessionId));
        return;
      }
      resolvePromise({
        sessionId: r.session_id ?? sessionId,
        text: text.trim() || String(r.result ?? ""),
        inputTokens: r.usage?.input_tokens ?? 0,
        outputTokens: r.usage?.output_tokens ?? 0,
        cacheReadTokens: r.usage?.cache_read_input_tokens ?? 0,
        cacheCreationTokens: r.usage?.cache_creation_input_tokens ?? 0,
      });
    });
  });
}

/** Run a turn; if the stored session no longer exists (CLI upgrade, cleared history), start a fresh one. */
async function runCliTurnWithRecovery(opts: Parameters<typeof runCliTurn>[0]): Promise<CliTurnOutcome> {
  const sanitize = () => Promise.all([removePlantedConfig(opts.cwd), refreshEngineFiles(opts.project, opts.engine)]);
  await sanitize();
  try {
    return await runCliTurn(opts);
  } catch (e) {
    if (!opts.resumeId || !DEAD_SESSION.test((e as Error).message)) throw e;
    console.warn("[claude-cli] stored session is gone — starting a new one");
    await sanitize();
    return runCliTurn({ ...opts, resumeId: null });
  } finally {
    await removePlantedConfig(opts.cwd);
  }
}

/** Lint errors of the finished turn; the rules that fired are counted toward lessons. */
async function projectLintErrors(project: EgsProject): Promise<string[]> {
  const files = await getFiles(project.id);
  if (files.length === 0) return [];
  const lint = validateGasFiles(
    files.map((f) => ({ name: f.path, content: f.content })),
    { isWebApp: project.kind !== "bound", allowCamera: cameraAllowedFor(project) },
  );
  noteLintIssues(project.id, [...lint.errors, ...lint.warnings]);
  const inScope = await lintScope(project);
  return lint.errors.filter((i) => inScope(i.file)).map((i) => `${i.file}: ${i.message}`);
}

export interface ClaudeCliArgs {
  projectId: string;
  project: EgsProject;
  userMessage: string;
  images: AttachedImage[];
  model?: string;
  executable?: string;
  emit: Emit;
}

/** One chat turn on the CLI engine, plus one bounded auto-repair when the project lint finds errors. */
export async function runClaudeCliTurn(args: ClaudeCliArgs): Promise<AgentRunResult> {
  const exe = findClaudeExecutable(args.executable);
  if (!exe) throw new ClaudeCliNotFoundError();

  await mkdir(srcDir(args.projectId), { recursive: true });
  const cwd = realpathSync.native(srcDir(args.projectId));
  const hasFiles = (await getFiles(args.projectId)).length > 0;
  const engine = await prepareEngineFiles(args.project);
  const engineDirs = [engine.rulesDir, engine.ioDir];
  // Name the rule cards the app matched to this request; the CLI opens them itself (its session keeps
  // what it read, so nothing is inlined). Best-effort — never block the turn on it.
  const directive = await buildTurnContext({
    project: args.project,
    userMessage: args.userMessage,
    hasFiles,
    access: { via: "files", dir: engine.rulesDir },
    inline: false,
  })
    .then((c) => c.text)
    .catch((e) => {
      console.error("[claude-cli] rule-card context failed (non-fatal):", e);
      return "";
    });
  // What a resumed session was told at its start vs. what is true now (see engineSystemPrompt).
  const current = await engineSystemPrompt(args.project, engine);
  const session = readEngineSession(args.project, ENGINE_ID);
  const told = session.told;
  // fixed part changed (or never recorded) → fresh session; only settings changed → resume + notice
  const plan = planSession(session.id, told, current.told);
  const resumeId = plan.resumeId;
  const notice = plan.sendNotice ? settingsNotice(current.settings) : "";
  // turns another AI answered while this session was away (or, for a new session, the recent chat)
  const recap = await recapFor(args.projectId, session, !!resumeId);

  const imagePaths = await stageImages(args.projectId, args.images);
  const context = [notice, recap, directive].filter(Boolean).join("\n\n");
  const request = context ? `${context}\n\n---\n${args.userMessage}` : args.userMessage;
  const prompt =
    imagePaths.length > 0
      ? `${request}\n\nรูปอ้างอิงที่ผู้ใช้แนบ (ใช้ Read เปิดดูได้):\n${imagePaths.map((p) => `- ${p}`).join("\n")}`
      : request;
  const extraDirs = [...engineDirs, ...(imagePaths.length > 0 ? [realpathSync.native(turnImagesDir(args.projectId))] : [])];

  // A look & feel choice the user stated this turn: validated server-side, then the file is removed.
  // Called after every spawn (the next spawn wipes the io folder).
  const applyPreferenceRequest = async (): Promise<void> => {
    // a lesson the AI proposed this spawn: stored as pending, offered to the user when the turn ends
    await consumeLessonRequest(args.projectId, engine.lessonRequestFile).catch((e) =>
      console.error("[claude-cli] lesson request failed (non-fatal):", e),
    );
    try {
      const outcome = await consumePreferenceRequest(args.projectId, engine.prefsRequestFile);
      // the AI has already told the user it saved the choice — say so when that is not (fully) true
      if (outcome === "rejected") {
        args.emit({ type: "text", delta: "\n\n(หมายเหตุจากแอป: บันทึกสไตล์ที่เลือกไว้ไม่สำเร็จ ตั้งเองได้ที่ปุ่ม สไตล์)" });
      } else if (outcome === "saved-without-free-text") {
        args.emit({
          type: "text",
          delta:
            "\n\n(หมายเหตุจากแอป: AI บันทึกได้เฉพาะตัวเลือกสำเร็จรูป ส่วนคำสั่งที่เป็นข้อความยังไม่ถูกบันทึก ถ้าอยากให้จำตลอด ใส่เองที่ปุ่ม สไตล์ → คำสั่งเพิ่มเติม)",
        });
      }
    } catch (e) {
      console.error("[claude-cli] preference request failed (non-fatal):", e);
    }
  };

  args.emit({ type: "status", text: "กำลังเริ่ม Claude Code…" });
  let main: CliTurnOutcome;
  try {
    main = await runCliTurnWithRecovery({
      exe,
      cwd,
      prompt,
      project: args.project,
      engine,
      resumeId,
      model: args.model,
      extraDirs,
      emit: args.emit,
    });
  } catch (e) {
    // The turn may already have edited files: keep its session + the user's message so the next turn
    // resumes with that context instead of an older conversation.
    const sessionId = e instanceof CliTurnError ? e.sessionId : null;
    if (sessionId) {
      await saveEngineSession(args.projectId, ENGINE_ID, { id: sessionId, told: toldAfterFailure(plan, told, current.told) }).catch(() => {});
    }
    await appendMessages(args.projectId, [{ role: "user", content: args.userMessage }]).catch(() => {});
    throw e;
  } finally {
    if (imagePaths.length > 0) await rm(turnImagesDir(args.projectId), { recursive: true, force: true });
    await applyPreferenceRequest();
  }

  // the session now knows the current settings (from its system prompt, or from the notice above)
  await saveEngineSession(args.projectId, ENGINE_ID, { id: main.sessionId, told: current.told });
  await appendMessages(args.projectId, [
    { role: "user", content: args.userMessage },
    { role: "assistant", content: main.text },
  ]);
  await markSessionCaughtUp(args.projectId, ENGINE_ID);

  let total = { ...main };
  const errors = await projectLintErrors(args.project);
  if (errors.length > 0 && main.sessionId) {
    args.emit({ type: "lint", messages: errors });
    args.emit({ type: "status", text: "พบจุดที่ต้องแก้ กำลังให้ AI แก้อัตโนมัติ…" });
    const repair = await runCliTurnWithRecovery({
      exe,
      cwd,
      prompt: `ตรวจทั้งโปรเจกต์แล้วพบข้อผิดพลาดที่ต้องแก้:\n${errors.map((m) => `- ${m}`).join("\n")}\nแก้ให้ครบด้วย Edit/Write แล้วสรุปสั้น ๆ`,
      project: args.project,
      engine,
      resumeId: main.sessionId,
      model: args.model,
      extraDirs: engineDirs,
      emit: args.emit,
      silent: true,
    }).finally(applyPreferenceRequest);
    await saveEngineSession(args.projectId, ENGINE_ID, { id: repair.sessionId ?? main.sessionId });
    total = {
      ...total,
      inputTokens: total.inputTokens + repair.inputTokens,
      outputTokens: total.outputTokens + repair.outputTokens,
      cacheReadTokens: total.cacheReadTokens + repair.cacheReadTokens,
      cacheCreationTokens: total.cacheCreationTokens + repair.cacheCreationTokens,
    };
  }

  return {
    inputTokens: total.inputTokens,
    outputTokens: total.outputTokens,
    cacheReadTokens: total.cacheReadTokens,
    cacheCreationTokens: total.cacheCreationTokens,
    criticIssues: 0,
    criticStatus: null,
  };
}

const ONE_SHOT_TIMEOUT_MS = 10 * 60 * 1000;

/**
 * One question, one free-text answer: the quality review when Claude Code is the AI the user picked.
 * A narrower version of a chat turn's spawn — the only tool is Read, in an EMPTY folder of its own (so
 * there is nothing to read), no edit permission, the same settings / MCP isolation — with the result
 * taken from `--output-format json`.
 */
export async function claudeOneShot(projectId: string, prompt: string, model?: string): Promise<string> {
  const exe = findClaudeExecutable();
  if (!exe) throw new ClaudeCliNotFoundError();
  const work = join(engineDir(projectId), "claude-review", "work");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const args = ["-p", "--output-format", "json", "--tools", "Read", "--setting-sources", "", "--strict-mcp-config"];
  if (model) args.push("--model", model);

  return new Promise((resolvePromise, reject) => {
    const child = spawn(exe, args, {
      cwd: realpathSync.native(work),
      env: childEnv({ CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" }),
      windowsHide: true,
      stdio: ["pipe", "pipe", "pipe"],
    });
    child.stdin.end(prompt, "utf8");
    let out = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => {
      if (out.length < 4_000_000) out += d.toString("utf8");
    });
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 20_000) stderr += d.toString("utf8");
    });
    const timer = setTimeout(() => child.kill(), ONE_SHOT_TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      try {
        const parsed = JSON.parse(out.trim()) as { result?: unknown; is_error?: unknown };
        if (code === 0 && !parsed.is_error && typeof parsed.result === "string") return resolvePromise(parsed.result);
      } catch {
        /* not the JSON envelope — reported below */
      }
      reject(new Error((stderr.trim().split(/\r?\n/).slice(-2).join(" ") || `claude exited ${code}`).slice(0, 400)));
    });
  });
}
