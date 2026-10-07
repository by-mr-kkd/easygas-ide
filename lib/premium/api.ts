/**
 * Typed client for the licence server (premium-* functions, JSON, no API key). Server-only: the order secret
 * travels through here and nowhere near the browser. Every call has a timeout and fails with a
 * `PremiumApiError` whose `message` is already Thai and safe to show.
 */
import { PREMIUM_SERVER } from "./config.ts";

export type OfferMode = "slip" | "link" | "closed";

export interface PremiumOffer {
  open: boolean;
  mode: OfferMode;
  price: number | null;
  regularPrice: number | null;
  promo: boolean;
  promptpayId: string | null;
  /** the server sends email; ordering then needs an emailed code, and restore by email works */
  emailVerify: boolean;
}

export type EmailCodePurpose = "order" | "restore";

export interface RestoredLicense {
  key: string;
  licenseId: string;
}

export interface OrderCreated {
  orderId: string;
  secret: string;
  amount: number;
  mode: "slip" | "link";
  payUrl: string | null;
  promptpayId: string | null;
  expiresAt: string;
}

export type SlipRejectReason = "amount" | "receiver" | "duplicate" | "too_old" | "unreadable" | "attempts";

export type SlipResult =
  | { status: "paid"; key: string }
  | { status: "rejected"; reason: SlipRejectReason }
  | { status: "unavailable" };

export type OrderStatus = { status: "pending" | "paid" | "rejected" | "expired"; key?: string };

/** Error codes the server sends that the user can act on; anything else reads as `server`. */
export const SERVER_ERROR_CODES = [
  "closed",
  "email_unavailable",
  "email_send_failed",
  "code_required",
  "code_invalid",
  "code_expired",
  "code_locked",
  "not_found",
  "rate_limited",
  "invalid_email",
  "too_many_devices",
  "revoked",
  "unknown_key",
  "bad_key",
  "bad_device",
  "device_not_active",
  "content_missing",
] as const;
export type ServerErrorCode = (typeof SERVER_ERROR_CODES)[number];

export type PremiumApiCode = "unreachable" | "timeout" | "bad_response" | "server" | ServerErrorCode;

// plain fields, not parameter properties: `node --test` strips types and cannot run those
export class PremiumApiError extends Error {
  readonly code: PremiumApiCode;
  readonly httpStatus?: number;
  /** code_invalid: tries left on this code */
  readonly attemptsLeft?: number;
  /** too_many_devices: the machines holding the slots, and how many slots a licence has */
  devices?: DeviceSlot[];
  maxDevices?: number;

  constructor(code: PremiumApiCode, message: string, httpStatus?: number, attemptsLeft?: number) {
    super(message);
    this.name = "PremiumApiError";
    this.code = code;
    this.httpStatus = httpStatus;
    this.attemptsLeft = attemptsLeft;
  }
}

export interface DeviceSlot {
  label: string | null;
  lastSeenAt: string;
}

export const API_TEXT = {
  unreachable: "ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่",
  timeout: "เซิร์ฟเวอร์ตอบช้าเกินไป ลองใหม่อีกครั้ง",
  closed: "ตอนนี้ยังไม่เปิดขาย",
  bad_response: "เซิร์ฟเวอร์ตอบกลับในรูปแบบที่อ่านไม่ได้",
  server: "เซิร์ฟเวอร์ขัดข้อง ลองใหม่ภายหลัง",
  email_unavailable: "ตอนนี้ยังส่งอีเมลไม่ได้ ลองใหม่ภายหลัง",
  email_send_failed: "ส่งอีเมลไม่สำเร็จ ลองใหม่อีกครั้ง",
  code_required: "กรอกรหัสยืนยันจากอีเมลก่อน",
  code_invalid: "รหัสยืนยันไม่ถูกต้อง",
  code_expired: "รหัสยืนยันหมดอายุแล้ว กดส่งรหัสใหม่",
  code_locked: "ใส่รหัสผิดหลายครั้งเกินไป กดส่งรหัสใหม่",
  not_found: "ไม่พบรหัส Pro ของอีเมลนี้",
  rate_limited: "ขอบ่อยเกินไป รอสักครู่แล้วลองใหม่",
  invalid_email: "อีเมลไม่ถูกต้อง",
  too_many_devices: "รหัสนี้ใช้ครบจำนวนเครื่องแล้ว",
  revoked: "รหัสนี้ถูกยกเลิกแล้ว ติดต่อเราในกลุ่ม Facebook",
  unknown_key: "ไม่พบรหัสนี้ในระบบ ตรวจว่าคัดลอกรหัสมาครบ",
  bad_key: "รูปแบบรหัสไม่ถูกต้อง",
  bad_device: "อ่านรหัสเครื่องไม่ได้ ลองเปิดโปรแกรมใหม่",
  device_not_active: "เครื่องนี้ยังไม่ได้ยืนยันกับรหัส Pro",
  content_missing: "เซิร์ฟเวอร์ยังไม่มีชุดคำสั่งนี้ ลองใหม่ภายหลัง",
} as const satisfies Record<PremiumApiCode, string>;

