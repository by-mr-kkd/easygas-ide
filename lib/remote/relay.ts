/**
 * Pro: one fixed link for the phone (server-only). Each time the tunnel gets a new address the app tells
 * the licence server (premium-remote) with the licence key and this machine's id (the server checks the
 * machine is still registered to the licence, as premium-content does). The phone opens
 * easygaside.tech/r/<id or name> or the Pro app at easygaside.tech/app, which look the current address up
 * and open it with the device token the phone keeps there. The server learns the address and the chosen
 * name only: never the PIN, never a device token.
 */
import { PREMIUM_SERVER } from "../premium/config.ts";
import { premiumStatus } from "../premium/status.ts";
import { deviceIdentity } from "../premium/device.ts";
import { readPremium } from "../premium/store.ts";

export const RELAY_SITE = "https://easygaside.tech";

/** The page that opens this machine from a phone (the name when one is set, else the random id). */
export const relayPageUrl = (idOrName: string): string => `${RELAY_SITE}/r/${idOrName}`;

export interface RelayLink {
  id: string;
  name: string | null;
}

async function call(body: Record<string, unknown>): Promise<RelayLink> {
  const [{ key }, device] = await Promise.all([readPremium(), deviceIdentity()]);
  if (!key || !device) throw new RelayError("not_pro", "ต้องเปิดใช้ Pro บนเครื่องนี้ก่อน");
  const res = await fetch(`${PREMIUM_SERVER}/premium-remote`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ ...body, key, deviceHash: device.hash }),
    signal: AbortSignal.timeout(15_000),
  });
  const out = (await res.json().catch(() => ({}))) as { id?: unknown; name?: unknown; error?: unknown; message?: unknown };
  if (!res.ok || typeof out.id !== "string") {
    throw new RelayError(String(out.error ?? `http_${res.status}`), typeof out.message === "string" ? out.message : "ติดต่อเซิร์ฟเวอร์ Pro ไม่ได้ ลองใหม่อีกครั้ง");
  }
  return { id: out.id, name: typeof out.name === "string" ? out.name : null };
}

export class RelayError extends Error {
  constructor(
    public code: string,
    message: string,
  ) {
    super(message);
  }
}

/**
 * Report the tunnel's address; the machine's fixed link, or null when this install is not Pro. `hb` tells the
 * server this app repeats the report (lib/remote/runtime.ts HEARTBEAT_MS), so a silent address can be called
 * offline instead of being shown as online forever.
 */
export async function reportRelayUrl(url: string): Promise<RelayLink | null> {
  if (!(await premiumStatus()).active) return null;
  return call({ url, hb: true });
}

/** Remote access stopped or the tunnel dropped: the phone app shows this machine offline at once. */
export async function reportRelayOff(): Promise<void> {
  if (!(await premiumStatus()).active) return;
  await call({ action: "off" });
}

/** Pick the link's name (unique; the server says when it is taken, reserved or changed too recently). */
export async function renameRelay(name: string): Promise<RelayLink> {
  if (!(await premiumStatus()).active) throw new RelayError("not_pro", "ตั้งชื่อลิงก์ได้เฉพาะ Pro");
  return call({ action: "rename", name });
}
