"use server";

import { assertLocalRequest } from "@/lib/remote/request";

/**
 * Premium server actions. Every call is triggered by a user action in the dialog or Settings (never at
 * render). The licence key and the order secret stay in premium.json; the client receives view objects.
 * The one exception is revealPremiumKeyAction: the user explicitly asks to see or copy their own key.
 */
import { revalidatePath } from "next/cache";
import {
  activateDevice,
  apiErrorText,
  createOrder,
  deactivateDevice,
  fetchOrderStatus,
  PremiumApiError,
  requestEmailCode,
  restoreLicense,
  submitSlip,
  SLIP_MAX_BYTES,
} from "@/lib/premium/api";
import { ACTIVATION_REFRESH_DAYS } from "@/lib/premium/config";
import { refreshCameraRules, refreshPagesRuntime } from "@/lib/premium/content";
import { deviceIdentity, ensureDeviceIdentity } from "@/lib/premium/device";
import { LICENSE_FAILURE_TEXT, normalizeLicenseKey, parseActivation, parseLicense } from "@/lib/premium/license";
import { getOffer } from "@/lib/premium/offer";
import { premiumStatus } from "@/lib/premium/status";
import { readPremium, updatePremium, type PendingOrder } from "@/lib/premium/store";
import {
  normalizeEmailCode,
  RESTORE_UNAVAILABLE_TEXT,
  type ActionResult,
  type EmailCodePurpose,
  type OfferView,
  type OrderView,
  type PollOutcome,
  type PremiumStatus,
  type SlipOutcome,
} from "@/lib/premium/types";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const BASE64 = /^[A-Za-z0-9+/]+={0,2}$/;

const fail = (error: string, code?: string): { ok: false; error: string; code?: string } =>
  code ? { ok: false, error, code } : { ok: false, error };

/** A failed licence-server call as an action result, keeping the server's error code for the UI. */
const failFrom = (e: unknown) => fail(apiErrorText(e), e instanceof PremiumApiError ? e.code : undefined);

const EMAIL_TEXT = "กรอกอีเมลให้ถูกต้อง";

function cleanEmail(input: string): string | null {
  const email = String(input ?? "").trim().toLowerCase();
  return email && email.length <= 254 && EMAIL.test(email) ? email : null;
}

function orderView(o: PendingOrder): OrderView {
  const { secret: _secret, ...view } = o;
  return view;
}

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
};

/** Thai explanation of a failed machine activation, naming the machines that hold the slots. */
function deviceErrorText(e: unknown): string {
  if (e instanceof PremiumApiError && e.code === "too_many_devices") {
    const max = e.maxDevices ?? 2;
    const list = (e.devices ?? []).map((d) => `${d.label ?? "เครื่องไม่ทราบชื่อ"}${d.lastSeenAt ? ` (ใช้ล่าสุด ${shortDate(d.lastSeenAt)})` : ""}`).join(", ");
    return `รหัสนี้ใช้ครบ ${max} เครื่องแล้ว${list ? `: ${list}` : ""} กด “เพิกถอนจากเครื่องนี้” ในเครื่องที่ไม่ใช้แล้ว (ตั้งค่า → Pro) หรือทักเราในกลุ่ม Facebook`;
  }
  if (e instanceof PremiumApiError && (e.code === "unreachable" || e.code === "timeout")) {
    return "ต้องต่ออินเทอร์เน็ตเพื่อยืนยันเครื่องนี้ ต่อเน็ตแล้วกด “ยืนยันเครื่องนี้”";
  }
  return apiErrorText(e);
}

/** Register this machine for the stored key and keep the token. Returns null on success, else the Thai reason. */
async function activateThisMachine(key: string): Promise<string | null> {
  try {
    const device = await ensureDeviceIdentity();
    const granted = await activateDevice(key, device.hash, device.label);
    if (!parseActivation(granted.token).ok) return "เซิร์ฟเวอร์ส่งข้อมูลยืนยันเครื่องที่ตรวจไม่ผ่าน ลองใหม่อีกครั้ง";
    await updatePremium({ activation: granted.token });
    await Promise.all([refreshCameraRules(), refreshPagesRuntime()]); // best effort: fetched again when first needed
    return null;
  } catch (e) {
    return deviceErrorText(e);
  }
}

