import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DONATION,
  MAX_DONATION,
  donationPayload,
  formatBaht,
  isAmountShaped,
  maskPromptPayId,
  normalizePromptPayId,
  parseDonationAmount,
} from "../lib/donate.ts";

/** CRC-16/CCITT-FALSE, written here independently of the library that builds the payload. */
function crc16(text: string): string {
  let crc = 0xffff;
  for (const ch of Buffer.from(text, "utf8")) {
    crc ^= ch << 8;
    for (let i = 0; i < 8; i++) crc = crc & 0x8000 ? ((crc << 1) ^ 0x1021) & 0xffff : (crc << 1) & 0xffff;
  }
  return crc.toString(16).toUpperCase().padStart(4, "0");
}

/** Split an EMVCo string into its top-level id → value fields. */
function fields(payload: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (let i = 0; i < payload.length; ) {
    const id = payload.slice(i, i + 2);
    const len = Number(payload.slice(i + 2, i + 4));
    out[id] = payload.slice(i + 4, i + 4 + len);
    i += 4 + len;
  }
  return out;
}

// ── the amount the user types ──

test("reads plain amounts, with or without thousands separators and satang", () => {
  assert.equal(parseDonationAmount("100"), 100);
  assert.equal(parseDonationAmount(" 1,250.50 "), 1250.5);
  assert.equal(parseDonationAmount("20.5"), 20.5);
});

test("refuses anything that is not a plain positive amount in range", () => {
  for (const bad of ["", "0", "0.99", "-50", "abc", "1e3", "100.999", "12 34", "๑๐๐", "100บาท", String(MAX_DONATION + 1), "99999999"]) {
    assert.equal(parseDonationAmount(bad), null, JSON.stringify(bad));
  }
  assert.equal(parseDonationAmount(String(MAX_DONATION)), MAX_DONATION);
});

test("a comma is only ever a thousands separator — a decimal comma is refused, not read as 100x", () => {
  for (const bad of ["1,50", "1,2,3", ",100", "100,", "1,00", "12,34.5", "1,0000"]) {
    assert.equal(parseDonationAmount(bad), null, JSON.stringify(bad));
    assert.equal(isAmountShaped(bad), false, JSON.stringify(bad));
  }
  assert.equal(parseDonationAmount("1,000"), 1000);
  assert.equal(parseDonationAmount("100,000.00"), 100000);
  assert.equal(parseDonationAmount("1,000,000"), null, "well-formed but over the limit");
  assert.equal(isAmountShaped("1,000,000"), true, "…so the hint talks about the range, not the format");
});

test("every amount from 1.00 to 200.00 reaches the QR exactly as typed", () => {
  for (let satang = 100; satang <= 20000; satang++) {
    const typed = (satang / 100).toFixed(2);
    const amount = parseDonationAmount(typed)!;
    assert.equal(fields(donationPayload("0812345678", amount)!)["54"], typed);
  }
});

// ── the recipient id ──

test("accepts the three PromptPay id forms, ignoring dashes and spaces", () => {
  assert.deepEqual(normalizePromptPayId("081-234-5678"), { digits: "0812345678", kind: "phone" });
  assert.deepEqual(normalizePromptPayId("1 2345 67890 12 3"), { digits: "1234567890123", kind: "national-id" });
  assert.equal(normalizePromptPayId("004999000288505")?.kind, "e-wallet");
});

test("rejects ids of the wrong shape", () => {
  for (const bad of ["", "12345", "8123456789", "08123456789", "081234567a", "+66812345678"]) {
    assert.equal(normalizePromptPayId(bad), null, JSON.stringify(bad));
  }
});

test("the id shown beside the QR is partly hidden", () => {
  assert.equal(maskPromptPayId("0812345678"), "081-xxx-5678");
  assert.equal(maskPromptPayId("1234567890123"), "1-xxxx-xxxxx-123");
  assert.equal(maskPromptPayId("nope"), "");
});

// ── the payload a banking app reads ──

test("the payload carries the PromptPay id, THB, the exact amount and a valid checksum", () => {
  const payload = donationPayload("081-234-5678", 1234.5)!;
  const f = fields(payload);
  assert.equal(f["00"], "01", "EMVCo payload format");
  assert.equal(f["01"], "12", "one-time code with a fixed amount");
  assert.equal(f["29"], "0016A000000677010111" + "01130066812345678", "PromptPay + the mobile number in 0066 form");
  assert.equal(f["53"], "764", "Thai baht");
  assert.equal(f["54"], "1234.50");
  assert.equal(f["58"], "TH");
  assert.equal(f["63"], crc16(payload.slice(0, -4)), "checksum over everything before it");
});

test("a national id goes in the tax-id slot, an e-wallet id in the e-wallet slot", () => {
  assert.equal(fields(donationPayload("1234567890123", 50)!)["29"], "0016A000000677010111" + "02131234567890123");
  assert.equal(fields(donationPayload("004999000288505", 20)!)["29"], "0016A000000677010111" + "0315004999000288505");
});

test("the amount is rounded to satang, never more precise", () => {
  assert.equal(fields(donationPayload("0812345678", 99.999)!)["54"], "100.00");
  assert.equal(fields(donationPayload("0812345678", 20)!)["54"], "20.00");
});

test("no payload for a bad id or an amount outside the range", () => {
  assert.equal(donationPayload("12345", 100), null);
  for (const amount of [0, -5, Number.NaN, Number.POSITIVE_INFINITY, MAX_DONATION + 1]) {
    assert.equal(donationPayload("0812345678", amount), null, String(amount));
  }
});

// ── display and configuration ──

test("amounts are shown with separators, and satang only when present", () => {
  assert.equal(formatBaht(1250), "1,250");
  assert.equal(formatBaht(1250.5), "1,250.50");
});

test("the shipped donation target is either empty (button hidden) or a valid PromptPay id", () => {
  assert.ok(DONATION.promptPayId === "" || normalizePromptPayId(DONATION.promptPayId) !== null);
  assert.equal(DONATION.recipient, "Mr.KKD");
});
