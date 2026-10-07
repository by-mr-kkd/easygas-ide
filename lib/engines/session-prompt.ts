/**
 * Keeping a resumed CLI session in step with its instructions (pure — unit-tested).
 *
 * Claude Code keeps the system prompt a session STARTED with: a changed --append-system-prompt-file is
 * not applied on --resume (verified live — docs/SPIKES.md). So the app records what the stored session
 * was told, as two fingerprints, and decides before each turn:
 *  - core  (rulebook + rule-card index + adapter) changed → start a fresh session; these change only
 *    with an app or rulebook update, and the project files carry the state that matters.
 *  - prefs (look & feel + how to propose a lesson) changed → keep the session and send the new text
 *    in the turn's message.
 */

export interface PromptFingerprint {
  core: string;
  prefs: string;
}

export interface SessionPlan {
  /** Session to resume, or null to start a fresh one. */
  resumeId: string | null;
  /** Send the current settings text ahead of the user's message. */
  sendNotice: boolean;
}

export function planSession(
  sessionId: string | null | undefined,
  told: PromptFingerprint | null | undefined,
  current: PromptFingerprint,
): SessionPlan {
  // no record of what a stored session was told (a project from an older app version) → cannot trust it
  if (!sessionId || !told || told.core !== current.core) return { resumeId: null, sendNotice: false };
  return { resumeId: sessionId, sendNotice: told.prefs !== current.prefs };
}

/**
 * What to record when a turn FAILED but left a session id. A fresh session got the current system
 * prompt whatever happened next. A resumed one may have died before reading the message, so do not
 * claim it saw the notice: keep the old record and the notice is simply sent again next turn.
 */
export function toldAfterFailure(
  plan: SessionPlan,
  told: PromptFingerprint | null | undefined,
  current: PromptFingerprint,
): PromptFingerprint | null {
  return plan.resumeId ? (told ?? null) : current;
}

/** Tells a resumed session that the settings part of its system prompt has been replaced. */
export function settingsNotice(settings: string): string {
  return (
    `[EasyGAS: the user's settings changed after this conversation started. The sections below REPLACE the sections ` +
    `with the same headings in your system prompt — follow these from now on.]\n${settings.trim()}`
  );
}
