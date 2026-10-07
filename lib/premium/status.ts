import { activationValidFor, maskLicenseKey, parseActivation, parseLicense } from "./license.ts";
import { deviceIdentity } from "./device.ts";
import { readPremium } from "./store.ts";

export interface PremiumStatus {
  active: boolean;
  email?: string;
  licenseId?: string;
  /** first and last 6 characters of the key; the key itself only goes out through revealPremiumKeyAction */
  keyMask?: string;
  /** a valid key is stored but this machine is not (or no longer) activated: Pro is off until it is */
  needsDevice?: boolean;
  /** when the current activation token runs out (ISO); renewed while online, so normally never reached */
  activeUntil?: string;
  /** set by the actions only: why the last try to activate this machine failed (never stored) */
  deviceError?: string;
}

/**
 * Whether this install may use Pro: a valid licence key (checked offline against the public key) AND an
 * unexpired activation token for this licence on this machine. Reads files only — no network, no writes —
 * so it is safe at render time. Renewal happens in refreshPremiumDeviceAction.
 */
export async function premiumStatus(): Promise<PremiumStatus> {
  const { key, activation } = await readPremium();
  if (!key) return { active: false };
  const parsed = parseLicense(key);
  if (!parsed.ok) return { active: false };
  const base = { email: parsed.payload.email, licenseId: parsed.payload.id, keyMask: maskLicenseKey(key) };

  const device = await deviceIdentity();
  const token = activation ? parseActivation(activation) : null;
  if (device && token?.ok && activationValidFor(token.payload, parsed.payload.id, device.hash)) {
    return { active: true, ...base, activeUntil: new Date(token.payload.exp * 1000).toISOString() };
  }
  return { active: false, ...base, needsDevice: true };
}
