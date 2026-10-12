import { strict as assert } from "node:assert";
import http from "node:http";
import type { AddressInfo } from "node:net";
import { after, before, test } from "node:test";
import { hashPin, hashToken, newPairingCode, type PairingCode } from "../lib/remote/auth.ts";
import { createGateway } from "../lib/remote/gateway.ts";
import type { RemoteConfig } from "../lib/remote/store.ts";

// A stand-in for the app's own server: echoes what reached it, redirects, and streams.
let seen: http.IncomingHttpHeaders = {};
const upstream = http.createServer((req, res) => {
  seen = req.headers;
  if (req.url === "/redirect") {
    res.writeHead(307, { location: `http://127.0.0.1:${upPort}/landed` });
    return res.end();
  }
  if (req.url === "/sse") {
    res.writeHead(200, { "content-type": "text/event-stream" });
    res.write('data: {"n":1}\n\n');
    setTimeout(() => {
      res.write('data: {"n":2}\n\n');
      res.end();
    }, 200);
    return;
  }
  res.writeHead(200, {
    "content-type": "application/json",
    "set-cookie": "app=1; Path=/",
    "x-frame-options": "DENY",
    "content-security-policy": "frame-ancestors 'none'; object-src 'none'",
  });
  res.end(JSON.stringify({ path: req.url }));
});

let upPort = 0;
let gw: http.Server;
let base = "";
const SECRET = "s3cret-value";
const notices: string[] = [];
let pairing: PairingCode | null = null;
const cfg: RemoteConfig = { v: 1, enabled: true, mode: "lan", port: null, pin: null, devices: [], relayId: null, relayName: null, vapid: null };
let tokenSeq = 0;
let pro = true;
let mode: "lan" | "tunnel" = "lan";
const APP = "https://easygaside.tech";
const pushes = new Map<string, unknown>();

before(async () => {
  await new Promise<void>((r) => upstream.listen(0, "127.0.0.1", () => r()));
  upPort = (upstream.address() as AddressInfo).port;
  gw = createGateway({
    upstreamPort: upPort,
    secret: SECRET,
    mode: () => mode,
    config: () => cfg,
    pairing: () => pairing,
    endPairing: () => {
      pairing = null;
    },
    addDevice: async (name) => {
      tokenSeq += 1;
      const id = `dev${tokenSeq}`;
      const token = `token-${tokenSeq}`;
      cfg.devices.push({ id, tokenHash: hashToken(token), name, pairedAt: "", lastSeenAt: null, push: null });
      return { id, token };
    },
    touchDevice: () => {},
    pro: () => pro,
    appOrigins: [APP],
    vapidKey: async () => "VAPID_PUBLIC",
    setPush: async (id, sub) => {
      pushes.set(id, sub);
    },
    testPush: async (id) => (pushes.get(id) ? "sent" : "none"),
    notify: (title) => notices.push(title),
    hubSync: async () => ({ key: "author-key", projects: [] }),
    keepAliveMs: 60,
  });
  await new Promise<void>((r) => gw.listen(0, "127.0.0.1", () => r()));
  base = `http://127.0.0.1:${(gw.address() as AddressInfo).port}`;
});

after(() => {
  gw.close();
  upstream.close();
  gw.closeAllConnections();
  upstream.closeAllConnections();
});

const go = (path: string, init: RequestInit & { cookie?: string } = {}) =>
  fetch(base + path, { redirect: "manual", ...init, headers: { ...(init.cookie ? { cookie: init.cookie } : {}), ...(init.headers as Record<string, string>) } });

const cookieOf = (res: Response, name: string): string | null => {
  for (const c of res.headers.getSetCookie()) if (c.startsWith(`${name}=`)) return c.split(";")[0];
  return null;
};

async function pairPhone(): Promise<string> {
  pairing = newPairingCode(Date.now());
  const res = await go("/__egs/pair", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" },
    body: `c=${pairing.code}`,
  });
  assert.equal(res.status, 303);
  assert.equal(res.headers.get("location"), "/");
  const c = cookieOf(res, "egs_dev");
  assert.ok(c, "device cookie set");
  assert.equal(pairing, null, "the code is used up");
  return c!;
}

