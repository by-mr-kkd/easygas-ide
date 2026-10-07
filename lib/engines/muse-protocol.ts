import { isAbsolute, join } from "node:path";

/**
 * The parts of driving Meta's Muse Code CLI that need no process or disk of their own (pure —
 * unit-tested in tests/muse-protocol.test.ts): where its binary lives, which safety switches the
 * installed version must have, and how to read the events `muse exec --json` prints.
 * Checked against Muse Code 1.4.2 (2026-10-07).
 */

// ── where the binary is ─────────────────────────────────────────────────────────────────────────
// Meta's Windows installer (install.ps1) puts everything in %LOCALAPPDATA%\Programs\muse:
//   muse.cmd → .muse-launcher.ps1 (self-update) → muse-bin-<version>.exe, with the current version
//   written in .muse-version. A .cmd shim cannot be started without a shell, so the app goes
//   straight to the versioned binary.

export interface MuseLocateInput {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
  /** File contents, or null when it cannot be read. */
  readText: (path: string) => string | null;
  /** File names in a folder ([] when it cannot be listed). */
  listDir: (dir: string) => string[];
  /** Explicit path from a caller (tests, a setting). */
  override?: string;
}

const MUSE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]{0,60}$/;
const MUSE_BINARY = /^muse-bin-([0-9A-Za-z][0-9A-Za-z.+-]{0,60})\.exe$/i;

/** Numeric-aware comparison, so 1.10.0 sorts after 1.9.0. */
const byVersion = (a: string, b: string): number => a.localeCompare(b, "en", { numeric: true, sensitivity: "base" });

export function locateMuse({ env, platform, exists, readText, listDir, override }: MuseLocateInput): string | null {
  for (const explicit of [override, env.EASYGAS_MUSE_PATH?.trim()]) {
    if (explicit && isAbsolute(explicit) && exists(explicit)) return explicit;
  }
  // macOS / Linux installs are a shell launcher the app cannot start without a shell; Windows only.
  if (platform !== "win32") return null;
  const local = env.LOCALAPPDATA?.trim();
  if (!local || !isAbsolute(local)) return null;
  const dir = join(local, "Programs", "muse");

  const current = readText(join(dir, ".muse-version"))?.trim();
  if (current && MUSE_VERSION.test(current)) {
    const exe = join(dir, `muse-bin-${current}.exe`);
    if (exists(exe)) return exe;
  }
  // no usable version file (mid-update, or an older layout): the newest binary in the folder
  const versions = listDir(dir)
    .map((name) => MUSE_BINARY.exec(name)?.[1])
    .filter((v): v is string => !!v)
    .sort(byVersion);
  const newest = versions.at(-1);
  return newest ? join(dir, `muse-bin-${newest}.exe`) : null;
}

// ── the switches that make it a pure model ──────────────────────────────────────────────────────

/**
 * Every run passes these. Together they leave Muse Code with nothing that reaches the machine or
 * the network: no shell, no file writes, no web tools, a sandbox with the network cut, and nothing
 * auto-approved. `--no-foreign-personal-context` keeps rules and skills imported from other tools out.
 */
export const MUSE_LOCKDOWN = [
  "--disable-shell",
  "--disable-write",
  "--disable-web-tools",
  "--sandbox-network",
  "restricted",
  "--approval-mode",
  "untrusted",
  "--approval-judge",
  "off",
  "--no-foreign-personal-context",
];

/** Flags the installed version must list under `muse exec --help`, or the app refuses to use it. */
export const MUSE_REQUIRED_FLAGS = [
  "--json",
  "--prompt-file",
  "--output-schema",
  "--session-id",
  "--max-model-steps",
  "--disable-shell",
  "--disable-write",
  "--disable-web-tools",
  "--sandbox-network",
  "--approval-mode",
  "--approval-judge",
  "--no-foreign-personal-context",
];

/** Which required flags `muse exec --help` does not mention (empty = safe to run). */
export function missingMuseFlags(execHelp: string): string[] {
  const listed = new Set(execHelp.match(/--[a-z][a-z0-9-]*/g) ?? []);
  return MUSE_REQUIRED_FLAGS.filter((f) => !listed.has(f));
}

/** "Muse Code 1.4.2 (1.4.2-R4684.1)" → the first line, capped. */
export function museVersionLine(output: string): string | null {
  const line = output.split(/\r?\n/).find((l) => /muse/i.test(l) && /\d/.test(l))?.trim();
  return line ? line.slice(0, 80) : null;
}

// ── reading `muse exec --json` ──────────────────────────────────────────────────────────────────

export type MuseEvent =
  | { kind: "started" }
  | { kind: "model"; model: string }
  | { kind: "thinking" }
  | { kind: "completed"; text: string }
  | { kind: "failed"; reason: string }
  | { kind: "other" };

/**
 * One JSONL line → what the engine cares about. The run ends with a `run.terminal.*` record whose
 * `text` is the whole final answer (the JSON object when --output-schema is set); the streamed
 * `run.output.delta` pieces are the same text in fragments and are ignored.
 */
export function readMuseEvent(line: string): MuseEvent {
  let ev: { payload_type?: unknown; payload?: unknown };
  try {
    ev = JSON.parse(line) as { payload_type?: unknown; payload?: unknown };
  } catch {
    return { kind: "other" };
  }
  const type = typeof ev?.payload_type === "string" ? ev.payload_type : "";
  const p = (ev?.payload && typeof ev.payload === "object" ? ev.payload : {}) as Record<string, unknown>;
  if (type === "run.lifecycle.started") return { kind: "started" };
  if (type === "run.model.configured" && typeof p.model_id === "string") return { kind: "model", model: p.model_id.slice(0, 80) };
  if (type === "run.output.delta") return { kind: "thinking" };
  if (type.startsWith("run.terminal.")) {
    const text = typeof p.text === "string" ? p.text : "";
    if (p.terminal === "completed") return { kind: "completed", text };
    const reason = typeof p.reason === "string" && p.reason ? p.reason : text || String(p.terminal ?? "failed");
    return { kind: "failed", reason: reason.slice(0, 400) };
  }
  return { kind: "other" };
}
