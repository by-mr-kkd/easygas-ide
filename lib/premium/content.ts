/**
 * Paid instruction sets delivered by the licence server (server-only). The camera instructions are not in
 * the source: a registered machine fetches them (premium-content) and keeps a copy in premium.json, so a turn
 * works offline once they have been fetched. Refreshed with the weekly activation renewal.
 */
import { fetchPremiumContent } from "./api.ts";
import { CAMERA_RULES_HEADING } from "./camera-rules.ts";
import { deviceIdentity } from "./device.ts";
import { parseLicense } from "./license.ts";
import { readPremium, updatePremium } from "./store.ts";

/** The cached camera instructions, or null when they were never fetched on this machine. */
export async function cachedCameraRules(): Promise<string | null> {
  const { cameraRules } = await readPremium();
  return cameraRules && cameraRules.startsWith(CAMERA_RULES_HEADING) ? cameraRules : null;
}

/**
 * Download the camera instructions for the stored key on this machine and cache them. Returns the text, or
 * null when it cannot (no key, machine not registered, offline). Never throws.
 */
export async function refreshCameraRules(): Promise<string | null> {
  try {
    const { key } = await readPremium();
    if (!key || !parseLicense(key).ok) return null;
    const device = await deviceIdentity();
    if (!device) return null;
    const { body, version } = await fetchPremiumContent(key, device.hash, "camera_rules");
    if (!body.startsWith(CAMERA_RULES_HEADING)) return null;
    await updatePremium({ cameraRules: body, cameraRulesVersion: version });
    return body;
  } catch {
    return null;
  }
}
