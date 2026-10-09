/**
 * The remote gateway's security pieces (pure, server-only — unit-tested in tests/remote-auth.test.ts).
 *
 *  - Pairing code: 6 digits the desktop shows (and puts in the QR), valid for PAIR_CODE_TTL_MS, one use,
 *    and dead after PAIR_CODE_MAX_FAILS wrong tries in total — so guessing it is out of reach even though
 *    it is short enough to type.
 *  - Device token: 32 random bytes, sent to the phone once as the `egs_dev` cookie (`<deviceId>.<token>`);
 *    only its sha256 is stored, so a copy of remote.json cannot be replayed as a cookie.
 *  - PIN: 6 digits, stored as scrypt(salt) only.
 *  - Lockout: per key (client address, device), LOCK_AFTER_FAILS wrong tries within the window lock it for LOCK_MS.
 */
import { createHash, randomBytes, randomInt, scryptSync, timingSafeEqual } from "node:crypto";

export const PAIR_CODE_TTL_MS = 5 * 60_000;
export const PAIR_CODE_MAX_FAILS = 20;
export const LOCK_AFTER_FAILS = 5;
export const LOCK_MS = 15 * 60_000;
const MAX_TRACKED = 5000;
export const DEVICE_COOKIE = "egs_dev";
export const SESSION_COOKIE = "egs_pin";
export const DEVICE_COOKIE_MAX_AGE_S = 30 * 24 * 3600;
/** a PIN session ends after this long without a request */
export const SESSION_IDLE_MS = 30 * 60_000;

export const newToken = (bytes = 32): string => randomBytes(bytes).toString("base64url");
export const hashToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}

// ---------------------------------------------------------------- pairing code

export interface PairingCode {
  code: string;
  expiresAt: number;
  fails: number;
}

export const newPairingCode = (now: number): PairingCode => ({
  code: String(randomInt(0, 1_000_000)).padStart(6, "0"),
  expiresAt: now + PAIR_CODE_TTL_MS,
  fails: 0,
});

export type PairCheck = "ok" | "wrong" | "expired" | "none";

/** Check a typed / scanned code. A wrong try counts against the code (it is mutated: fails + 1). */
export function checkPairingCode(current: PairingCode | null, typed: string, now: number): PairCheck {
  if (!current) return "none";
  if (now > current.expiresAt || current.fails >= PAIR_CODE_MAX_FAILS) return "expired";
  if (safeEqual(current.code, typed.trim())) return "ok";
  current.fails += 1;
  return "wrong";
}

// ---------------------------------------------------------------- device cookie

export interface StoredDevice {
  id: string;
  tokenHash: string;
}

/** `<deviceId>.<token>` → the device it belongs to, or null. */
export function deviceFromCookie<T extends StoredDevice>(value: string | undefined, devices: readonly T[]): T | null {
  if (!value) return null;
  const dot = value.indexOf(".");
  if (dot <= 0) return null;
  const id = value.slice(0, dot);
  const token = value.slice(dot + 1);
  const device = devices.find((d) => d.id === id);
  return device && token && safeEqual(device.tokenHash, hashToken(token)) ? device : null;
}

// ---------------------------------------------------------------- PIN

export interface PinHash {
  salt: string;
  hash: string;
}

export const validPin = (pin: string): boolean => /^\d{6}$/.test(pin);

/** A PIN anyone would guess first. */
export function weakPin(pin: string): boolean {
  if (/^(\d)\1{5}$/.test(pin)) return true;
  const up = "0123456789012345";
  const down = "9876543210987654";
  return up.includes(pin) || down.includes(pin);
}

const SCRYPT = { N: 16384, r: 8, p: 1 } as const;

export function hashPin(pin: string): PinHash {
  const salt = randomBytes(16);
  return { salt: salt.toString("base64"), hash: scryptSync(pin, salt, 32, SCRYPT).toString("base64") };
}

export function verifyPin(pin: string, stored: PinHash): boolean {
  const got = scryptSync(pin, Buffer.from(stored.salt, "base64"), 32, SCRYPT);
  const want = Buffer.from(stored.hash, "base64");
  return got.length === want.length && timingSafeEqual(got, want);
}

// ---------------------------------------------------------------- lockout

/** Counts wrong tries per key; LOCK_AFTER_FAILS within LOCK_MS locks the key for LOCK_MS. */
export class Lockout {
  private readonly tries = new Map<string, { fails: number; first: number; lockedUntil: number }>();

  lockedFor(key: string, now: number): number {
    const t = this.tries.get(key);
    return t && t.lockedUntil > now ? t.lockedUntil - now : 0;
  }

