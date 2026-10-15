import { randomUUID } from "node:crypto";

/**
 * Per-project run lock: stop two runs (agent turn, deploy, verify, restore — double-clicks, two tabs,
 * retries) from interleaving file writes and messages on the SAME project. The app is one local
 * process, so an in-memory map is enough.
 *
 * A lock older than STALE_MS is treated as abandoned and taken over. It must outlast the longest
 * legitimate run (a CLI turn can take 15 min plus a repair pass; verify runs up to 2 repairs +
 * deploys). Each holder gets a token, so a run whose lock was taken over can't release the new owner's.
 *
 * The lock also carries what the run is doing (its kind and the last status line it streamed), so a page
 * that did not start it — a phone, another tab, a reload that cut the stream — can show the same line
 * through GET /api/run-status/<id> (lib/run-status). Short Thai text only, nothing secret.
 */

const STALE_MS = 45 * 60 * 1000;

/** agent / verify stream into the chat (a page that did not start one shows it and reloads after); deploy and
 * sync (a publish, a /dev push, an import or restore) change files or Google but never the chat */
export type RunKind = "agent" | "verify" | "deploy" | "sync";

interface Lock {
  token: string;
  at: number;
  kind: RunKind;
  /** the last status line the run streamed (what the starting page shows under the chat) */
  text: string | null;
}

/** What a page that did not start the run gets to see (lib/run-status). */
export type RunStatus = { kind: RunKind; startedAt: number; text: string | null };

// Survive Next.js dev hot-reloads, which re-evaluate this module.
const g = globalThis as unknown as { __egsRunLocks?: Map<string, Lock> };
const locks = (g.__egsRunLocks ??= new Map<string, Lock>());

const live = (l: Lock | undefined): l is Lock => !!l && Date.now() - l.at < STALE_MS;

/** Returns a release token, or null when another run holds the project. */
export async function acquireProjectRun(projectId: string, kind: RunKind = "agent"): Promise<string | null> {
  if (live(locks.get(projectId))) return null;
  const token = randomUUID();
  locks.set(projectId, { token, at: Date.now(), kind, text: null });
  return token;
}

export async function releaseProjectRun(projectId: string, token: string): Promise<void> {
  if (locks.get(projectId)?.token === token) locks.delete(projectId);
}

/** The run's current status line, for pages that did not start it. Ignored when nothing holds the project. */
export function noteRunStatus(projectId: string, text: string | null): void {
  const l = locks.get(projectId);
  if (l) l.text = text ? text.slice(0, 200) : null;
}

/** The run holding the project right now, or null. */
export function readRunStatus(projectId: string): RunStatus | null {
  const l = locks.get(projectId);
  return live(l) ? { kind: l.kind, startedAt: l.at, text: l.text } : null;
}

/** The projects a run holds right now (AI turn, re-check, publish): the home screen lists them first. */
export function busyProjectIds(): string[] {
  return [...locks.entries()].filter(([, l]) => live(l)).map(([id]) => id);
}

/** True while a run holds the project (for writes that must not land underneath it, e.g. file saves). */
export function isProjectBusy(projectId: string): boolean {
  return live(locks.get(projectId));
}