/**
 * Store a key the server or the user handed us (it must verify offline), then register this machine.
 * The key is kept even when the machine cannot be registered yet (offline, or the licence is on its
 * maximum number of machines): it was paid for, and Settings offers "ยืนยันเครื่องนี้" to retry.
 */
async function activate(key: string): Promise<ActionResult<PremiumStatus>> {
  const parsed = parseLicense(key);
  if (!parsed.ok) return fail(LICENSE_FAILURE_TEXT[parsed.reason]);
  const normalized = normalizeLicenseKey(key);
  await updatePremium({ key: normalized, pendingOrder: null, activation: null });
  const deviceError = await activateThisMachine(normalized);
  revalidatePath("/settings");
  const status = await premiumStatus();
  return { ok: true, data: deviceError ? { ...status, deviceError } : status };
}

export async function getPremiumStatusAction(): Promise<PremiumStatus> {
  return premiumStatus();
}

/**
 * The offer plus any order the user left half-finished (so the dialog can resume it). A pending order is
 * returned even when the server cannot be reached (`offer: null`): the PromptPay QR renders offline.
 */
export async function getPremiumOfferAction(
  force = false,
): Promise<ActionResult<{ offer: OfferView | null; pendingOrder: OrderView | null; activated?: PremiumStatus }>> {
  const { pendingOrder } = await readPremium();
  if (pendingOrder) {
    // the order may have been fulfilled while the dialog was closed (a slip checked later, or a key
    // issued by hand): one status check before showing the QR again
    const polled = await pollPremiumOrderAction();
    if (polled.ok && polled.data.status === "paid") {
      return { ok: true, data: { offer: null, pendingOrder: null, activated: polled.data.premium } };
    }
  }
  const pending = pendingOrder ? orderView(pendingOrder) : null;
  try {
    const offer = await getOffer(force);
    return { ok: true, data: { offer, pendingOrder: pending } };
  } catch (e) {
    if (pending) return { ok: true, data: { offer: null, pendingOrder: pending } };
    return failFrom(e);
  }
}

/** Email a 6-digit code: `order` before buying (when the offer says emailVerify), `restore` on a new computer. */
export async function requestPremiumEmailCodeAction(
  emailInput: string,
  purpose: EmailCodePurpose,
): Promise<ActionResult<{ expiresAt: string }>> {
  const email = cleanEmail(emailInput);
  if (!email) return fail(EMAIL_TEXT, "invalid_email");
  if (purpose !== "order" && purpose !== "restore") return fail("คำขอไม่ถูกต้อง");
  try {
    return { ok: true, data: await requestEmailCode(email, purpose) };
  } catch (e) {
    if (purpose === "restore" && e instanceof PremiumApiError && e.code === "email_unavailable") {
      return fail(RESTORE_UNAVAILABLE_TEXT, e.code);
    }
    return failFrom(e);
  }
}

/** `codeInput` = the emailed order code; only sent when the offer asks for it (emailVerify). */
export async function startPremiumOrderAction(emailInput: string, codeInput?: string): Promise<ActionResult<OrderView>> {
  await assertLocalRequest();
  const email = cleanEmail(emailInput);
  if (!email) return fail("กรอกอีเมลให้ถูกต้อง รหัสจะถูกออกให้อีเมลนี้", "invalid_email");
  let code: string | undefined;
  if (codeInput !== undefined) {
    const normalized = normalizeEmailCode(codeInput);
    if (!normalized) return fail("รหัสยืนยันต้องเป็นตัวเลข 6 หลัก", "code_invalid");
    code = normalized;
  }
  try {
    const created = await createOrder(email, code);
    const order: PendingOrder = { ...created, email };
    await updatePremium({ pendingOrder: order });
    return { ok: true, data: orderView(order) };
  } catch (e) {
    return failFrom(e);
  }
}

/**
 * Restore on a new computer: trade the emailed `restore` code for the key, verify it offline (and that it
 * belongs to this email) before storing it, exactly like a purchased key.
 */