test("unpaired: a page asks for the code, anything else is a bare 403", async () => {
  const page = await go("/projects", { headers: { accept: "text/html" } });
  assert.equal(page.status, 403);
  assert.match(await page.text(), /จับคู่มือถือกับคอม/);
  const api = await go("/api/agent/x", { method: "POST" });
  assert.equal(api.status, 403);
  assert.deepEqual(await api.json(), { error: "not_paired" });
  assert.equal((await go("/_next/static/chunk.js")).status, 403);
  assert.equal((await go("/projects", { cookie: "egs_dev=dev999.nope" })).status, 403, "a made-up cookie");
});

test("pairing: a wrong code is refused, the right one pairs once", async () => {
  pairing = newPairingCode(Date.now());
  const wrong = pairing.code === "000000" ? "111111" : "000000";
  const bad = await go("/__egs/pair", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `c=${wrong}` });
  assert.equal(bad.status, 400);
  assert.ok(pairing, "a wrong try does not end pairing");
  const cookie = await pairPhone();
  assert.match(cookie, /^egs_dev=dev\d+\.token-\d+$/);
  assert.equal(cfg.devices.at(-1)?.name, "iPhone");
  assert.ok(notices.includes("จับคู่มือถือแล้ว"));
  const again = await go("/__egs/pair", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "c=123456" });
  assert.equal(again.status, 400, "no code is open any more");
});

test("forwarding: loopback host, our secret, our cookies and forwarded-for headers removed", async () => {
  const dev = await pairPhone();
  const res = await go("/echo", {
    cookie: `${dev}; theme=dark`,
    headers: { "x-forwarded-for": "1.2.3.4", "x-forwarded-host": "evil", "x-egs-remote": "forged", "cf-connecting-ip": "5.6.7.8" },
  });
  assert.equal(res.status, 200);
  assert.deepEqual(await res.json(), { path: "/echo" });
  assert.equal(seen.host, `127.0.0.1:${upPort}`);
  assert.equal(seen["x-egs-remote"], SECRET);
  assert.match(String(seen["x-egs-device"]), /^dev\d+$/, "the phone is named for notifications");
  assert.equal(seen.cookie, "theme=dark");
  assert.equal(seen["x-forwarded-for"], undefined);
  assert.equal(seen["x-forwarded-host"], undefined);
  assert.equal(seen["cf-connecting-ip"], undefined);
  assert.ok(cookieOf(res, "egs_pin"), "a session starts with the first request");
  assert.ok(cookieOf(res, "app"), "the app's own cookies still come back");
});

test("forwarding: same-origin Origin becomes loopback, another site's is refused", async () => {
  const dev = await pairPhone();
  const host = new URL(base).host;
  const ok = await go("/echo", { method: "POST", cookie: dev, headers: { origin: `http://${host}`, referer: `http://${host}/projects?a=1` }, body: "{}" });
  assert.equal(ok.status, 200);
  assert.equal(seen.origin, `http://127.0.0.1:${upPort}`);
  assert.equal(seen.referer, `http://127.0.0.1:${upPort}/projects?a=1`);
  const evil = await go("/echo", { method: "POST", cookie: dev, headers: { origin: "https://evil.example" }, body: "{}" });
  assert.equal(evil.status, 403);
});

test("forwarding: a redirect to the app's loopback address comes back as a path", async () => {
  const dev = await pairPhone();
  const res = await go("/redirect", { cookie: dev });
  assert.equal(res.status, 307);
  assert.equal(res.headers.get("location"), "/landed");
});

test("streams pass through as they come, with keep-alive comments while idle", async () => {
  const dev = await pairPhone();
  const res = await go("/sse", { method: "POST", cookie: dev });
  assert.equal(res.headers.get("content-type"), "text/event-stream");
  const text = await res.text();
  assert.match(text, /data: \{"n":1\}/);
  assert.match(text, /data: \{"n":2\}/);
  assert.match(text, /: keepalive/);
  assert.equal(seen["accept-encoding"], "identity");
});

