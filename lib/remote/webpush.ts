/**
 * Web Push from the user's own computer to their phone (Pro, server-only), with Node's crypto only:
 *  - VAPID (RFC 8292): an ES256 JWT signed with this machine's own key pair, so push services know who sends.
 *  - Message encryption (RFC 8291, aes128gcm): only the phone can read the text; Google / Apple / Mozilla
 *    carry an opaque blob.
 * The phone subscribes on easygaside.tech/app (the Pro app) and hands its subscription to the gateway
 * (lib/remote/gateway.ts). Unit-tested in tests/remote-webpush.test.ts (round trip + JWT signature).
 */
import { createCipheriv, createECDH, createPrivateKey, hkdfSync, randomBytes, sign } from "node:crypto";

export interface VapidKeys {
  /** uncompressed P-256 point, base64url (what the phone's pushManager.subscribe takes) */
  publicKey: string;
  /** the private scalar, base64url */
  privateKey: string;
}

export interface PushSubscription {
  endpoint: string;
  keys: { p256dh: string; auth: string };
}

/** Push services that browsers actually use; anything else is refused (no requests to arbitrary hosts). */
const PUSH_HOST = /(^|\.)(fcm\.googleapis\.com|push\.services\.mozilla\.com|push\.apple\.com|notify\.windows\.com)$/i;

export function validSubscription(raw: unknown): PushSubscription | null {
  const s = raw as { endpoint?: unknown; keys?: { p256dh?: unknown; auth?: unknown } } | null;
  if (!s || typeof s.endpoint !== "string" || s.endpoint.length > 1000) return null;
  let url: URL;
  try {
    url = new URL(s.endpoint);
  } catch {
    return null;
  }
  if (url.protocol !== "https:" || !PUSH_HOST.test(url.hostname)) return null;
  const p256dh = s.keys?.p256dh;
  const auth = s.keys?.auth;
  if (typeof p256dh !== "string" || typeof auth !== "string") return null;
  if (Buffer.from(p256dh, "base64url").length !== 65 || Buffer.from(auth, "base64url").length !== 16) return null;
  return { endpoint: s.endpoint, keys: { p256dh, auth } };
}

export function generateVapidKeys(): VapidKeys {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  return { publicKey: ecdh.getPublicKey().toString("base64url"), privateKey: ecdh.getPrivateKey().toString("base64url") };
}

const hkdf = (ikm: Buffer, salt: Buffer, info: Buffer, len: number): Buffer => Buffer.from(hkdfSync("sha256", ikm, salt, info, len));

/** RFC 8291 aes128gcm body for one subscription (one record, so the whole payload must fit 4 KB). */
export function encryptPayload(payload: Buffer, sub: PushSubscription, salt = randomBytes(16)): Buffer {
  if (payload.length > 3800) throw new Error("push payload too large");
  const uaPublic = Buffer.from(sub.keys.p256dh, "base64url");
  const authSecret = Buffer.from(sub.keys.auth, "base64url");
  const local = createECDH("prime256v1");
  local.generateKeys();
  const asPublic = local.getPublicKey();
  const shared = local.computeSecret(uaPublic);
  const ikm = hkdf(shared, authSecret, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const cek = hkdf(ikm, salt, Buffer.from("Content-Encoding: aes128gcm\0"), 16);
  const nonce = hkdf(ikm, salt, Buffer.from("Content-Encoding: nonce\0"), 12);
  const cipher = createCipheriv("aes-128-gcm", cek, nonce);
  const body = Buffer.concat([cipher.update(Buffer.concat([payload, Buffer.from([2])])), cipher.final(), cipher.getAuthTag()]);
  const rs = Buffer.alloc(4);
  rs.writeUInt32BE(4096);
  return Buffer.concat([salt, rs, Buffer.from([asPublic.length]), asPublic, body]);
}

/** RFC 8292 VAPID JWT for the push service at `endpoint` (valid 12 h). */
export function vapidJwt(endpoint: string, keys: VapidKeys, subject: string, now = Date.now()): string {
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = createPrivateKey({
    key: {
      kty: "EC",
      crv: "P-256",
      d: keys.privateKey,
      x: pub.subarray(1, 33).toString("base64url"),
      y: pub.subarray(33, 65).toString("base64url"),
    },
    format: "jwk",
  });
  const enc = (o: unknown) => Buffer.from(JSON.stringify(o)).toString("base64url");
  const head = enc({ typ: "JWT", alg: "ES256" });
  const claims = enc({ aud: new URL(endpoint).origin, exp: Math.floor(now / 1000) + 12 * 3600, sub: subject });
  const sig = sign("sha256", Buffer.from(`${head}.${claims}`), { key, dsaEncoding: "ieee-p1363" });
  return `${head}.${claims}.${sig.toString("base64url")}`;
}

export type PushResult = "sent" | "gone" | "failed";

/** Send one notification. "gone" = the phone unsubscribed (or the subscription expired): forget it. */
export async function sendPush(sub: PushSubscription, payload: unknown, keys: VapidKeys, subject = "https://easygaside.tech"): Promise<PushResult> {
  const body = encryptPayload(Buffer.from(JSON.stringify(payload)), sub);
  try {
    const res = await fetch(sub.endpoint, {
      method: "POST",
      headers: {
        authorization: `vapid t=${vapidJwt(sub.endpoint, keys, subject)}, k=${keys.publicKey}`,
        "content-encoding": "aes128gcm",
        "content-type": "application/octet-stream",
        ttl: "86400",
        urgency: "high",
      },
      body: new Uint8Array(body),
      signal: AbortSignal.timeout(15_000),
    });
    if (res.status === 404 || res.status === 410) return "gone";
    if (!res.ok) {
      console.error("[remote] push refused:", res.status, (await res.text().catch(() => "")).slice(0, 200));
      return "failed";
    }
    return "sent";
  } catch (e) {
    console.error("[remote] push failed:", e instanceof Error ? e.message : e);
    return "failed";
  }
}
