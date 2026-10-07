/**
 * Per-turn camera text for the AI (lib/premium/camera-gate decides which one). Rides on the turn's
 * user message like rule cards: never stored in history, never in the fixed/cached system block, so
 * a resumed CLI session sees it too. The "allowed" set is the paid product: facts verified live on
 * GitHub Pages + a GAS backend.
 */
import type { CameraGateResult } from "./camera-gate.ts";

/**
 * The paid "allowed" instructions are NOT in this open-source file: the licence server hands them to a
 * registered machine (premium-content, cached in premium.json, see content.ts). They must start with this
 * heading, which the fixed prompt (lib/gas-codegen.ts) names as the only exception to its camera ban.
 */
export const CAMERA_RULES_HEADING = "## Camera (premium project, front page published to GitHub Pages)";

/** "allowed" but the instructions could not be loaded (never fetched and offline): build nothing camera-related. */
export const CAMERA_RULES_UNAVAILABLE = `## Camera: Pro is active but the camera instructions could not be loaded
Do NOT write camera code in this turn (getUserMedia, <input capture>, scanners). In one Thai sentence tell the user
that the Pro camera instructions could not be downloaded, to check the internet connection and send the request
again. Build the rest of the request as usual.`;

const NEED_GITHUB = `## Camera: premium is active but GitHub is not connected
Do NOT write camera code in this turn (getUserMedia, <input capture>, scanners). In one or two Thai sentences tell
the user to connect GitHub first at ตั้งค่า → Pro, then send the request again; the app shows a button for it.
Build the rest of the request as usual.`;

function needPremium(promo: boolean | undefined): string {
  return `## Camera: not available in this project (no Pro licence)
This overrides the "offer the workable alternative" line in the fixed instructions for the camera part.
Do NOT build the camera part at all in this turn: no camera code (getUserMedia, <input capture>, scanners) and no
substitute built in its place (no photo-upload or code-entry screen standing in for it), and leave it out of a
proposed spec. Build the rest of the request as usual. In ONE Thai sentence tell the user that Google does not
support using the camera in Google Apps Script web apps, so this part was left out; you may name in words what
would work instead (typing a code, attaching a picture taken earlier) and build it only if the user asks for it
in a later message. Add ONE sentence that EasyGAS Pro unlocks camera apps${promo ? " (a launch promotion at a special price is on now)" : ""}.
No pressure wording, do not repeat the offer elsewhere in the answer; the app shows a button for it.`;
}

/**
 * The block to put in the turn message for this gate state; "" when the gate is off. `rules` = the
 * server-delivered camera instructions (only used when allowed).
 */
export function renderCameraGateBlock(r: CameraGateResult, rules?: string | null): string {
  switch (r.gate) {
    case "allowed":
      return rules && rules.startsWith(CAMERA_RULES_HEADING) ? rules : CAMERA_RULES_UNAVAILABLE;
    case "need-github":
      return NEED_GITHUB;
    case "need-premium":
      return needPremium(r.promo);
    default:
      return "";
  }
}
