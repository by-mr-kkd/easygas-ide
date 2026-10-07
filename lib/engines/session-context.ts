import type { CliEngine } from "@/lib/ai-choice";
import { missedSince, readEngineSession, sessionPatch, type EngineSession } from "@/lib/engines/engine-session";
import { getStoredRows } from "@/lib/messages";
import { renderRecap, transcriptOf } from "@/lib/messages-text";
import { mutateProject } from "@/lib/projects";

/**
 * What a CLI session must be told before the user's message because it was not there for it: the
 * turns another AI answered since this engine last ran, or — for a new session — the recent
 * conversation. "" when it has seen everything.
 */
export async function recapFor(projectId: string, session: EngineSession, resuming: boolean): Promise<string> {
  try {
    return renderRecap(transcriptOf(missedSince(await getStoredRows(projectId), session, resuming)));
  } catch (e) {
    console.error("[engine] conversation recap failed (non-fatal):", e);
    return "";
  }
}

/** Store this engine's session (other engines' sessions are left alone). */
export async function saveEngineSession(projectId: string, engine: CliEngine, session: Partial<EngineSession>): Promise<void> {
  await mutateProject(projectId, (current) => sessionPatch(current, engine, session));
}

/** Call after the turn's messages are appended: the session has now seen the whole history. */
export async function markSessionCaughtUp(projectId: string, engine: CliEngine): Promise<void> {
  const seen = (await getStoredRows(projectId)).length;
  await saveEngineSession(projectId, engine, { seen });
}

export { readEngineSession };
