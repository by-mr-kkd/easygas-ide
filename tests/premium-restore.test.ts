import { strict as assert } from "node:assert";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, afterEach, test } from "node:test";
import {
  API_TEXT,
  createOrder,
  errorFromResponse,
  fetchOffer,
  PremiumApiError,
  requestEmailCode,
  restoreLicense,
  SERVER_ERROR_CODES,
} from "../lib/premium/api.ts";
import { PREMIUM_SERVER } from "../lib/premium/config.ts";
import { maskLicenseKey } from "../lib/premium/license.ts";
import { premiumStatus } from "../lib/premium/status.ts";
import { updatePremium } from "../lib/premium/store.ts";
import { normalizeEmailCode, RESTORE_UNAVAILABLE_TEXT } from "../lib/premium/types.ts";

const DATA_DIR = mkdtempSync(join(tmpdir(), "egs-premium-restore-"));
process.env.EASYGAS_DATA_DIR = DATA_DIR;
after(() => rmSync(DATA_DIR, { recursive: true, force: true }));

// ── fetch stub: records the request, answers with a canned status + JSON ──
const realFetch = globalThis.fetch;
let seen: { url: string; body: unknown } | null = null;
function answer(status: number, json: unknown) {
  globalThis.fetch = (async (url: string | URL | Request, init?: RequestInit) => {
    seen = { url: String(url), body: init?.body ? JSON.parse(String(init.body)) : undefined };
    return new Response(JSON.stringify(json), { status, headers: { "content-type": "application/json" } });
  }) as typeof fetch;
}
afterEach(() => {
  globalThis.fetch = realFetch;
  seen = null;
});

test("normalizeEmailCode keeps 6 digits and drops spaces and dashes", () => {
  assert.equal(normalizeEmailCode("123456"), "123456");
  assert.equal(normalizeEmailCode(" 123 456 "), "123456");
  assert.equal(normalizeEmailCode("123-456"), "123456");
  for (const bad of ["12345", "1234567", "12a456", ""]) assert.equal(normalizeEmailCode(bad), null);
});

test("maskLicenseKey shows only the first and last 6 characters", () => {
  const key = "EGP1.eyJ2IjoxLCJpZCI6ImFiYyJ9.c2lnbmF0dXJlLXZhbHVlLXh5ejEyMw";
  const masked = maskLicenseKey(key);
  assert.equal(masked, "EGP1.e…ejEyMw");
  assert.ok(!masked.includes("eyJ2IjoxLCJpZCI6"), "the payload is not in the mask");
  assert.equal(maskLicenseKey("short"), "…");
});

test("a key that does not verify reads as inactive, with no mask", async () => {
  const { privateKey } = generateKeyPairSync("ed25519");
  const p = Buffer.from(JSON.stringify({ v: 1, id: "x", email: "a@b.co", plan: "premium", iat: 1 })).toString("base64url");
  const s = sign(null, Buffer.from(p, "ascii"), privateKey).toString("base64url");
  await updatePremium({ key: `EGP1.${p}.${s}` });
  assert.deepEqual(await premiumStatus(), { active: false });
  await updatePremium({ key: null });
});

test("every known server error code maps to its own Thai line", () => {
  for (const code of SERVER_ERROR_CODES) {
    const e = errorFromResponse(400, { error: code, message: "server text for logs" });
    assert.equal(e.code, code);
    assert.equal(e.message, API_TEXT[code]);
    assert.ok(!e.message.includes("server text"), "the server's own message never reaches the user");
  }
});

test("unknown errors and non-JSON bodies read as a server error", () => {
  assert.equal(errorFromResponse(500, { error: "internal" }).code, "server");
  assert.equal(errorFromResponse(502, null).code, "server");
  assert.equal(errorFromResponse(500, "oops").message, API_TEXT.server);
});

test("code_invalid says how many tries are left", () => {
  const e = errorFromResponse(400, { error: "code_invalid", attemptsLeft: 3 });
  assert.equal(e.attemptsLeft, 3);
  assert.equal(e.message, `${API_TEXT.code_invalid} ลองได้อีก 3 ครั้ง`);
  assert.equal(errorFromResponse(400, { error: "code_invalid", attemptsLeft: 0 }).message, API_TEXT.code_invalid);
  assert.equal(errorFromResponse(400, { error: "code_invalid", attemptsLeft: "x" }).attemptsLeft, undefined);
});

test("user-facing texts are short plain sentences without long dashes", () => {
  for (const text of [...Object.values(API_TEXT), RESTORE_UNAVAILABLE_TEXT]) {
    assert.ok(!text.includes("—") && !text.includes("–"), text);
    assert.ok(text.length <= 60, text);
  }
});

test("fetchOffer reads emailVerify (false unless exactly true)", async () => {
  answer(200, { open: false, mode: "closed", price: null, regularPrice: null, promo: false, promptpayId: null, emailVerify: true });
  assert.equal((await fetchOffer()).emailVerify, true);
  answer(200, { open: false, mode: "closed", emailVerify: "yes" });
  assert.equal((await fetchOffer()).emailVerify, false);
  answer(200, { open: false, mode: "closed" });
  assert.equal((await fetchOffer()).emailVerify, false);
});

test("requestEmailCode posts email and purpose", async () => {
  answer(200, { sent: true, expiresAt: "2026-10-07T10:10:00Z" });
  assert.deepEqual(await requestEmailCode("a@b.co", "restore"), { expiresAt: "2026-10-07T10:10:00Z" });
  assert.deepEqual(seen, { url: `${PREMIUM_SERVER}/premium-email-code`, body: { email: "a@b.co", purpose: "restore" } });
});

test("requestEmailCode surfaces email_unavailable", async () => {
  answer(503, { error: "email_unavailable", message: "x" });
  await assert.rejects(requestEmailCode("a@b.co", "order"), (e: unknown) => e instanceof PremiumApiError && e.code === "email_unavailable");
});

test("restoreLicense returns key and licence id, or not_found", async () => {
  answer(200, { key: "EGP1.a.b", licenseId: "id-1" });
  assert.deepEqual(await restoreLicense("a@b.co", "123456"), { key: "EGP1.a.b", licenseId: "id-1" });
  assert.deepEqual(seen?.body, { email: "a@b.co", code: "123456" });
  answer(404, { error: "not_found" });
  await assert.rejects(restoreLicense("a@b.co", "123456"), (e: unknown) => e instanceof PremiumApiError && e.code === "not_found");
  answer(200, { key: 1 });
  await assert.rejects(restoreLicense("a@b.co", "123456"), (e: unknown) => e instanceof PremiumApiError && e.code === "bad_response");
});

test("createOrder sends the code only when there is one", async () => {
  const order = { orderId: "o", secret: "s".repeat(32), amount: 990, mode: "slip", payUrl: null, promptpayId: "0800000000", expiresAt: "x" };
  answer(200, order);
  await createOrder("a@b.co");
  assert.deepEqual(seen?.body, { email: "a@b.co" });
  answer(200, order);
  await createOrder("a@b.co", "123456");
  assert.deepEqual(seen?.body, { email: "a@b.co", code: "123456" });
  answer(400, { error: "code_required" });
  await assert.rejects(createOrder("a@b.co"), (e: unknown) => e instanceof PremiumApiError && e.code === "code_required");
});
