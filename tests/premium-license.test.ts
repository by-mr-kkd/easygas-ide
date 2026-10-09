import { strict as assert } from "node:assert";
import { generateKeyPairSync, sign } from "node:crypto";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { after, test } from "node:test";
import { LICENSE_PREFIX, LICENSE_PUBLIC_KEY, type LicensePayload } from "../lib/premium/config.ts";
import { normalizeLicenseKey, parseLicense, publicKeyFromRaw } from "../lib/premium/license.ts";
import { premiumStatus } from "../lib/premium/status.ts";
import { premiumPath, readPremium, updatePremium, writePremium } from "../lib/premium/store.ts";

// the store writes premium.json under dataRoot(); point it at a scratch folder for this file
const DATA_DIR = mkdtempSync(join(tmpdir(), "egs-premium-"));
process.env.EASYGAS_DATA_DIR = DATA_DIR;
after(() => rmSync(DATA_DIR, { recursive: true, force: true }));

/** A throw-away Ed25519 pair; the raw 32-byte public key is what the app ships. */
function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return { privateKey, rawPublicB64: spki.subarray(spki.length - 32).toString("base64") };
}

const payload: LicensePayload = {
  v: 1,
  id: "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0",
  email: "somchai@example.com",
  plan: "premium",
  iat: 1_760_000_000,
};

function issue(privateKey: ReturnType<typeof keyPair>["privateKey"], body: unknown = payload): string {
  const p = Buffer.from(JSON.stringify(body)).toString("base64url");
  const s = sign(null, Buffer.from(p, "ascii"), privateKey).toString("base64url");
  return `${LICENSE_PREFIX}.${p}.${s}`;
}

test("the shipped public key is a raw 32-byte Ed25519 key", () => {
  assert.equal(Buffer.from(LICENSE_PUBLIC_KEY, "base64").length, 32);
  assert.equal(publicKeyFromRaw(LICENSE_PUBLIC_KEY).asymmetricKeyType, "ed25519");
});

test("a valid key parses to its payload", () => {
  const { privateKey, rawPublicB64 } = keyPair();
  const result = parseLicense(issue(privateKey), rawPublicB64);
  assert.deepEqual(result, { ok: true, payload });
});

test("whitespace and line breaks around or inside a pasted key are ignored", () => {
  const { privateKey, rawPublicB64 } = keyPair();
  const key = issue(privateKey);
  const pasted = `  ${key.slice(0, 20)}\n${key.slice(20)} \r\n`;
  assert.equal(normalizeLicenseKey(pasted), key);
  assert.deepEqual(parseLicense(pasted, rawPublicB64), { ok: true, payload });
});

test("a tampered payload fails the signature check", () => {
  const { privateKey, rawPublicB64 } = keyPair();
  const [prefix, , s] = issue(privateKey).split(".");
  const forged = Buffer.from(JSON.stringify({ ...payload, email: "thief@example.com" })).toString("base64url");
  assert.deepEqual(parseLicense(`${prefix}.${forged}.${s}`, rawPublicB64), { ok: false, reason: "bad_signature" });
});

test("a key signed by another key pair is rejected", () => {
  const { privateKey } = keyPair();
  const other = keyPair();
  assert.deepEqual(parseLicense(issue(privateKey), other.rawPublicB64), { ok: false, reason: "bad_signature" });
  // and against the real shipped key
  assert.deepEqual(parseLicense(issue(privateKey)), { ok: false, reason: "bad_signature" });
});

test("garbage and wrong shapes are bad_format", () => {
  const { rawPublicB64 } = keyPair();
  for (const bad of ["", "hello", "EGP1.abc", "EGP1.abc.def.ghi", "EGP2.abc.def", "EGP1..sig", "EGP1.a+b.c/d", "EGP1.a=.b"]) {
    assert.deepEqual(parseLicense(bad, rawPublicB64), { ok: false, reason: "bad_format" }, bad);
  }
});

test("a correctly signed but malformed payload is bad_payload", () => {
  const { privateKey, rawPublicB64 } = keyPair();
  const cases: unknown[] = [
    { ...payload, plan: "free" },
    { ...payload, v: 2 },
    { ...payload, email: "not-an-email" },
    { ...payload, iat: "yesterday" },
    { id: payload.id },
    "just a string",
  ];
  for (const body of cases) {
    assert.deepEqual(parseLicense(issue(privateKey, body), rawPublicB64), { ok: false, reason: "bad_payload" });
  }
  // a payload segment that is signed but is not JSON at all
  const p = Buffer.from("not json").toString("base64url");
  const s = sign(null, Buffer.from(p, "ascii"), privateKey).toString("base64url");
  assert.deepEqual(parseLicense(`EGP1.${p}.${s}`, rawPublicB64), { ok: false, reason: "bad_payload" });
});

test("store: missing or corrupt file reads as empty", async () => {
  assert.deepEqual(await readPremium(), { v: 1, key: null, pendingOrder: null, activation: null, deviceSeed: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
  await writePremium({ v: 1, key: "x", pendingOrder: null, activation: null, deviceSeed: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
  assert.equal(premiumPath(), join(DATA_DIR, "premium.json"));
  await import("node:fs/promises").then((fs) => fs.writeFile(premiumPath(), "{not json", "utf8"));
  assert.deepEqual(await readPremium(), { v: 1, key: null, pendingOrder: null, activation: null, deviceSeed: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
});

test("store: a pending order round-trips and a malformed one is dropped", async () => {
  const order = {
    orderId: "ord_1",
    secret: "s3cret",
    email: "somchai@example.com",
    amount: 990,
    mode: "slip" as const,
    payUrl: null,
    promptpayId: "0812345678",
    expiresAt: "2026-10-08T00:00:00.000Z",
  };
  await writePremium({ v: 1, key: null, pendingOrder: order, activation: null, deviceSeed: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
  assert.deepEqual((await readPremium()).pendingOrder, order);
  // the file holds the secret; it is this module's job alone to keep it off the wire
  assert.match(readFileSync(premiumPath(), "utf8"), /s3cret/);
  await import("node:fs/promises").then((fs) =>
    fs.writeFile(premiumPath(), JSON.stringify({ v: 1, key: null, pendingOrder: { orderId: "ord_2", mode: "cash" } }), "utf8"),
  );
  assert.equal((await readPremium()).pendingOrder, null);
});

test("premiumStatus re-verifies the stored key against the shipped public key", async () => {
  await writePremium({ v: 1, key: null, pendingOrder: null, activation: null, deviceSeed: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
  assert.deepEqual(await premiumStatus(), { active: false });
  // a key signed by some other pair is on disk: not active, no matter how it got there
  const { privateKey } = keyPair();
  await updatePremium({ key: issue(privateKey) });
  assert.deepEqual(await premiumStatus(), { active: false });
  await updatePremium({ key: "garbage" });
  assert.deepEqual(await premiumStatus(), { active: false });
  // the file can be patched piecemeal
  await updatePremium({ key: null });
  assert.deepEqual(await readPremium(), { v: 1, key: null, pendingOrder: null, activation: null, deviceSeed: null, cameraRules: null, cameraRulesVersion: null, pagesRuntime: null, pagesRuntimeVersion: null });
});
