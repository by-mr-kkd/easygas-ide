import { spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync, readdirSync, realpathSync, statSync } from "node:fs";
import { mkdir, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRunResult, Emit } from "@/lib/anthropic-agent";
import { MODEL_ID } from "@/lib/ai-choice";
import type { AttachedImage } from "@/lib/chat-images";
import { childEnv } from "@/lib/child-env";
import { CODEX_ANSWER_SCHEMA, CodexAnswerError } from "@/lib/engines/codex-answer";
import {
  applyAnswer,
  buildTurnPrompt,
  instructionsFor,
  jsonAnswerAdapter,
  projectLintErrors,
  stageImages,
  turnImagesDir,
} from "@/lib/engines/json-answer-turn";
import { MUSE_LOCKDOWN, locateMuse, missingMuseFlags, museVersionLine, readMuseEvent } from "@/lib/engines/muse-protocol";
import { markSessionCaughtUp, readEngineSession, recapFor, saveEngineSession } from "@/lib/engines/session-context";
import { planSession, settingsNotice, toldAfterFailure } from "@/lib/engines/session-prompt";
import { engineDir } from "@/lib/local/paths";
import { appendMessages } from "@/lib/messages";
import { getProject } from "@/lib/projects";
import type { EgsProject } from "@/types/db";

/**
 * Subscription engine #3: drives the user's OWN installed, signed-in Muse Code CLI from Meta
 * (`muse exec`). Same shape as the Codex engine — Muse Code is run as a pure model:
 *  - shell, file writes and web tools are switched off, the sandbox network is cut and nothing is
 *    auto-approved (MUSE_LOCKDOWN); the app refuses to run a version that lacks any of those switches;
 *  - it runs in an EMPTY folder of its own (engine/muse/work) that is never trusted, so no project
 *    rules, skills or agents are picked up from it;
 *  - the app sends the project's files and the matching rule cards in the message, Muse Code answers
 *    with ONE JSON object (--output-schema, the same schema as Codex), and the app applies the
 *    changes itself through executeEgsTool.
 * Muse Code has no flag for an instructions file, so a fresh session's first message starts with the
 * instructions; a resumed session keeps them, and changed settings travel in the turn as a notice
 * (lib/engines/session-prompt.ts).
 * Not controllable from here (1.4.2 has no switch to ignore the user's own settings): MCP servers and
 * hooks the user configured in their Muse Code settings still load, exactly as when they run `muse`.
 * Sign-in stays Muse Code's own; the app never reads its credential file. META_API_KEY / MODEL_API_KEY
 * are stripped from the child's environment (childEnv) so a stray key cannot move the user from
 * their monthly plan to pay-as-you-go.
 */

const ENGINE = "muse";
const ENGINE_ID = "muse-cli" as const;
const TURN_TIMEOUT_MS = 15 * 60 * 1000;
const PROBE_TIMEOUT_MS = 30_000;
const MAX_LINE_CHARS = 8_000_000;
/** No tools to call, so a turn is one model step; the cap only stops a runaway loop. */
const MAX_MODEL_STEPS = "8";
/** Session ids are UUIDs the app makes itself; anything else is never put on a command line. */
const SESSION_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
// Wording not confirmed against a signed-out install (the test machine was signed in).
/** Muse Code will not continue a session under different terms (seen for the provider; assumed for a model). */
const WONT_RESUME = /refus\w* to resume|start a new session/i;
const NOT_LOGGED_IN = /not (logged|signed) in|muse login|log ?in (to|with)|no (stored )?credential|unauthori[sz]ed|\b401\b/i;

const MUSE_ADAPTER =
  jsonAnswerAdapter("Muse Code") +
  `
- Muse Code's own tools, skills, agents and MCP servers are not part of this job: do not call any of them, whatever the skills catalog lists. Answer in one step.`;

export class MuseNotFoundError extends Error {
  readonly code = "MUSE_CLI_NOT_FOUND";
  constructor() {
    super("ไม่พบ Muse Code ในเครื่องนี้ ดูวิธีติดตั้งในหน้า ตั้งค่า → AI ที่ใช้สร้างโค้ด แล้วล็อกอินด้วยบัญชี Meta");
  }
}

class MuseTurnError extends Error {}

/** Locate the Muse Code binary (spawned directly — never through a shell or the .cmd launcher). */
export function findMuseExecutable(override?: string): string | null {
  return locateMuse({
    env: process.env,
    platform: process.platform,
    exists: existsSync,
    // the installer's own version marker and folder listing — never the credential file
    readText: (p) => {
      try {
        return readFileSync(p, "utf8");
      } catch {
        return null;
      }
    },
    listDir: (d) => {
      try {
        return readdirSync(d);
      } catch {
        return [];
      }
    },
    override,
  });
}

