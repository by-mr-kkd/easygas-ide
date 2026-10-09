import "server-only";
import { headers } from "next/headers";
import { premiumStatus } from "@/lib/premium/status";
import { remoteSnapshot } from "./runtime";
import { remoteDeviceOf } from "./turn-notify";

/**
 * Pro, opened from a paired phone that has no notifications yet: worth pointing that phone to the Pro app
 * (easygaside.tech/app) — install it to the home screen and turn notifications on there. False on the
 * computer itself, for Free, and once the phone has notifications.
 */
export async function shouldNudgeApp(): Promise<boolean> {
  const phone = remoteDeviceOf(await headers());
  if (!phone) return false;
  const [premium, remote] = await Promise.all([premiumStatus().catch(() => ({ active: false })), remoteSnapshot().catch(() => null)]);
  return !!(premium.active && remote?.devices.some((d) => d.id === phone && !d.push));
}
