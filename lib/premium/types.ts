/** Client-safe shapes the premium server actions return. No server imports here. */
import type { PremiumStatus } from "./status.ts";

export type { PremiumStatus };

export interface OfferView {
  open: boolean;
  mode: "slip" | "link" | "closed";
  price: number | null;
  regularPrice: number | null;
  promo: boolean;
  promptpayId: string | null;
  /** buying needs an emailed code, and restore by email works */
  emailVerify: boolean;
}

export type EmailCodePurpose = "order" | "restore";

/** A pending order as the client sees it: no secret. */
export interface OrderView {
  orderId: string;
  email: string;
  amount: number;
  mode: "slip" | "link";
  payUrl: string | null;
  promptpayId: string | null;
  expiresAt: string;
}

export type SlipRejectReason = "amount" | "receiver" | "duplicate" | "too_old" | "unreadable" | "attempts";

export type SlipOutcome =
  | { status: "paid"; premium: PremiumStatus }
  | { status: "rejected"; reason: SlipRejectReason }
  | { status: "unavailable" };

export type PollOutcome =
  | { status: "pending" }
  | { status: "paid"; premium: PremiumStatus }
  | { status: "rejected" | "expired" };

/** `code` = the licence server's error code when there was one (e.g. `email_unavailable`), for the UI to branch on. */
export type ActionResult<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

/** Shown when restore by email cannot work yet (email not set up on the server). */
export const RESTORE_UNAVAILABLE_TEXT = "ยังกู้คืนด้วยอีเมลไม่ได้ ติดต่อเราในกลุ่ม Facebook";

const CODE_INPUT = /^\d{6}$/;
/** A typed email code: spaces and dashes dropped ("123 456"); null unless it is 6 digits. */
export function normalizeEmailCode(input: string): string | null {
  const code = String(input ?? "").replace(/[\s-]/g, "");
  return CODE_INPUT.test(code) ? code : null;
}

export const SLIP_REJECT_TEXT: Record<SlipRejectReason, string> = {
  amount: "ยอดเงินในสลิปไม่ตรงกับยอดที่ต้องชำระ โปรดโอนให้ตรงจำนวนแล้วส่งสลิปใหม่",
  receiver: "ผู้รับเงินในสลิปไม่ใช่บัญชีของเรา ตรวจว่าสแกน QR จากหน้านี้",
  duplicate: "สลิปนี้ถูกใช้ไปแล้ว",
  too_old: "สลิปนี้เก่าเกินไป ต้องเป็นสลิปที่โอนหลังสั่งซื้อ",
  unreadable: "อ่านสลิปไม่ออก ลองถ่ายภาพหน้าจอสลิปจากแอปธนาคารให้ชัดและเต็มใบ",
  attempts: "ส่งสลิปผิดหลายครั้งเกินกำหนด ติดต่อเราพร้อมอีเมลที่ใช้สั่งซื้อ",
};
