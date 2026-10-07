import { strict as assert } from "node:assert";
import { generateKeyPairSync, sign } from "node:crypto";
import { test } from "node:test";
import { ACTIVATION_PREFIX, type ActivationPayload } from "../lib/premium/config.ts";
import { activationValidFor, parseActivation } from "../lib/premium/license.ts";
import { errorFromResponse, PremiumApiError } from "../lib/premium/api.ts";

function keyPair() {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const spki = publicKey.export({ format: "der", type: "spki" }) as Buffer;
  return { privateKey, rawPublicB64: spki.subarray(spki.length - 32).toString("base64") };
}

const DEV = "a".repeat(64);
const LID = "0f1e2d3c-4b5a-6978-8796-a5b4c3d2e1f0";
const NOW = 1_800_000_000;
const payload: ActivationPayload = { v: 1, lid: LID, dev: DEV, iat: NOW - 10, exp: NOW + 30 * 86_400 };

/** The server's format: signature over "EGA1.<p>". */
function token(privateKey: ReturnType<typeof keyPair>["privateKey"], body: unknown = payload, signedBytes?: (p: string) => string): string {
  const p = Buffer.from(JSON.stringify(body)).toString("base64url");
  const s = sign(null, Buffer.from(signedBytes ? signedBytes(p) : `${ACTIVATION_PREFIX}.${p}`, "ascii"), privateKey).toString("base64url");
  return `${ACTIVATION_PREFIX}.${p}.${s}`;
}

test("activation: a server-signed token verifies and parses", () => {
  const { privateKey, rawPublicB64 } = keyPair();
  const r = parseActivation(token(privateKey), rawPublicB64);
  assert.equal(r.ok, true);
  assert.deepEqual(r.ok && r.payload, payload);
});

test("activation: a licence-style signature (over the payload only) is rejected", () => {
  const { privateKey, rawPublicB64 } = keyPair();
  assert.deepEqual(parseActivation(token(privateKey, payload, (p) => p), rawPublicB64), { ok: false, reason: "bad_signature" });
});

test("activation: wrong signer, wrong prefix, garbage and bad payloads fail", () => {
  const a = keyPair();
  const b = keyPair();
  assert.deepEqual(parseActivation(token(a.privateKey), b.rawPublicB64), { ok: false, reason: "bad_signature" });
  assert.deepEqual(parseActivation(token(a.privateKey).replace(/^EGA1/, "EGP1"), a.rawPublicB64), { ok: false, reason: "bad_format" });
  assert.deepEqual(parseActivation("nonsense", a.rawPublicB64), { ok: false, reason: "bad_format" });
  for (const body of [
    { ...payload, dev: "not-a-hash" },
    { ...payload, exp: payload.iat - 1 },
    { ...payload, v: 2 },
  ]) {
    assert.deepEqual(parseActivation(token(a.privateKey, body), a.rawPublicB64), { ok: false, reason: "bad_payload" });
  }
});

test("activation: valid only for its licence, its machine, before it expires", () => {
  assert.equal(activationValidFor(payload, LID, DEV, NOW), true);
  assert.equal(activationValidFor(payload, "another-licence", DEV, NOW), false);
  assert.equal(activationValidFor(payload, LID, "b".repeat(64), NOW), false);
  assert.equal(activationValidFor(payload, LID, DEV, payload.exp), false);
});

test("too_many_devices keeps the machine list for the message, and nothing else leaks", () => {
  const e = errorFromResponse(409, {
    error: "too_many_devices",
    message: "server text",
    max: 2,
    devices: [{ label: "OFFICE-PC (Windows)", lastSeenAt: "2026-10-01T00:00:00Z" }, { label: null, lastSeenAt: "2026-10-02T00:00:00Z" }, "junk"],
  });
  assert.ok(e instanceof PremiumApiError);
  assert.equal(e.code, "too_many_devices");
  assert.equal(e.maxDevices, 2);
  assert.deepEqual(e.devices, [
    { label: "OFFICE-PC (Windows)", lastSeenAt: "2026-10-01T00:00:00Z" },
    { label: null, lastSeenAt: "2026-10-02T00:00:00Z" },
  ]);
  assert.notEqual(e.message, "server text");
  assert.equal(errorFromResponse(403, { error: "revoked" }).code, "revoked");
});
