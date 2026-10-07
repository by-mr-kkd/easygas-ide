import { spawn } from "node:child_process";
import { existsSync, readFileSync, realpathSync } from "node:fs";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { childEnv } from "@/lib/child-env";
import { NotConnectedError, UserSettingsDisabledError } from "@/lib/errors";
import { dataRoot } from "@/lib/local/paths";

/**
 * Runs the bundled clasp CLI (server-only). We never read clasp's OAuth token: clasp signs in with
 * Google's own OAuth client and keeps its credentials in the app's own auth file, and we only run it.
 *
 * Lessons from docs/SPIKES.md:
 *  - ALWAYS pass `-P <project dir>`: otherwise clasp walks UP the tree and reuses any stray .clasp.json,
 *    and it still exits 0 ("Project file already exists"). So we also never trust the exit code alone.
 *  - Spawn with Node directly (process.execPath + ELECTRON_RUN_AS_NODE) — no shell, no .cmd shims.
 *  - Pass the LONG path: clasp compares the content dir with its realpath and refuses a Windows 8.3
 *    short path (ADMINI~1) as "Content directory is a symlink. Possible race attack."
 */

const TIMEOUT_MS = 120_000;

/**
 * The app's own clasp credentials file (kept apart from the user's personal `clasp login`).
 * EASYGAS_CLASP_AUTH points it elsewhere (development: reuse an existing clasp login file).
 */
export const claspAuthPath = (): string =>
  process.env.EASYGAS_CLASP_AUTH?.trim() || join(dataRoot(), "clasp", ".clasprc.json");

function claspEntry(): string {
  const override = process.env.EASYGAS_CLASP_ENTRY?.trim();
  if (override) return override;
  const pkgDir = join(process.cwd(), "node_modules", "@google", "clasp");
  const pkg = JSON.parse(readFileSync(join(pkgDir, "package.json"), "utf8")) as { bin: { clasp: string } };
  return join(pkgDir, pkg.bin.clasp);
}

export interface ClaspResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Raw run. `projectDir` pins the project with -P; omit it only for account-level commands. */
export function runClasp(args: string[], opts: { projectDir?: string; timeoutMs?: number } = {}): Promise<ClaspResult> {
  const projectDir = opts.projectDir && existsSync(opts.projectDir) ? realpathSync.native(opts.projectDir) : opts.projectDir;
  const fullArgs = [claspEntry(), "-A", claspAuthPath()];
  if (projectDir) fullArgs.push("-P", projectDir);
  fullArgs.push(...args);
  return new Promise((resolvePromise, reject) => {
    const child = spawn(process.execPath, fullArgs, {
      cwd: projectDir ?? dataRoot(),
      env: childEnv({ ELECTRON_RUN_AS_NODE: "1", NO_COLOR: "1" }),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d: Buffer) => (stdout += d.toString("utf8")));
    child.stderr.on("data", (d: Buffer) => (stderr += d.toString("utf8")));
    const timer = setTimeout(() => {
      child.kill();
      reject(new Error(`clasp ${args[0]} timed out`));
    }, opts.timeoutMs ?? TIMEOUT_MS);
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(e);
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      resolvePromise({ code, stdout: stdout.trim(), stderr: stderr.trim() });
    });
  });
}

const NOT_LOGGED_IN = /No credentials found|Not logged in|invalid_grant|Could not read API credentials/i;
const API_DISABLED = /not enabled the Apps Script API|script\.google\.com\/home\/usersettings/i;

/** Map clasp's text output to the typed errors the UI already knows how to explain. */
export function claspError(cmd: string, r: ClaspResult): Error {
  const text = `${r.stdout}\n${r.stderr}`;
  if (NOT_LOGGED_IN.test(text)) return new NotConnectedError();
  if (API_DISABLED.test(text)) return new UserSettingsDisabledError();
  console.error(`[clasp] ${cmd} failed (exit ${r.code}):`, text.slice(0, 2000));
  return new Error(`clasp_${cmd}_failed`);
}