test("PIN: pages go to the PIN form, wrong PINs lock, the right one opens a session", async () => {
  cfg.pin = hashPin("482913");
  try {
    const dev = await pairPhone();
    const page = await go("/projects/abc", { cookie: dev, headers: { accept: "text/html" } });
    assert.equal(page.status, 303);
    assert.equal(page.headers.get("location"), "/__egs/pin?next=%2Fprojects%2Fabc");
    const api = await go("/echo", { cookie: dev });
    assert.equal(api.status, 401);

    const tryPin = (pin: string) =>
      go("/__egs/pin", { method: "POST", cookie: dev, headers: { "content-type": "application/x-www-form-urlencoded" }, body: `pin=${pin}&next=%2Fprojects%2Fabc` });
    const good = await tryPin("482913");
    assert.equal(good.status, 303);
    assert.equal(good.headers.get("location"), "/projects/abc");
    const session = cookieOf(good, "egs_pin");
    assert.ok(session);
    assert.equal((await go("/echo", { cookie: `${dev}; ${session}` })).status, 200);

    const other = await pairPhone();
    const tryOther = (pin: string) =>
      go("/__egs/pin", { method: "POST", cookie: other, headers: { "content-type": "application/x-www-form-urlencoded" }, body: `pin=${pin}` });
    for (let i = 0; i < 4; i++) assert.equal((await tryOther("000000")).status, 401);
    assert.equal((await tryOther("000000")).status, 429);
    assert.ok(notices.includes("ใส่ PIN ผิด 5 ครั้ง"));
    assert.equal((await tryOther("482913")).status, 429, "locked even with the right PIN");
  } finally {
    cfg.pin = null;
  }
});

test("setting a PIN ends sessions that were opened without one", async () => {
  const dev = await pairPhone();
  const first = await go("/echo", { cookie: dev });
  const session = cookieOf(first, "egs_pin");
  assert.ok(session);
  assert.equal((await go("/echo", { cookie: `${dev}; ${session}` })).status, 200);
  cfg.pin = hashPin("482913");
  try {
    assert.equal((await go("/echo", { cookie: `${dev}; ${session}` })).status, 401, "the old session no longer counts");
  } finally {
    cfg.pin = null;
  }
});

const api = (path: string, init: RequestInit = {}, origin = APP) =>
  fetch(`${base}/__egs/api/${path}`, { ...init, headers: { origin, "content-type": "application/json", ...(init.headers as Record<string, string>) } });

test("Pro API: only from easygaside.tech, preflight answered, closed when not Pro", async () => {
  assert.equal((await api("hello", {}, "https://evil.example")).status, 403);
  const pre = await fetch(`${base}/__egs/api/pair`, { method: "OPTIONS", headers: { origin: APP, "access-control-request-method": "POST" } });
  assert.equal(pre.status, 204);
  assert.equal(pre.headers.get("access-control-allow-origin"), APP);
  pro = false;
  try {
    const r = await api("pair", { method: "POST", body: JSON.stringify({ code: "123456" }) });
    assert.equal(r.status, 403);
    assert.equal((await r.json()).error, "not_pro");
  } finally {
    pro = true;
  }
});

test("Pro API: ping answers without a token and never counts toward the lockout", async () => {
  for (let i = 0; i < 8; i++) {
    const r = await api("ping", { cache: "no-store" });
    assert.equal(r.status, 200);
    assert.equal(r.headers.get("access-control-allow-origin"), APP);
  }
  // eight pings later a wrong token is still "unpaired", not "locked"
  assert.equal((await api("hello", { headers: { authorization: "Bearer nobody.nope" } })).status, 401);
});