  /** Record a wrong try; true when this one locked the key. */
  fail(key: string, now: number): boolean {
    let t = this.tries.get(key);
    if (!t || now - t.first > LOCK_MS) t = { fails: 0, first: now, lockedUntil: 0 };
    t.fails += 1;
    const locked = t.fails >= LOCK_AFTER_FAILS && t.lockedUntil <= now;
    if (locked) t.lockedUntil = now + LOCK_MS;
    this.tries.set(key, t);
    if (this.tries.size > MAX_TRACKED) this.prune(now);
    return locked;
  }

  /**
   * Keep the map bounded without ever forgetting a lock: drop finished windows first, then the oldest
   * unlocked entries. (Clearing everything would let a flood of fresh keys wipe a phone's PIN lock.)
   */
  private prune(now: number): void {
    for (const [k, t] of this.tries) if (t.lockedUntil <= now && now - t.first > LOCK_MS) this.tries.delete(k);
    if (this.tries.size <= MAX_TRACKED) return;
    for (const [k, t] of this.tries) {
      if (this.tries.size <= MAX_TRACKED * 0.8) break;
      if (t.lockedUntil <= now) this.tries.delete(k);
    }
  }

  get size(): number {
    return this.tries.size;
  }

  clear(key: string): void {
    this.tries.delete(key);
  }
}

// ---------------------------------------------------------------- cookies

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(";")) {
    const eq = part.indexOf("=");
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    if (!(name in out)) out[name] = decodeURIComponent(part.slice(eq + 1).trim());
  }
  return out;
}

/** A cookie header without our own cookies (the app behind the gateway never needs them). */
export function stripCookies(header: string | undefined, names: readonly string[]): string | undefined {
  if (!header) return undefined;
  const kept = header
    .split(";")
    .map((p) => p.trim())
    .filter((p) => p && !names.includes(p.slice(0, Math.max(0, p.indexOf("="))).trim()));
  return kept.length ? kept.join("; ") : undefined;
}

export function serializeCookie(name: string, value: string, opts: { maxAgeS: number; secure: boolean }): string {
  return [
    `${name}=${encodeURIComponent(value)}`,
    "Path=/",
    `Max-Age=${opts.maxAgeS}`,
    "HttpOnly",
    "SameSite=Lax",
    ...(opts.secure ? ["Secure"] : []),
  ].join("; ");
}

// ---------------------------------------------------------------- misc

/** A short name for the device list, from the phone's User-Agent. */
export function deviceName(userAgent: string | undefined): string {
  const ua = userAgent ?? "";
  if (/iPad/i.test(ua)) return "iPad";
  if (/iPhone/i.test(ua)) return "iPhone";
  const android = /Android[^;)]*;\s*([^;)]+?)(?:\s+Build|\))/i.exec(ua);
  if (android) {
    const model = android[1].trim();
    return /^(K|wv|Linux|U)$/i.test(model) ? "Android" : `Android (${model.slice(0, 30)})`;
  }
  if (/Android/i.test(ua)) return "Android";
  if (/Macintosh/i.test(ua)) return "Mac";
  if (/Windows/i.test(ua)) return "Windows";
  return "อุปกรณ์";
}

const PRIVATE_V4 = /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.)/;
const VIRTUAL_NIC = /vethernet|virtualbox|vmware|hyper-v|wsl|docker|loopback|vpn|tailscale|zerotier|bluetooth/i;

/** The machine's addresses a phone on the same Wi-Fi can reach: private IPv4 on real adapters, best first. */
export function lanAddresses(nics: Record<string, { address: string; family: string | number; internal: boolean }[] | undefined>): string[] {
  const out: { address: string; score: number }[] = [];
  for (const [name, list] of Object.entries(nics)) {
    if (VIRTUAL_NIC.test(name)) continue;
    for (const a of list ?? []) {
      const v4 = a.family === "IPv4" || a.family === 4;
      if (!v4 || a.internal || !PRIVATE_V4.test(a.address)) continue;
      const score = (/wi-?fi|wlan|wireless/i.test(name) ? 2 : 0) + (a.address.startsWith("192.168.") ? 1 : 0);
      out.push({ address: a.address, score });
    }
  }
  return out.sort((x, y) => y.score - x.score).map((x) => x.address);
}

/**
 * A same-site path to go back to after the PIN page (never another site, never our own pages). Parsed the
 * way a browser will read the Location header: control characters and backslashes are refused outright,
 * because browsers drop tabs/newlines while parsing ("/\t/evil.com" becomes "//evil.com").
 */
export function safeNext(next: string | null | undefined): string {
  if (!next || next.length > 2000 || !next.startsWith("/") || /[\u0000-\u001f\u007f\\]/.test(next)) return "/";
  let url: URL;
  try {
    url = new URL(next, "http://gateway.invalid");
  } catch {
    return "/";
  }
  if (url.origin !== "http://gateway.invalid" || url.pathname.startsWith("/__egs/")) return "/";
  return url.pathname + url.search;
}