export async function restorePremiumAction(emailInput: string, codeInput: string): Promise<ActionResult<PremiumStatus>> {
  const email = cleanEmail(emailInput);
  if (!email) return fail(EMAIL_TEXT, "invalid_email");
  const code = normalizeEmailCode(codeInput);
  if (!code) return fail("รหัสยืนยันต้องเป็นตัวเลข 6 หลัก", "code_invalid");
  let key: string;
  try {
    key = (await restoreLicense(email, code)).key;
  } catch (e) {
    return failFrom(e);
  }
  const parsed = parseLicense(key);
  if (!parsed.ok) return fail(`รหัสที่ได้รับตรวจไม่ผ่าน (${LICENSE_FAILURE_TEXT[parsed.reason]}) ติดต่อเราพร้อมอีเมล ${email}`);
  if (parsed.payload.email !== email) return fail(`รหัสที่ได้รับไม่ตรงกับอีเมลนี้ ติดต่อเราพร้อมอีเมล ${email}`);
  return activate(key);
}

/** The stored key, on the user's explicit request (the "แสดงรหัส" / "คัดลอกรหัส" buttons). */
export async function revealPremiumKeyAction(): Promise<ActionResult<{ key: string }>> {
  await assertLocalRequest();
  const { key } = await readPremium();
  if (!key || !parseLicense(key).ok) return fail("ไม่พบรหัส Pro ที่ใช้งานได้บนเครื่องนี้");
  return { ok: true, data: { key } };
}

/** `imageBase64` = JPEG/PNG without a `data:` prefix (the client shrinks the image first). */
export async function submitPremiumSlipAction(imageBase64: string): Promise<ActionResult<SlipOutcome>> {
  const { pendingOrder } = await readPremium();
  if (!pendingOrder) return fail("ไม่พบคำสั่งซื้อที่รอชำระ เริ่มสั่งซื้อใหม่");
  const image = String(imageBase64 ?? "").replace(/^data:[^,]*,/, "").replace(/\s+/g, "");
  if (!image || !BASE64.test(image)) return fail("ไฟล์รูปไม่ถูกต้อง เลือกรูปสลิปเป็น JPEG หรือ PNG");
  if (image.length * 0.75 > SLIP_MAX_BYTES) return fail("รูปใหญ่เกิน 4 MB ลองย่อรูปหรือถ่ายภาพหน้าจอใหม่");
  try {
    const result = await submitSlip(pendingOrder.orderId, pendingOrder.secret, image);
    if (result.status === "paid") {
      const activated = await activate(result.key);
      if (!activated.ok) return fail(`ชำระสำเร็จแต่รหัสที่ได้รับตรวจไม่ผ่าน (${activated.error}) ติดต่อเราพร้อมอีเมล ${pendingOrder.email}`);
      return { ok: true, data: { status: "paid", premium: activated.data } };
    }
    return { ok: true, data: result };
  } catch (e) {
    return failFrom(e);
  }
}

/** Poll the pending order; on `paid` the key is verified offline, stored, and the order cleared. */
export async function pollPremiumOrderAction(): Promise<ActionResult<PollOutcome>> {
  const { pendingOrder } = await readPremium();
  if (!pendingOrder) return fail("ไม่พบคำสั่งซื้อที่รอชำระ");
  try {
    const r = await fetchOrderStatus(pendingOrder.orderId, pendingOrder.secret);
    if (r.status === "paid") {
      if (!r.key) return fail("เซิร์ฟเวอร์แจ้งว่าชำระแล้วแต่ไม่ได้ส่งรหัสมา ลองใหม่อีกครั้ง");
      const activated = await activate(r.key);
      if (!activated.ok) return fail(`ชำระสำเร็จแต่รหัสที่ได้รับตรวจไม่ผ่าน (${activated.error}) ติดต่อเราพร้อมอีเมล ${pendingOrder.email}`);
      return { ok: true, data: { status: "paid", premium: activated.data } };
    }
    if (r.status === "pending") return { ok: true, data: { status: "pending" } };
    // the order is finished without a payment: nothing left to resume
    await updatePremium({ pendingOrder: null });
    return { ok: true, data: { status: r.status } };
  } catch (e) {
    return failFrom(e);
  }
}