/**
 * Pure: the error for a non-2xx answer. Known server codes keep their meaning (and a fixed Thai line);
 * the server's own `message` is for the owner's logs and never reaches the user.
 */
export function errorFromResponse(httpStatus: number, body: unknown): PremiumApiError {
  const err = (body && typeof body === "object" ? body : {}) as { error?: unknown; attemptsLeft?: unknown };
  const code = (SERVER_ERROR_CODES as readonly unknown[]).includes(err.error) ? (err.error as ServerErrorCode) : "server";
  const left = typeof err.attemptsLeft === "number" && Number.isInteger(err.attemptsLeft) && err.attemptsLeft >= 0 ? err.attemptsLeft : undefined;
  const message = code === "code_invalid" && left ? `${API_TEXT.code_invalid} ลองได้อีก ${left} ครั้ง` : API_TEXT[code];
  const error = new PremiumApiError(code, message, httpStatus, code === "code_invalid" ? left : undefined);
  if (code === "too_many_devices") {
    const raw = (body as { devices?: unknown; max?: unknown }) ?? {};
    error.devices = Array.isArray(raw.devices)
      ? raw.devices
          .filter((d): d is Record<string, unknown> => Boolean(d) && typeof d === "object")
          .map((d) => ({ label: typeof d.label === "string" ? d.label.slice(0, 80) : null, lastSeenAt: typeof d.lastSeenAt === "string" ? d.lastSeenAt : "" }))
          .slice(0, 20)
      : [];
    error.maxDevices = typeof raw.max === "number" && Number.isInteger(raw.max) ? raw.max : undefined;
  }
  return error;
}

const DEFAULT_TIMEOUT_MS = 10_000;
/** a slip upload carries up to 4 MB of image */
const SLIP_TIMEOUT_MS = 45_000;
/** matches the server's cap; checked here so a too-big image never leaves the machine */
export const SLIP_MAX_BYTES = 4 * 1024 * 1024;

