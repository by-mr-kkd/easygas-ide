import type { CliEngine } from "../ai-choice.ts";
import type { PromptFingerprint } from "./session-prompt.ts";

/**
 * Each CLI engine keeps its own conversation (pure — unit-tested in tests/engine-session.test.ts).
 * The user can switch AI from one message to the next, so a project remembers one session PER engine
 * and how much of the app's chat history that session has seen; the turns it missed are quoted to it
 * the next time it is used (lib/messages-text.ts renderRecap).
 */

export interface EngineSession {
  /** The CLI's own session / thread id, or null when there is none to resume. */
  id: string | null;
  /** Fingerprints of the instructions that session was given (lib/engines/session-prompt.ts). */
  told: PromptFingerprint | null;
  /** How many rows of messages.jsonl existed when it last answered; null = not recorded. */
  seen: number | null;
}

export type EngineSessions = Partial<Record<CliEngine, EngineSession>>;

/** The slice of a project record this module reads and writes. */
export interface SessionFields {
  engine_sessions?: EngineSessions | null;
  /** Before per-engine sessions: one id + fingerprint for whichever engine ran last. */
  engine_session_id?: string | null;
  engine_prompt?: PromptFingerprint | null;
}

export function readEngineSession(project: SessionFields, engine: CliEngine): EngineSession {
  const own = project.engine_sessions?.[engine];
  if (own) return { id: own.id ?? null, told: own.told ?? null, seen: typeof own.seen === "number" ? own.seen : null };
  // A record from before per-engine sessions. Whose it was is not recorded, and it does not need to
  // be: every engine's instructions differ, so a fingerprint that does not match starts a new session.
  return { id: project.engine_session_id ?? null, told: project.engine_prompt ?? null, seen: null };
}

/** The patch that stores `session` for `engine`, leaving the other engines' sessions alone. */
export function sessionPatch(project: SessionFields, engine: CliEngine, session: Partial<EngineSession>): Required<SessionFields> {
  const current = readEngineSession(project, engine);
  return {
    engine_sessions: { ...(project.engine_sessions ?? {}), [engine]: { ...current, ...session } },
    // the old single slot is retired on first write, so no other engine mistakes it for its own
    engine_session_id: null,
    engine_prompt: null,
  };
}

/** The rows a session has not seen: everything for a new session, the tail for a resumed one. */
export function missedSince<T>(rows: T[], session: EngineSession, resuming: boolean): T[] {
  if (!resuming) return rows;
  if (session.seen === null) return []; // an older record: assume it was there for all of it
  return rows.slice(Math.max(0, Math.min(session.seen, rows.length)));
}