export async function activatePremiumKeyAction(keyInput: string): Promise<ActionResult<PremiumStatus>> {
  await assertLocalRequest();
  const key = normalizeLicenseKey(String(keyInput ?? ""));
  if (!key) return fail("วางรหัสก่อน");
  if (key.length > 4096) return fail(LICENSE_FAILURE_TEXT.bad_format);
  return activate(key);
}

/** "ยืนยันเครื่องนี้": retry registering this machine for the stored key. */
export async function activateThisDeviceAction(): Promise<PremiumStatus> {
  const { key } = await readPremium();
  if (!key || !parseLicense(key).ok) return premiumStatus();
  const deviceError = await activateThisMachine(key);
  revalidatePath("/settings");
  const status = await premiumStatus();
  return deviceError ? { ...status, deviceError } : status;
}

/**
 * Quiet renewal, called by the app shell when it opens (never at render). Talks to the server only when the
 * token is missing or older than ACTIVATION_REFRESH_DAYS. Offline: keeps the current token (Pro keeps
 * working until it expires). Revoked licence, or this machine's slot removed and the licence full: the
 * token is dropped at once.
 */
export async function refreshPremiumDeviceAction(): Promise<{ active: boolean }> {
  const { key, activation } = await readPremium();
  if (!key || !parseLicense(key).ok) return { active: false };
  const token = activation ? parseActivation(activation) : null;
  const ageDays = token?.ok ? (Date.now() / 1000 - token.payload.iat) / 86_400 : Infinity;
  if (ageDays < ACTIVATION_REFRESH_DAYS) {
    const status = await premiumStatus();
    // active but the camera instructions were never downloaded (e.g. offline at activation): try now
    if (status.active) {
      const file = await readPremium();
      if (!file.cameraRules) await refreshCameraRules();
      if (!file.pagesRuntime) await refreshPagesRuntime();
    }
    return { active: status.active };
  }
  const device = await deviceIdentity();
  if (!device && !activation) return { active: false }; // never activated here: wait for the user
  try {
    const d = device ?? (await ensureDeviceIdentity());
    const granted = await activateDevice(key, d.hash, d.label);
    if (parseActivation(granted.token).ok) {
      await updatePremium({ activation: granted.token });
      await Promise.all([refreshCameraRules(), refreshPagesRuntime()]);
    }
  } catch (e) {
    if (e instanceof PremiumApiError && ["revoked", "too_many_devices", "unknown_key"].includes(e.code)) {
      await updatePremium({ activation: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
    }
  }
  return { active: (await premiumStatus()).active };
}

/**
 * "เพิกถอนจากเครื่องนี้": free this machine's slot on the server, then forget the key here. Needs the
 * internet, otherwise the slot would stay taken; a key the server no longer knows is simply removed.
 */
export async function deactivatePremiumDeviceAction(): Promise<ActionResult<PremiumStatus>> {
  await assertLocalRequest();
  const { key } = await readPremium();
  if (!key) return { ok: true, data: await premiumStatus() };
  const device = await deviceIdentity();
  if (device) {
    try {
      await deactivateDevice(key, device.hash);
    } catch (e) {
      const gone = e instanceof PremiumApiError && ["unknown_key", "bad_key"].includes(e.code);
      if (!gone) {
        const offline = e instanceof PremiumApiError && (e.code === "unreachable" || e.code === "timeout");
        return fail(offline ? "ต้องต่ออินเทอร์เน็ตเพื่อเพิกถอน (เพื่อคืนสิทธิ์เครื่องให้รหัสนี้) ต่อเน็ตแล้วลองใหม่" : apiErrorText(e));
      }
    }
  }
  await updatePremium({ key: null, activation: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
  revalidatePath("/settings");
  return { ok: true, data: await premiumStatus() };
}

export async function cancelPremiumOrderAction(): Promise<void> {
  await updatePremium({ pendingOrder: null });
}