/** Run and require success: exit 0 AND no error text (clasp exits 0 on some failures). */
export async function claspOrThrow(args: string[], projectDir?: string): Promise<string> {
  const r = await runClasp(args, { projectDir });
  const text = `${r.stdout}\n${r.stderr}`;
  if (r.code !== 0 || NOT_LOGGED_IN.test(text) || API_DISABLED.test(text) || /^Error:/m.test(r.stderr)) {
    throw claspError(args[0], r);
  }
  return r.stdout;
}

export interface ClaspAccount {
  loggedIn: boolean;
  email: string | null;
}

const ACCOUNT_CACHE_MS = 10_000;
const ACCOUNT_CHECK_TIMEOUT_MS = 60_000;
const ACCOUNT_PAGE_WAIT_MS = 3_000;
const g = globalThis as unknown as {
  __egsClaspAccount?: { at: number; value: ClaspAccount };
  __egsClaspAccountCheck?: Promise<ClaspAccount | null>;
};

/**
 * The signed-in deploy account. Never throws (pages render it on every load) and is cached briefly,
 * because each check spawns a Node process.
 */
export async function getClaspAccount(opts: { fresh?: boolean } = {}): Promise<ClaspAccount> {
  const signedOut: ClaspAccount = { loggedIn: false, email: null };
  if (!existsSync(claspAuthPath())) return signedOut;
  const cached = g.__egsClaspAccount;
  if (!opts.fresh && cached && Date.now() - cached.at < ACCOUNT_CACHE_MS) return cached.value;

  // One check at a time; callers share it. A check that FAILS (clasp slow to start, timed out) is not
  // an answer: it must not be cached or shown as "signed out" — the sign-in file is there.
  // (started inside a promise chain: runClasp can throw before it returns one — a missing clasp file —
  // and this function must never throw into a page render)
  const check = (g.__egsClaspAccountCheck ??= Promise.resolve()
    .then(() => runClasp(["show-authorized-user", "--json"], { timeoutMs: ACCOUNT_CHECK_TIMEOUT_MS }))
    .then((r): ClaspAccount => {
      const j = JSON.parse(r.stdout.slice(r.stdout.indexOf("{"))) as { loggedIn?: boolean; email?: string };
      const value = { loggedIn: !!j.loggedIn, email: j.email ?? null };
      g.__egsClaspAccount = { at: Date.now(), value };
      return value;
    })
    .catch((e): null => {
      console.error("[clasp] account check failed:", e);
      return null;
    })
    .finally(() => {
      g.__egsClaspAccountCheck = undefined;
    }));

  // Until the answer is known, assume the last one — or "signed in" (a sign-in file exists); a wrong
  // guess is corrected on the next page load, and a deploy reports a missing sign-in on its own.
  const assumed: ClaspAccount = cached?.value ?? { loggedIn: true, email: null };
  if (opts.fresh) return (await check) ?? assumed; // Settings is waiting for the real answer
  // A page render waits only briefly: clasp can take long to start right after an install or update.
  const quick = await Promise.race([check, new Promise<undefined>((resolve) => setTimeout(resolve, ACCOUNT_PAGE_WAIT_MS))]);
  return quick ?? assumed;
}

/**
 * Start `clasp login` in the background. clasp opens the user's browser on Google's consent page and
 * waits on a localhost callback; the UI polls getClaspAccount() until it flips to logged in.
 */
export async function startClaspLogin(): Promise<void> {
  await mkdir(join(dataRoot(), "clasp"), { recursive: true });
  const child = spawn(process.execPath, [claspEntry(), "-A", claspAuthPath(), "login"], {
    cwd: dataRoot(),
    env: childEnv({ ELECTRON_RUN_AS_NODE: "1", NO_COLOR: "1" }),
    windowsHide: true,
    stdio: "ignore",
    detached: true,
  });
  child.unref();
}

export async function claspLogout(): Promise<void> {
  await runClasp(["logout"]);
  g.__egsClaspAccount = undefined;
}