/** Run a short muse command and collect its output (version, help, session check). */
function museOutput(exe: string, args: string[], cwd?: string): Promise<{ code: number | null; out: string }> {
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
      child = spawn(exe, args, { cwd, env: childEnv({ NO_COLOR: "1" }), windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    } catch {
      return done({ code: null, out: "" });
    }
    const timer = setTimeout(() => {
      child.kill();
      done({ code: null, out });
    }, PROBE_TIMEOUT_MS);
    const take = (d: Buffer) => {
      if (out.length < 200_000) out += d.toString("utf8");
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

/** Version line for Settings (e.g. "Muse Code 1.4.2 (1.4.2-R4684.1)"), or null when it will not start. */
export async function museVersion(exe: string): Promise<string | null> {
  const r = await museOutput(exe, ["--version"]);
  return r.code === 0 ? museVersionLine(r.out) : null;
}

// `muse exec --help` per executable version (it changes only when Muse Code updates)
const g = globalThis as unknown as { __egsMuseGuards?: Map<string, string[]> };
const guardCache = (g.__egsMuseGuards ??= new Map<string, string[]>());

/** The safety switches this version lacks: [] = usable, null = could not ask (not cached). */
async function missingGuards(exe: string): Promise<string[] | null> {
  let stamp = exe;
  try {
    const s = statSync(exe);
    stamp = `${exe}|${s.size}|${s.mtimeMs}`;
  } catch {
    /* keep the path */
  }
  const cached = guardCache.get(stamp);
  if (cached) return cached;
  const r = await museOutput(exe, ["exec", "--help"]);
  if (r.code !== 0 || !r.out.includes("--")) return null;
  const missing = missingMuseFlags(r.out);
  guardCache.set(stamp, missing);
  return missing;
}

interface MuseFiles {
  promptFile: string;
  schemaFile: string;
  exportFile: string;
  /** Long path of the empty working folder Muse Code runs in. */
  workDir: string;
}

async function prepareFiles(project: EgsProject): Promise<MuseFiles> {
  const dir = join(engineDir(project.id), ENGINE);
  const work = join(dir, "work");
  await rm(work, { recursive: true, force: true }); // always empty: nothing for Muse Code to discover
  await mkdir(work, { recursive: true });
  const schemaFile = join(dir, "answer.schema.json");
  await fsWriteFile(schemaFile, JSON.stringify(CODEX_ANSWER_SCHEMA), "utf8");
  return { promptFile: join(dir, "prompt.md"), schemaFile, exportFile: join(dir, "session-check.json"), workDir: realpathSync.native(work) };
}

/**
 * Whether Muse Code still has the stored session. `--session-id` with an id it does not know quietly
 * starts a NEW session, which would have none of the instructions — so the app asks first (`muse
 * export` fails for an unknown id) and sends the instructions again when the session is gone.
 */
async function sessionExists(exe: string, files: MuseFiles, sessionId: string): Promise<boolean> {
  if (!SESSION_ID.test(sessionId)) return false;
  await rm(files.exportFile, { force: true });
  const r = await museOutput(exe, ["export", "--session", sessionId, "--out", files.exportFile], files.workDir);
  await rm(files.exportFile, { force: true }); // the export is the whole transcript — never kept
  return r.code === 0;
}

interface RunOpts {
  exe: string;
  files: Pick<MuseFiles, "promptFile" | "workDir"> & { schemaFile?: string };
  prompt: string;
  /** Absent for a one-shot: nothing is kept (--no-session-log). */
  sessionId?: string;
  /** A model id the user picked; absent = Muse Code's own default. */
  model?: string;
  images: string[];
  emit: Emit;
}

function runMuse(opts: RunOpts): Promise<string> {
  if (opts.sessionId && !SESSION_ID.test(opts.sessionId)) return Promise.reject(new MuseTurnError("invalid session id"));
  if (opts.model && !MODEL_ID.test(opts.model)) return Promise.reject(new MuseTurnError("invalid model name"));
  const args = [
    "exec",
    "--json",
    "--prompt-file",
    opts.files.promptFile,
    ...(opts.files.schemaFile ? ["--output-schema", opts.files.schemaFile] : []),
    ...(opts.sessionId ? ["--session-id", opts.sessionId] : ["--no-session-log"]),
    "--max-model-steps",
    MAX_MODEL_STEPS,
    ...MUSE_LOCKDOWN,
    ...(opts.model ? ["--model", opts.model] : []),
    ...opts.images.flatMap((p) => ["--image", p]),
  ];

  return new Promise((resolve, reject) => {
    fsWriteFile(opts.files.promptFile, opts.prompt, "utf8").then(() => {
      const child = spawn(opts.exe, args, {
        cwd: opts.files.workDir,
        env: childEnv({ NO_COLOR: "1" }),
        windowsHide: true,
        stdio: ["ignore", "pipe", "pipe"],
      });

      let buf = "";
      let stderr = "";
      let answer = "";
      let failure = "";
      let announced = false;
      const parseLine = (raw: string) => {
        const line = raw.trim();
        if (!line) return;
        const ev = readMuseEvent(line);
        if (ev.kind === "started") opts.emit({ type: "status", text: "Muse Code กำลังคิด…" });
        else if (ev.kind === "thinking" && !announced) {
          announced = true;
          opts.emit({ type: "status", text: "Muse Code กำลังเขียนโค้ด…" });
        } else if (ev.kind === "completed") answer = ev.text;
        else if (ev.kind === "failed") failure = ev.reason;
      };
      child.stdout.on("data", (d: Buffer) => {
        buf += d.toString("utf8");
        if (buf.length > MAX_LINE_CHARS) buf = ""; // one runaway line: drop it
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
      const cleanup = () => rm(opts.files.promptFile, { force: true }).catch(() => {});
      child.on("error", (e) => {
        clearTimeout(timer);
        void cleanup();
        reject(new MuseTurnError(e.message));
      });
      child.on("close", (code) => {
        clearTimeout(timer);
        void cleanup();
        parseLine(buf);
        if (code !== 0 || failure || !answer.trim()) {
          // stderr opens with Muse Code's own start-up notes (workspace, skills) — the cause is at the end
          const detail = (failure || stderr.trim().split(/\r?\n/).slice(-3).join(" ") || `exit ${code}`).slice(0, 400);
          console.error("[muse-cli] turn failed:", detail);
          reject(new MuseTurnError(detail));
          return;
        }
        resolve(answer);
      });
    }, reject);
  });
}

export interface MuseCliArgs {
  projectId: string;
  project: EgsProject;
  userMessage: string;
  images: AttachedImage[];
  /** A model id the user picked; absent = Muse Code's own default. */
  model?: string;
  executable?: string;
  emit: Emit;
}

/** The binary, checked: found, starts, and has every safety switch. Throws the message to show the user. */
async function usableMuse(override?: string): Promise<string> {
  const exe = findMuseExecutable(override);
  if (!exe) throw new MuseNotFoundError();
  const missing = await missingGuards(exe);
  if (missing === null) throw new Error("เปิด Muse Code ไม่สำเร็จ ลองติดตั้งใหม่จากหน้า ตั้งค่า แล้วลองอีกครั้ง");
  if (missing.length > 0) {
    console.error("[muse-cli] refusing to run, missing switches:", missing.join(" "));
    throw new Error("Muse Code รุ่นที่ติดตั้งอยู่ปิดการรันคำสั่งและการเขียนไฟล์ไม่ได้ แอปจึงไม่ใช้ เพื่อความปลอดภัยของเครื่องคุณ อัปเดต Muse Code แล้วลองอีกครั้ง");
  }
  return exe;
}

/**
 * One question, one free-text answer, nothing remembered: the quality review when Muse Code is the AI
 * the user picked. Same lockdown as a chat turn, in an empty folder, with no session log.
 */
export async function museOneShot(projectId: string, prompt: string, model?: string): Promise<string> {
  const exe = await usableMuse();
  const dir = join(engineDir(projectId), "muse-review");
  const work = join(dir, "work");
  await rm(work, { recursive: true, force: true });
  await mkdir(work, { recursive: true });
  const files = { promptFile: join(dir, "prompt.md"), workDir: realpathSync.native(work) };
  return runMuse({ exe, files, prompt, model, images: [], emit: () => {} });
}

/** One chat turn on the Muse Code engine, plus one bounded repair when changes failed or the lint finds errors. */
export async function runMuseCliTurn(args: MuseCliArgs): Promise<AgentRunResult> {
  const exe = await usableMuse(args.executable);
  const files = await prepareFiles(args.project);

  const current = await instructionsFor(args.project, MUSE_ADAPTER);
  const session = readEngineSession(args.project, ENGINE_ID);
  const told = session.told;
  let plan = planSession(session.id && SESSION_ID.test(session.id) ? session.id : null, told, current.told);
  if (plan.resumeId && !(await sessionExists(exe, files, plan.resumeId))) {
    console.warn("[muse-cli] stored session is gone — starting a new one");
    plan = { resumeId: null, sendNotice: false };
  }
  let sessionId = plan.resumeId ?? randomUUID();
  /** A fresh session reads the instructions as the top of its first message. */
  const withInstructions = (turn: string) =>
    `${current.fixed}${current.settings}\n\n=====\nThe first message of the conversation follows.\n\n${turn}`;
  /** The whole message for this turn: what the session missed, then the request (and, when new, the instructions). */
  const messageFor = async (resuming: boolean, images: string[]): Promise<string> => {
    const notice = resuming && plan.sendNotice ? settingsNotice(current.settings) : "";
    const recap = await recapFor(args.projectId, session, resuming);
    const turn = await buildTurnPrompt(args.project, args.userMessage, [notice, recap].filter(Boolean).join("\n\n"), images, "Muse Code");
    return resuming ? turn : withInstructions(turn);
  };

  const images = await stageImages(args.projectId, ENGINE, args.images);
  let answerText: string;
  try {
    args.emit({ type: "status", text: "กำลังเริ่ม Muse Code…" });
    try {
      answerText = await runMuse({ exe, files, prompt: await messageFor(!!plan.resumeId, images), sessionId, model: args.model, images, emit: args.emit });
    } catch (e) {
      // e.g. the user switched model and Muse Code will not continue the old session under it
      if (!plan.resumeId || !(e instanceof MuseTurnError) || !WONT_RESUME.test(e.message)) throw e;
      console.warn("[muse-cli] the session cannot be resumed as asked — starting a new one");
      plan = { resumeId: null, sendNotice: false };
      sessionId = randomUUID();
      answerText = await runMuse({ exe, files, prompt: await messageFor(false, images), sessionId, model: args.model, images, emit: args.emit });
    }
  } catch (e) {
    // the session may or may not have taken the message; record it the cautious way round
    await saveEngineSession(args.projectId, ENGINE_ID, { id: sessionId, told: toldAfterFailure(plan, told, current.told) }).catch(() => {});
    await appendMessages(args.projectId, [{ role: "user", content: args.userMessage }]).catch(() => {});
    if (e instanceof MuseTurnError && NOT_LOGGED_IN.test(e.message)) {
      throw new Error("Muse Code ยังไม่ได้ล็อกอิน ไปที่หน้า ตั้งค่า แล้วกด ล็อกอิน Muse Code");
    }
    throw e;
  } finally {
    if (images.length > 0) await rm(turnImagesDir(args.projectId, ENGINE), { recursive: true, force: true });
  }
  await saveEngineSession(args.projectId, ENGINE_ID, { id: sessionId, told: current.told });

  let applied: { reply: string; problems: string[] };
  try {
    applied = await applyAnswer(args.projectId, answerText, args.emit);
  } catch (e) {
    await appendMessages(args.projectId, [{ role: "user", content: args.userMessage }]).catch(() => {});
    if (e instanceof CodexAnswerError) throw new Error("Muse Code ตอบกลับในรูปแบบที่แอปอ่านไม่ได้ ลองสั่งอีกครั้ง");
    throw e;
  }
  args.emit({ type: "text", delta: applied.reply });
  await appendMessages(args.projectId, [
    { role: "user", content: args.userMessage },
    { role: "assistant", content: applied.reply },
  ]);
  await markSessionCaughtUp(args.projectId, ENGINE_ID);

  const fresh = (await getProject(args.projectId)) ?? args.project;
  const problems = [...applied.problems, ...(await projectLintErrors(fresh))];
  if (problems.length > 0) {
    args.emit({ type: "lint", messages: problems });
    args.emit({ type: "status", text: "พบจุดที่ต้องแก้ กำลังให้ AI แก้อัตโนมัติ…" });
    try {
      const request = `ตรวจทั้งโปรเจกต์แล้วพบปัญหาที่ต้องแก้:\n${problems.map((m) => `- ${m}`).join("\n")}\nแก้ให้ครบผ่าน ops แล้วสรุปสั้น ๆ ใน reply`;
      const prompt = await buildTurnPrompt(fresh, request, "", [], "Muse Code");
      const repair = await runMuse({ exe, files, prompt, sessionId, model: args.model, images: [], emit: args.emit });
      const fixed = await applyAnswer(args.projectId, repair, args.emit);
      if (fixed.reply.trim()) args.emit({ type: "text", delta: `\n\n${fixed.reply}` });
    } catch (e) {
      // the main turn already landed; a failed repair only leaves the problems listed above
      console.error("[muse-cli] repair turn failed (non-fatal):", e);
      args.emit({ type: "text", delta: "\n\n(แก้อัตโนมัติไม่สำเร็จ พิมพ์สั่งให้แก้ต่อได้)" });
    }
  }

  // `muse exec --json` reports no token counts; usage shows in the user's own Meta account
  return { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0, criticIssues: 0, criticStatus: null };
}
