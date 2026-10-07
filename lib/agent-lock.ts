import { randomUUID } from "node:crypto";

/**
 * Per-project run lock: stop two runs (agent turn, deploy, verify, restore — double-clicks, two tabs,
 * retries) from interleaving file writes and messages on the SAME project. The app is one local
 * process, so an in-memory map is enough.
 *
 * A lock older than STALE_MS is treated as abandoned and taken over. It must outlast the longest
 * legitimate run (a CLI turn can take 15 min plus a repair pass; verify runs up to 2 repairs +
 * deploys). Each holder gets a token, so a run whose lock was taken over can't release the new owner's.
 */

const STALE_MS = 45 * 60 * 1000;

interface Lock {
  token: string;
  at: number;
}

// Survive Next.js dev hot-reloads, which re-evaluate this module.
const g = globalThis as unknown as { __egsRunLocks?: Map<string, Lock> };
const locks = (g.__egsRunLocks ??= new Map<string, Lock>());

/** Returns a release token, or null when another run holds the project. */
export async function acquireProjectRun(projectId: string): Promise<string | null> {
  const held = locks.get(projectId);
  if (held && Date.now() - held.at < STALE_MS) return null;
  const token = randomUUID();
  locks.set(projectId, { token, at: Date.now() });
  return token;
}

export async function releaseProjectRun(projectId: string, token: string): Promise<void> {
  if (locks.get(projectId)?.token === token) locks.delete(projectId);
}

/** True while a run holds the project (for writes that must not land underneath it, e.g. file saves). */
export function isProjectBusy(projectId: string): boolean {
  const held = locks.get(projectId);
  return !!held && Date.now() - held.at < STALE_MS;
}