test("Pro API: pair with the code, then hello / push with the Bearer token", async () => {
  pairing = newPairingCode(Date.now());
  const wrong = await api("pair", { method: "POST", body: JSON.stringify({ code: pairing.code === "000000" ? "111111" : "000000" }) });
  assert.equal(wrong.status, 400);
  const ok = await api("pair", { method: "POST", body: JSON.stringify({ code: pairing.code }), headers: { "user-agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0)" } });
  assert.equal(ok.status, 200);
  assert.equal(ok.headers.get("access-control-allow-origin"), APP);
  const p = (await ok.json()) as { deviceId: string; token: string; deviceName: string; vapidKey: string };
  assert.equal(p.vapidKey, "VAPID_PUBLIC");
  assert.equal(p.deviceName, "iPhone · แอป");
  assert.equal(pairing, null);
  const bearer = { authorization: `Bearer ${p.deviceId}.${p.token}` };

  const hello = await api("hello", { headers: bearer });
  assert.equal(hello.status, 200);
  assert.equal((await hello.json()).push, false);
  assert.equal((await api("hello", { headers: { authorization: `Bearer ${p.deviceId}.nope` } })).status, 401);

  const sub = { endpoint: "https://fcm.googleapis.com/fcm/send/x", keys: { p256dh: Buffer.alloc(65, 4).toString("base64url"), auth: Buffer.alloc(16, 1).toString("base64url") } };
  assert.equal((await api("push", { method: "POST", headers: bearer, body: JSON.stringify({ subscription: { ...sub, endpoint: "https://evil.example/x" } }) })).status, 400);
  assert.equal((await api("push", { method: "POST", headers: bearer, body: JSON.stringify({ subscription: sub }) })).status, 200);
  assert.deepEqual(pushes.get(p.deviceId), sub);
  assert.deepEqual(await (await api("push-test", { method: "POST", headers: bearer })).json(), { result: "sent" });
  // ฮับของฉัน: only a paired phone gets the author key
  assert.equal((await api("hub-sync", { method: "POST" })).status, 401);
  const hub = await api("hub-sync", { method: "POST", headers: bearer });
  assert.equal(hub.status, 200);
  assert.equal((await hub.json()).key, "author-key");
  assert.equal((await api("push", { method: "POST", headers: bearer, body: JSON.stringify({ subscription: null }) })).status, 200);
  assert.equal(pushes.get(p.deviceId), null);
});

test("resume: the page goes back to the asked path on this host only", async () => {
  const page = await (await go("/__egs/resume?next=%2Fprojects%2Fabc")).text();
  assert.match(page, /next="\/projects\/abc"/);
  const evil = await (await go("/__egs/resume?next=%2F%2Fevil.com")).text();
  assert.match(evil, /next="\/"/);
});

test("resume (Pro app): a stored device token buys a cookie on this host", async () => {
  const dev = await pairPhone();
  const value = dev.slice("egs_dev=".length);
  const ok = await go("/__egs/resume", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: `t=${encodeURIComponent(value)}` });
  assert.equal(ok.status, 204);
  assert.equal(cookieOf(ok, "egs_dev"), dev);
  const bad = await go("/__egs/resume", { method: "POST", headers: { "content-type": "application/x-www-form-urlencoded" }, body: "t=dev1.wrong" });
  assert.equal(bad.status, 403);
});

test("a removed device is out at once", async () => {
  const dev = await pairPhone();
  const id = dev.slice("egs_dev=".length).split(".")[0];
  assert.equal((await go("/echo", { cookie: dev })).status, 200);
  cfg.devices = cfg.devices.filter((d) => d.id !== id);
  assert.equal((await go("/echo", { cookie: dev })).status, 403);
});

test("Pro app frame: over https the app's origin may frame the IDE; http, Free and other sites may not", async () => {
  const dev = await pairPhone();
  const https = { "cf-visitor": '{"scheme":"https"}', "cf-connecting-ip": "203.0.113.9" };
  // same Wi-Fi (http): untouched
  const lan = await go("/echo", { cookie: dev });
  assert.equal(lan.headers.get("x-frame-options"), "DENY");
  mode = "tunnel";
  try {
    const page = await go("/__egs/resume?next=%2F", { headers: https });
    assert.equal(page.headers.get("x-frame-options"), null);
    assert.equal(page.headers.get("content-security-policy"), `frame-ancestors 'self' ${APP}`);
    const proxied = await go("/echo", { cookie: dev, headers: https });
    assert.equal(proxied.headers.get("x-frame-options"), null);
    assert.equal(proxied.headers.get("content-security-policy"), `frame-ancestors 'self' ${APP}; object-src 'none'`);
    // the cookie the frame needs: SameSite=None + Partitioned, https only
    const value = dev.slice("egs_dev=".length);
    const r = await go("/__egs/resume", { method: "POST", headers: { ...https, "content-type": "application/x-www-form-urlencoded" }, body: `t=${encodeURIComponent(value)}` });
    assert.match(r.headers.getSetCookie().join(" | "), /SameSite=None; Secure; Partitioned/);
    // tunnel without https, or Free: DENY as before
    assert.equal((await go("/echo", { cookie: dev })).headers.get("x-frame-options"), "DENY");
    pro = false;
    assert.equal((await go("/__egs/resume?next=%2F", { headers: https })).headers.get("x-frame-options"), "DENY");
  } finally {
    mode = "lan";
    pro = true;
  }
});

