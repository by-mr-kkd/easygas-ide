/**
 * Offline licence check (pure, node:crypto). A key is `EGP1.<p>.<s>`: `<p>` = base64url (no padding) of the
 * payload JSON, `<s>` = base64url Ed25519 signature over the ASCII bytes of `<p>`. No expiry.
 */
import { createPublicKey, verify, type KeyObject } from "node:crypto";
import { ACTIVATION_PREFIX, LICENSE_PREFIX, LICENSE_PUBLIC_KEY, type ActivationPayload, type LicensePayload } from "./config.ts";

export type LicenseFailure = "bad_format" | "bad_signature" | "bad_payload";

export type ParsedLicense = { ok: true; payload: LicensePayload } | { ok: false; reason: LicenseFailure };

/** Thai one-liners for each failure, shared by the dialog and the settings section. */
export const LICENSE_FAILURE_TEXT: Record<LicenseFailure, string> = {
  bad_format: "รูปแบบรหัสไม่ถูกต้อง รหัสต้องขึ้นต้นด้วย EGP1 และมี 3 ส่วนคั่นด้วยจุด",
  bad_signature: "รหัสนี้ไม่ผ่านการตรวจสอบ อาจพิมพ์ผิดหรือถูกแก้ไข",
  bad_payload: "ข้อมูลในรหัสไม่ครบหรือไม่ตรงรูปแบบ",
};

const B64URL = /^[A-Za-z0-9_-]+$/;
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** SubjectPublicKeyInfo prefix for an Ed25519 raw public key (RFC 8410). */
const ED25519_SPKI_PREFIX = Buffer.from("302a300506032b6570032100", "hex");

/** Ed25519 public KeyObject from raw 32 bytes (base64). */
export function publicKeyFromRaw(rawB64: string): KeyObject {
  const raw = Buffer.from(rawB64, "base64");
  if (raw.length !== 32) throw new Error("Ed25519 public key must be 32 bytes");
  return createPublicKey({ key: Buffer.concat([ED25519_SPKI_PREFIX, raw]), format: "der", type: "spki" });
}

/** Normalise a pasted key: trim, drop inner whitespace and line breaks (a key copied from an email wraps). */
export function normalizeLicenseKey(input: string): string {
  return input.replace(/\s+/g, "");
}

/**
 * What Settings shows before the user asks to see the key: the first and last 6 characters. Not a secret
 * on its own (the first 6 are the same for every key), but enough to tell two keys apart.
 */
export function maskLicenseKey(key: string): string {
  const k = normalizeLicenseKey(key);
  if (k.length <= 16) return "…";
  return `${k.slice(0, 6)}…${k.slice(-6)}`;
}

function isPayload(x: unknown): x is LicensePayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.id === "string" &&
    p.id.length > 0 &&
    p.id.length <= 64 &&
    typeof p.email === "string" &&
    EMAIL.test(p.email) &&
    p.plan === "premium" &&
    typeof p.iat === "number" &&
    Number.isFinite(p.iat) &&
    p.iat > 0
  );
}

/** Verify a key offline. The signature is checked BEFORE the payload is parsed. */
export function parseLicense(key: string, publicKeyB64: string = LICENSE_PUBLIC_KEY): ParsedLicense {
  const parts = normalizeLicenseKey(key).split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad_format" };
  const [prefix, p, s] = parts;
  if (prefix !== LICENSE_PREFIX || !p || !s || !B64URL.test(p) || !B64URL.test(s)) return { ok: false, reason: "bad_format" };

  const signature = Buffer.from(s, "base64url");
  if (signature.length !== 64) return { ok: false, reason: "bad_signature" };
  let valid = false;
  try {
    valid = verify(null, Buffer.from(p, "ascii"), publicKeyFromRaw(publicKeyB64), signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };

  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (!isPayload(payload)) return { ok: false, reason: "bad_payload" };
  return { ok: true, payload };
}

export type ActivationFailure = "bad_format" | "bad_signature" | "bad_payload";
export type ParsedActivation = { ok: true; payload: ActivationPayload } | { ok: false; reason: ActivationFailure };

function isActivationPayload(x: unknown): x is ActivationPayload {
  if (!x || typeof x !== "object") return false;
  const p = x as Record<string, unknown>;
  return (
    p.v === 1 &&
    typeof p.lid === "string" &&
    p.lid.length > 0 &&
    p.lid.length <= 64 &&
    typeof p.dev === "string" &&
    /^[a-f0-9]{64}$/.test(p.dev) &&
    typeof p.iat === "number" &&
    typeof p.exp === "number" &&
    Number.isFinite(p.iat) &&
    Number.isFinite(p.exp) &&
    p.exp > p.iat
  );
}

/**
 * Verify an activation token offline. The prefix is part of the signed bytes ("EGA1.<p>"), so a licence
 * signature (over "<p>" alone) can never pass as an activation token.
 */
export function parseActivation(token: string, publicKeyB64: string = LICENSE_PUBLIC_KEY): ParsedActivation {
  const parts = String(token ?? "").trim().split(".");
  if (parts.length !== 3) return { ok: false, reason: "bad_format" };
  const [prefix, p, s] = parts;
  if (prefix !== ACTIVATION_PREFIX || !p || !s || !B64URL.test(p) || !B64URL.test(s)) return { ok: false, reason: "bad_format" };
  const signature = Buffer.from(s, "base64url");
  if (signature.length !== 64) return { ok: false, reason: "bad_signature" };
  let valid = false;
  try {
    valid = verify(null, Buffer.from(`${ACTIVATION_PREFIX}.${p}`, "ascii"), publicKeyFromRaw(publicKeyB64), signature);
  } catch {
    valid = false;
  }
  if (!valid) return { ok: false, reason: "bad_signature" };
  let payload: unknown;
  try {
    payload = JSON.parse(Buffer.from(p, "base64url").toString("utf8"));
  } catch {
    return { ok: false, reason: "bad_payload" };
  }
  if (!isActivationPayload(payload)) return { ok: false, reason: "bad_payload" };
  return { ok: true, payload };
}

/** Does this token unlock Pro for this licence on this machine right now? */
export function activationValidFor(payload: ActivationPayload, licenseId: string, deviceHash: string, nowSec: number = Math.floor(Date.now() / 1000)): boolean {
  return payload.lid === licenseId && payload.dev === deviceHash && payload.exp > nowSec;
}
