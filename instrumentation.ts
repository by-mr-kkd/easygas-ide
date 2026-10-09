/**
 * Runs once when the app's server starts (Next instrumentation hook). Brings the remote gateway back up
 * if "use from a phone" was on when the app last ran (lib/remote/runtime.ts), and starts the Pro Fast Track
 * answer check (lib/support/fast-track.ts). The condition is written
 * inline so the edge build drops the Node-only import (Next's documented pattern).
 */
export async function register(): Promise<void> {
  if (process.env.NEXT_RUNTIME === "nodejs") {
    const { announce, resumeRemote } = await import("./lib/remote/runtime");
    await resumeRemote().catch((e) => console.error("[remote] resume failed:", e));
    // Pro Fast Track: tell the user when the owner answers (quiet without tickets)
    const { startFastTrackWatch } = await import("./lib/support/fast-track");
    startFastTrackWatch((title, body) => void announce(title, body, "/settings?s=support").catch(() => {}));
  }
}
