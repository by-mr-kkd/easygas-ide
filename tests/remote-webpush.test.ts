import { strict as assert } from "node:assert";
import { createDecipheriv, createECDH, createPublicKey, hkdfSync, randomBytes, verify } from "node:crypto";
import { test } from "node:test";
import { encryptPayload, generateVapidKeys, validSubscription, vapidJwt, type PushSubscription } from "../lib/remote/webpush.ts";

/** The phone's side of RFC 8291, written independently of the sender. */
function decrypt(body: Buffer, uaPrivate: Buffer, uaPublic: Buffer, auth: Buffer): Buffer {
  const salt = body.subarray(0, 16);
  const rs = body.readUInt32BE(16);
  const idlen = body[20];
  const asPublic = body.subarray(21, 21 + idlen);
  const ct = body.subarray(21 + idlen);
  assert.equal(rs, 4096);
  const ecdh = createECDH("prime256v1");
  ecdh.setPrivateKey(uaPrivate);
  const shared = ecdh.computeSecret(asPublic);
  const h = (ikm: Buffer, s: Buffer, info: string | Buffer, n: number) => Buffer.from(hkdfSync("sha256", ikm, s, info, n));
  const ikm = h(shared, auth, Buffer.concat([Buffer.from("WebPush: info\0"), uaPublic, asPublic]), 32);
  const cek = h(ikm, salt, "Content-Encoding: aes128gcm\0", 16);
  const nonce = h(ikm, salt, "Content-Encoding: nonce\0", 12);
  const d = createDecipheriv("aes-128-gcm", cek, nonce);
  d.setAuthTag(ct.subarray(ct.length - 16));
  const plain = Buffer.concat([d.update(ct.subarray(0, ct.length - 16)), d.final()]);
  assert.equal(plain[plain.length - 1], 2, "last-record delimiter");
  return plain.subarray(0, plain.length - 1);
}

function phone(): { sub: PushSubscription; priv: Buffer; pub: Buffer; auth: Buffer } {
  const ecdh = createECDH("prime256v1");
  ecdh.generateKeys();
  const auth = randomBytes(16);
  return {
    sub: { endpoint: "https://fcm.googleapis.com/fcm/send/abc", keys: { p256dh: ecdh.getPublicKey().toString("base64url"), auth: auth.toString("base64url") } },
    priv: ecdh.getPrivateKey(),
    pub: ecdh.getPublicKey(),
    auth,
  };
}

test("encryptPayload: the phone decrypts exactly what was sent", () => {
  const p = phone();
  const msg = Buffer.from(JSON.stringify({ title: "AI แก้เสร็จแล้ว", body: "ระบบจองคิว" }));
  const body = encryptPayload(msg, p.sub);
  assert.deepEqual(decrypt(body, p.priv, p.pub, p.auth), msg);
  assert.notDeepEqual(encryptPayload(msg, p.sub), body, "a fresh key and salt every time");
});

test("vapidJwt: ES256 over header.claims, verifiable with the public key; audience is the push origin", () => {
  const keys = generateVapidKeys();
  const jwt = vapidJwt("https://fcm.googleapis.com/fcm/send/abc", keys, "https://easygaside.tech", 1_000_000);
  const [h, c, s] = jwt.split(".");
  const pub = Buffer.from(keys.publicKey, "base64url");
  const key = createPublicKey({ key: { kty: "EC", crv: "P-256", x: pub.subarray(1, 33).toString("base64url"), y: pub.subarray(33).toString("base64url") }, format: "jwk" });
  assert.ok(verify("sha256", Buffer.from(`${h}.${c}`), { key, dsaEncoding: "ieee-p1363" }, Buffer.from(s, "base64url")));
  const claims = JSON.parse(Buffer.from(c, "base64url").toString());
  assert.equal(claims.aud, "https://fcm.googleapis.com");
  assert.equal(claims.exp, 1000 + 12 * 3600);
  assert.deepEqual(JSON.parse(Buffer.from(h, "base64url").toString()), { typ: "JWT", alg: "ES256" });
});

test("validSubscription: only real push services, well-formed keys", () => {
  const p = phone();
  assert.ok(validSubscription(p.sub));
  assert.ok(validSubscription({ ...p.sub, endpoint: "https://web.push.apple.com/QGz" }));
  assert.equal(validSubscription({ ...p.sub, endpoint: "https://evil.example/fcm.googleapis.com" }), null);
  assert.equal(validSubscription({ ...p.sub, endpoint: "http://fcm.googleapis.com/x" }), null);
  assert.equal(validSubscription({ ...p.sub, endpoint: "https://192.168.1.1/" }), null);
  assert.equal(validSubscription({ ...p.sub, keys: { p256dh: "short", auth: p.sub.keys.auth } }), null);
  assert.equal(validSubscription(null), null);
});
