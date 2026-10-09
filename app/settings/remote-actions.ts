"use server";

/**
 * Settings → ใช้จากมือถือ. Every action here is for the person at the computer only: a phone that is in
 * through the gateway cannot read the pairing code, change the PIN, pair or remove devices, or switch
 * remote access off and on (lib/remote/request.ts).
 */
import { premiumStatus } from "@/lib/premium/status";
import { validPin, weakPin } from "@/lib/remote/auth";
import { assertLocalRequest } from "@/lib/remote/request";
import {
  cancelPairing,
  newPairing,
  remoteSnapshot,
  removeRemoteDevice,
  setRelayName,
  setRemoteEnabled,
  setRemotePin,
} from "@/lib/remote/runtime";
import { RelayError } from "@/lib/remote/relay";
import { remoteView, type RemoteView } from "@/lib/remote/view";

export type { RemoteView };

async function view(): Promise<RemoteView> {
  const [snap, premium] = await Promise.all([remoteSnapshot(), premiumStatus().catch(() => ({ active: false }))]);
  return remoteView(snap, premium.active);
}

export async function setRelayNameAction(name: string): Promise<{ ok: true; view: RemoteView } | { ok: false; error: string }> {
  await assertLocalRequest();
  try {
    await setRelayName(String(name ?? "").slice(0, 40));
    return { ok: true, view: await view() };
  } catch (e) {
    return { ok: false, error: e instanceof RelayError || e instanceof Error ? e.message : "ตั้งชื่อไม่สำเร็จ" };
  }
}

export async function remoteStatusAction(): Promise<RemoteView> {
  await assertLocalRequest();
  return view();
}

export async function setRemoteAction(on: boolean, mode: "tunnel" | "lan"): Promise<{ ok: true; view: RemoteView } | { ok: false; error: string }> {
  await assertLocalRequest();
  if (mode !== "tunnel" && mode !== "lan") return { ok: false, error: "เลือกทางเชื่อมต่อก่อน" };
  const cur = await view();
  if (on && cur.pro && !cur.pinSet) return { ok: false, error: "Pro ต้องตั้ง PIN ก่อนเปิด เพราะลิงก์ประจำเครื่องเปิดได้จากที่ไหนก็ได้" };
  await setRemoteEnabled(on, mode);
  return { ok: true, view: await view() };
}

export async function pairPhoneAction(): Promise<RemoteView> {
  await assertLocalRequest();
  newPairing();
  return view();
}

export async function cancelPairAction(): Promise<RemoteView> {
  await assertLocalRequest();
  cancelPairing();
  return view();
}

export async function setRemotePinAction(pin: string | null): Promise<{ ok: true; view: RemoteView } | { ok: false; error: string }> {
  await assertLocalRequest();
  if (pin === null) {
    const cur = await view();
    if (cur.pro) return { ok: false, error: "Pro ต้องมี PIN เปลี่ยน PIN ได้ แต่เลิกใช้ไม่ได้" };
    await setRemotePin(null);
    return { ok: true, view: await view() };
  }
  const p = pin.trim();
  if (!validPin(p)) return { ok: false, error: "PIN ต้องเป็นตัวเลข 6 หลัก" };
  if (weakPin(p)) return { ok: false, error: "PIN นี้เดาง่ายเกินไป เช่น 123456 หรือ 000000 ลองตัวเลขอื่น" };
  await setRemotePin(p);
  return { ok: true, view: await view() };
}

export async function removeRemoteDeviceAction(id: string): Promise<RemoteView> {
  await assertLocalRequest();
  if (typeof id === "string" && id.length <= 64) await removeRemoteDevice(id);
  return view();
}