async function call<T>(path: string, init: { method: "GET" | "POST"; body?: unknown; timeoutMs?: number }): Promise<T> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), init.timeoutMs ?? DEFAULT_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${PREMIUM_SERVER}/${path}`, {
      method: init.method,
      headers: init.body === undefined ? { accept: "application/json" } : { accept: "application/json", "content-type": "application/json" },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: ctrl.signal,
      cache: "no-store",
    });
  } catch (e) {
    const aborted = (e as { name?: string })?.name === "AbortError";
    throw new PremiumApiError(aborted ? "timeout" : "unreachable", aborted ? API_TEXT.timeout : API_TEXT.unreachable);
  } finally {
    clearTimeout(timer);
  }

  let json: unknown = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) throw errorFromResponse(res.status, json);
  if (!json || typeof json !== "object") throw new PremiumApiError("bad_response", API_TEXT.bad_response, res.status);
  return json as T;
}

const num = (v: unknown): number | null => (typeof v === "number" && Number.isFinite(v) ? v : null);
const strOrNull = (v: unknown): string | null => (typeof v === "string" && v ? v : null);

export async function fetchOffer(): Promise<PremiumOffer> {
  const r = await call<Record<string, unknown>>("premium-offer", { method: "GET" });
  const mode: OfferMode = r.mode === "slip" || r.mode === "link" ? r.mode : "closed";
  return {
    open: r.open === true && mode !== "closed",
    mode,
    price: num(r.price),
    regularPrice: num(r.regularPrice),
    promo: r.promo === true,
    promptpayId: strOrNull(r.promptpayId),
    emailVerify: r.emailVerify === true,
  };
}

/** Ask the server to email a 6-digit code. `restore` answers the same whether or not the email holds a licence. */
export async function requestEmailCode(email: string, purpose: EmailCodePurpose): Promise<{ expiresAt: string }> {
  const r = await call<Record<string, unknown>>("premium-email-code", { method: "POST", body: { email, purpose } });
  if (r.sent !== true) throw new PremiumApiError("bad_response", API_TEXT.bad_response);
  return { expiresAt: typeof r.expiresAt === "string" ? r.expiresAt : "" };
}

/** Trade a `restore` code for the newest live licence of that email. */
export async function restoreLicense(email: string, code: string): Promise<RestoredLicense> {
  const r = await call<Record<string, unknown>>("premium-restore", { method: "POST", body: { email, code } });
  if (typeof r.key !== "string" || typeof r.licenseId !== "string") throw new PremiumApiError("bad_response", API_TEXT.bad_response);
  return { key: r.key, licenseId: r.licenseId };
}

/** `code` = the emailed `order` code; required by the server when the offer says `emailVerify`. */
export async function createOrder(email: string, code?: string): Promise<OrderCreated> {
  const body = code ? { email, code } : { email };
  const r = await call<Record<string, unknown>>("premium-order", { method: "POST", body });
  const amount = num(r.amount);
  if (typeof r.orderId !== "string" || typeof r.secret !== "string" || amount === null || (r.mode !== "slip" && r.mode !== "link")) {
    throw new PremiumApiError("bad_response", API_TEXT.bad_response);
  }
  return {
    orderId: r.orderId,
    secret: r.secret,
    amount,
    mode: r.mode,
    payUrl: strOrNull(r.payUrl),
    promptpayId: strOrNull(r.promptpayId),
    expiresAt: typeof r.expiresAt === "string" ? r.expiresAt : "",
  };
}

const REJECT_REASONS: readonly SlipRejectReason[] = ["amount", "receiver", "duplicate", "too_old", "unreadable", "attempts"];

/** `image` = base64 JPEG/PNG without a `data:` prefix. */
export async function submitSlip(orderId: string, secret: string, image: string): Promise<SlipResult> {
  const r = await call<Record<string, unknown>>("premium-slip", {
    method: "POST",
    body: { orderId, secret, image },
    timeoutMs: SLIP_TIMEOUT_MS,
  });
  if (r.status === "paid" && typeof r.key === "string") return { status: "paid", key: r.key };
  if (r.status === "rejected") {
    const reason = REJECT_REASONS.includes(r.reason as SlipRejectReason) ? (r.reason as SlipRejectReason) : "unreadable";
    return { status: "rejected", reason };
  }
  if (r.status === "unavailable") return { status: "unavailable" };
  throw new PremiumApiError("bad_response", API_TEXT.bad_response);
}

export async function fetchOrderStatus(orderId: string, secret: string): Promise<OrderStatus> {
  const r = await call<Record<string, unknown>>("premium-status", { method: "POST", body: { orderId, secret } });
  if (r.status === "pending" || r.status === "paid" || r.status === "rejected" || r.status === "expired") {
    return { status: r.status, key: typeof r.key === "string" ? r.key : undefined };
  }
  throw new PremiumApiError("bad_response", API_TEXT.bad_response);
}

/** Thai message for any error thrown by this module (or anything else that slipped through). */
export function apiErrorText(e: unknown): string {
  return e instanceof PremiumApiError ? e.message : API_TEXT.server;
}

export interface ActivationGranted {
  token: string;
  expiresAt: string;
  max: number;
}

/** Register this machine for the licence (or renew it). Throws too_many_devices with the machines in use. */
export async function activateDevice(key: string, deviceHash: string, deviceLabel: string): Promise<ActivationGranted> {
  const r = await call<Record<string, unknown>>("premium-activate", { method: "POST", body: { key, deviceHash, deviceLabel } });
  if (typeof r.token !== "string" || typeof r.expiresAt !== "string") throw new PremiumApiError("bad_response", API_TEXT.bad_response);
  return { token: r.token, expiresAt: r.expiresAt, max: typeof r.max === "number" ? r.max : 2 };
}

/** Free this machine's slot ("เพิกถอนจากเครื่องนี้"). */
export async function deactivateDevice(key: string, deviceHash: string): Promise<boolean> {
  const r = await call<Record<string, unknown>>("premium-deactivate", { method: "POST", body: { key, deviceHash } });
  return r.deactivated === true;
}

/** A paid instruction set (e.g. "camera_rules") for a non-revoked licence on a registered machine. */
export async function fetchPremiumContent(key: string, deviceHash: string, id: "camera_rules"): Promise<{ body: string; version: number }> {
  const r = await call<Record<string, unknown>>("premium-content", { method: "POST", body: { key, deviceHash, id } });
  if (typeof r.body !== "string" || !r.body || typeof r.version !== "number") throw new PremiumApiError("bad_response", API_TEXT.bad_response);
  return { body: r.body, version: r.version };
}
