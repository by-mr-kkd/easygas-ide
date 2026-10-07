import generatePayload from "promptpay-qr";

/**
 * Voluntary donation to the developer by PromptPay QR (pure — unit-tested in tests/donate.test.ts).
 *
 * The QR is built on the user's machine: the PromptPay id and the amount are never sent to a QR
 * service. The app cannot see whether a transfer happened — it only draws the code the banking app
 * scans.
 */

/**
 * Where donations go. `promptPayId` is the developer's PromptPay id: a mobile number (10 digits), a
 * national / tax id (13 digits) or an e-wallet id (15 digits). It ships in the public source, so use
 * an id you are happy to publish. Empty = the donate button is not shown at all.
 */
export const DONATION = {
  promptPayId: "0995588665",
  recipient: "Mr.KKD",
};

export const DONATION_PRESETS = [50, 100, 200, 500];
export const MIN_DONATION = 1;
export const MAX_DONATION = 100_000;

export type PromptPayIdKind = "phone" | "national-id" | "e-wallet";

/** Digits of a PromptPay id with spaces and dashes removed, or null when it is not a valid id. */
export function normalizePromptPayId(id: string): { digits: string; kind: PromptPayIdKind } | null {
  const digits = id.replace(/[\s-]/g, "");
  if (/^0\d{9}$/.test(digits)) return { digits, kind: "phone" };
  if (/^\d{13}$/.test(digits)) return { digits, kind: "national-id" };
  if (/^\d{15}$/.test(digits)) return { digits, kind: "e-wallet" };
  return null;
}

/** The id as shown next to the QR, partly hidden (the payer's banking app shows the account name). */
export function maskPromptPayId(id: string): string {
  const n = normalizePromptPayId(id);
  if (!n) return "";
  if (n.kind === "phone") return `${n.digits.slice(0, 3)}-xxx-${n.digits.slice(-4)}`;
  return `${n.digits.slice(0, 1)}-xxxx-xxxxx-${n.digits.slice(-3)}`;
}

const PLAIN_AMOUNT = /^\d{1,7}(\.\d{1,2})?$/;
// commas only as real thousands separators: "1,250.50" yes; "1,50" (a decimal comma) or "1,2,3" no
const GROUPED_AMOUNT = /^\d{1,3}(,\d{3})+(\.\d{1,2})?$/;

/** Does the text look like an amount at all (whatever its size)? Used to pick the right hint. */
export function isAmountShaped(input: string): boolean {
  const text = input.trim();
  return PLAIN_AMOUNT.test(text) || GROUPED_AMOUNT.test(text);
}

/**
 * Read an amount the user typed ("100", "1,250.50"). Null unless it is a plain positive number with
 * at most two decimals inside the allowed range — a mistyped amount must never become a QR. In
 * particular "1,50" is refused rather than read as 150: guessing wrong there is a 100x transfer.
 */
export function parseDonationAmount(input: string): number | null {
  if (!isAmountShaped(input)) return null;
  const amount = Number(input.trim().replace(/,/g, ""));
  return amount >= MIN_DONATION && amount <= MAX_DONATION ? amount : null;
}

/** The EMVCo payload a banking app reads from the QR, or null when the id or amount is not valid. */
export function donationPayload(promptPayId: string, amount: number): string | null {
  const id = normalizePromptPayId(promptPayId);
  if (!id || !Number.isFinite(amount) || amount < MIN_DONATION || amount > MAX_DONATION) return null;
  return generatePayload(id.digits, { amount: Math.round(amount * 100) / 100 });
}

export function formatBaht(amount: number): string {
  return amount.toLocaleString("th-TH", { minimumFractionDigits: Number.isInteger(amount) ? 0 : 2, maximumFractionDigits: 2 });
}