test("ping: 204 with a paired cookie, 403 without (the framed resume page checks its cookie stuck)", async () => {
  const dev = await pairPhone();
  assert.equal((await go("/__egs/ping", { cookie: dev })).status, 204);
  assert.equal((await go("/__egs/ping")).status, 403);
});

test("resume with a remembered PIN: right = session at once, wrong (PIN changed) = the PIN page again", async () => {
  const dev = await pairPhone();
  const value = dev.slice("egs_dev=".length);
  cfg.pin = hashPin("482913");
  // tunnel mode: its own client address, untouched by the lock-out tests above
  mode = "tunnel";
  try {
    const ip = { "cf-connecting-ip": "203.0.113.20" };
    const form = (p: string) => ({ method: "POST", headers: { ...ip, "content-type": "application/x-www-form-urlencoded" }, body: `t=${encodeURIComponent(value)}&p=${p}` });
    const ok = await go("/__egs/resume", form("482913"));
    assert.equal(ok.status, 204);
    const session = cookieOf(ok, "egs_pin");
    assert.ok(session, "a session cookie with the device cookie");
    assert.equal((await go("/echo", { cookie: `${dev}; ${session}` })).status, 200);
    const old = await go("/__egs/resume", form("111111"));
    assert.equal(old.status, 204, "the device still resumes");
    assert.equal(cookieOf(old, "egs_pin"), null, "but no session: the PIN page asks");
    const page = await go("/echo", { cookie: dev, headers: { ...ip, accept: "text/html" } });
    assert.equal(page.status, 303);
    assert.match(page.headers.get("location") ?? "", /^\/__egs\/pin/);
  } finally {
    cfg.pin = null;
    mode = "lan";
  }
});

test("PIN page: the remember box (and the hand-off to the app) only where the Pro app may frame it", async () => {
  const dev = await pairPhone();
  cfg.pin = hashPin("482913");
  mode = "tunnel";
  try {
    const https = { "cf-visitor": '{"scheme":"https"}', "cf-connecting-ip": "203.0.113.10" };
    const framed = await (await go("/__egs/pin?next=%2F", { cookie: dev, headers: https })).text();
    assert.match(framed, /จำ PIN ไว้ในแอป/);
    assert.match(framed, /postMessage\(\{egs:"pin"/);
    assert.match(framed, /"https:\/\/easygaside\.tech"/);
    const plain = await (await go("/__egs/pin?next=%2F", { cookie: dev })).text();
    assert.doesNotMatch(plain, /จำ PIN ไว้ในแอป/);
  } finally {
    cfg.pin = null;
    mode = "lan";
  }
});

test("handoff: a phone paired on this host hands its record to the Pro app (fragment only)", async () => {
  const dev = await pairPhone();
  const plain = await go("/__egs/handoff", { cookie: dev });
  assert.equal(plain.status, 303);
  assert.equal(plain.headers.get("location"), `${APP}/app`, "no link name yet: just the app");
  cfg.relayId = "relay123";
  cfg.relayName = "kkd-easygas";
  try {
    const r = await go("/__egs/handoff", { cookie: dev });
    const loc = r.headers.get("location") ?? "";
    assert.ok(loc.startsWith(`${APP}/app#import=`));
    const rec = JSON.parse(Buffer.from(loc.split("#import=")[1], "base64url").toString("utf8"));
    assert.deepEqual(rec, { id: "relay123", name: "kkd-easygas", token: dev.slice("egs_dev=".length), vapid: "VAPID_PUBLIC" });
    assert.equal((await go("/__egs/handoff")).status, 403, "never without the device cookie");
  } finally {
    cfg.relayId = null;
    cfg.relayName = null;
  }
});
