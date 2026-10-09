/**
 * The remote gateway (server-only): the one door a phone comes in through. It listens on its own port
 * (loopback for the Cloudflare tunnel, every interface on "same Wi-Fi"), lets a request through only
 * with a paired device's cookie (and an unlocked PIN session when a PIN is set), and forwards it to the
 * app's own server on 127.0.0.1 — which itself never listens beyond loopback (docs/REMOTE-PLAN.md).
 *
 * Forwarding: our cookies and every x-forwarded-* / cf-* header are dropped, Host becomes the app's
 * loopback address and a same-origin Origin is rewritten to it (so middleware.ts and Next's server
 * actions see an ordinary local request), and `x-egs-remote: <secret>` marks the request as remote
 * (lib/remote/request.ts), `x-egs-device: <id>` names the phone (who to notify when the AI finishes).
 * Streams pass through unbuffered; an idle event stream gets a comment line every KEEPALIVE_MS so
 * Cloudflare does not cut it (~100 s limit) while the AI thinks.
 *
 * Pro: /__egs/api/* is a small JSON API for the Pro app at easygaside.tech/app (CORS, that origin only,
 * Bearer device token instead of cookies): pair with the 6-digit code, hand in a Web Push subscription,
 * send a test notification. The Pro app keeps the device token in its own storage, which also works in
 * an iPhone home-screen app (it does not share Safari's storage).
 */
import http from "node:http";
import { randomUUID } from "node:crypto";
import {
  DEVICE_COOKIE,
  DEVICE_COOKIE_MAX_AGE_S,
  Lockout,
  SESSION_COOKIE,
  SESSION_IDLE_MS,
  checkPairingCode,
  deviceFromCookie,
  deviceName,
  newToken,
  parseCookies,
  safeNext,
  serializeCookie,
  stripCookies,
  verifyPin,
  type PairingCode,
} from "./auth.ts";
import { errorPage, lockedPage, pairPage, pinPage, resumePage } from "./pages.ts";
import type { RemoteConfig, RemoteDevice, RemoteMode } from "./store.ts";
import { validSubscription, type PushResult, type PushSubscription } from "./webpush.ts";

export const KEEPALIVE_MS = 15_000;
const MAX_FORM_BYTES = 4096;
/** the Pro app; tests and a local copy of the site add theirs through `appOrigins` */
export const PRO_APP_ORIGIN = "https://easygaside.tech";
const SESSION_COOKIE_MAX_AGE_S = 12 * 3600;
const MAX_SESSIONS = 500;
/** a "phone connected" notification at most this often per device */
const CONNECT_NOTICE_MS = 30 * 60_000;

export interface GatewayContext {
  upstreamPort: number;
  /** value of x-egs-remote; the app trusts the header only when it matches */
  secret: string;
  mode(): RemoteMode;
  config(): RemoteConfig;
  pairing(): PairingCode | null;
  endPairing(): void;
  addDevice(name: string): Promise<{ id: string; token: string }>;
  touchDevice(id: string): void;
  /** Pro is active on this machine (the /__egs/api/* door is closed otherwise) */
  pro(): boolean;
  /** origins allowed to call /__egs/api/* (CORS) */
  appOrigins: readonly string[];
  /** this machine's VAPID public key (made on first use) */
  vapidKey(): Promise<string>;
  setPush(deviceId: string, sub: PushSubscription | null): Promise<void>;
  testPush(deviceId: string): Promise<PushResult | "none">;
  notify(title: string, body: string): void;
  now?: () => number;
  /** tests only: a shorter keep-alive than KEEPALIVE_MS */
  keepAliveMs?: number;
}

const HOP_BY_HOP = ["connection", "keep-alive", "proxy-connection", "proxy-authenticate", "proxy-authorization", "te", "trailer", "transfer-encoding", "upgrade"];
const DROP_PREFIX = /^(x-forwarded-|cf-|x-real-ip$|forwarded$|cdn-loop$|true-client-ip$|x-egs-)/i;

function send(res: http.ServerResponse, status: number, html: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(status, {
    "content-type": "text/html; charset=utf-8",
    "cache-control": "no-store",
    "x-frame-options": "DENY",
    "referrer-policy": "no-referrer",
    ...headers,
  });
  res.end(html);
}

function redirect(res: http.ServerResponse, to: string, headers: Record<string, string | string[]> = {}): void {
  res.writeHead(303, { location: to, "cache-control": "no-store", ...headers });
  res.end();
}

function readForm(req: http.IncomingMessage): Promise<URLSearchParams> {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks: Buffer[] = [];
    req.on("data", (c: Buffer) => {
      size += c.length;
      if (size > MAX_FORM_BYTES) {
        reject(new Error("too_large"));
        req.destroy();
      } else chunks.push(c);
    });
    req.on("end", () => resolve(new URLSearchParams(Buffer.concat(chunks).toString("utf8"))));
    req.on("error", reject);
  });
}

const wantsPage = (req: http.IncomingMessage): boolean =>
  req.method === "GET" && (req.headers["sec-fetch-dest"] === "document" || /text\/html/.test(String(req.headers.accept ?? "")));

export function createGateway(ctx: GatewayContext): http.Server {
  const now = ctx.now ?? Date.now;
  const lockout = new Lockout();
  // `pin` = the salt of the PIN the session was opened under: setting or changing the PIN ends every session
  const sessions = new Map<string, { deviceId: string; last: number; pin: string | null }>();
  const pinStamp = () => ctx.config().pin?.salt ?? null;
  const lastConnectNotice = new Map<string, number>();
  const agent = new http.Agent({ keepAlive: true, maxSockets: 64 });

  const isLoopback = (a: string | undefined) => !!a && (a === "127.0.0.1" || a === "::1" || a === "::ffff:127.0.0.1");
  /** who is asking: behind the tunnel every socket is loopback, so the edge's header names the phone */
  const clientOf = (req: http.IncomingMessage): string => {
    const sock = req.socket.remoteAddress;
    if (ctx.mode() === "tunnel" && isLoopback(sock)) return String(req.headers["cf-connecting-ip"] ?? "tunnel");
    return sock ?? "unknown";
  };
  const secureOf = (req: http.IncomingMessage) => ctx.mode() === "tunnel" && /https/i.test(String(req.headers["cf-visitor"] ?? req.headers["x-forwarded-proto"] ?? ""));

  const deviceCookie = (req: http.IncomingMessage, id: string, token: string) =>
    serializeCookie(DEVICE_COOKIE, `${id}.${token}`, { maxAgeS: DEVICE_COOKIE_MAX_AGE_S, secure: secureOf(req) });

  function startSession(req: http.IncomingMessage, device: RemoteDevice): string {
    const sid = newToken(24);
    sessions.set(sid, { deviceId: device.id, last: now(), pin: pinStamp() });
    if (sessions.size > MAX_SESSIONS) {
      for (const [k, s] of sessions) if (now() - s.last > SESSION_IDLE_MS) sessions.delete(k);
      // a client that throws its cookies away opens a session per request: drop the oldest
      for (const k of sessions.keys()) {
        if (sessions.size <= MAX_SESSIONS) break;
        sessions.delete(k);
      }
    }
    const last = lastConnectNotice.get(device.id) ?? 0;
    if (now() - last > CONNECT_NOTICE_MS) {
      lastConnectNotice.set(device.id, now());
      ctx.notify("มือถือเชื่อมต่อเข้ามา", `${device.name} กำลังใช้ EasyGAS IDE จากระยะไกล`);
    }
    return serializeCookie(SESSION_COOKIE, sid, { maxAgeS: SESSION_COOKIE_MAX_AGE_S, secure: secureOf(req) });
  }

  function sessionOf(req: http.IncomingMessage, deviceId: string): boolean {
    const sid = parseCookies(req.headers.cookie)[SESSION_COOKIE];
    const s = sid ? sessions.get(sid) : undefined;
    if (!s || s.deviceId !== deviceId || s.pin !== pinStamp() || now() - s.last > SESSION_IDLE_MS) return false;
    s.last = now();
    return true;
  }

  function lockedMinutes(...keys: string[]): number {
    const ms = Math.max(...keys.map((k) => lockout.lockedFor(k, now())));
    return ms > 0 ? Math.ceil(ms / 60_000) : 0;
  }

  // ------------------------------------------------------------ pairing (page and Pro API)

  type Paired = { ok: true; id: string; token: string; name: string } | { ok: false; status: number; error: string; locked?: number };

  async function pairWith(req: http.IncomingMessage, code: string, suffix = ""): Promise<Paired> {
    const key = `pair:${clientOf(req)}`;
    const locked = lockedMinutes(key);
    if (locked) return { ok: false, status: 429, error: `ลองผิดหลายครั้งเกินไป ลองใหม่อีก ${locked} นาที`, locked };
    const result = checkPairingCode(ctx.pairing(), code, now());
    if (result !== "ok") {
      if (result === "wrong" && lockout.fail(key, now())) ctx.notify("มีคนพยายามจับคู่", "ใส่รหัสจับคู่ผิดหลายครั้ง รหัสถูกล็อกไว้ 15 นาที");
      const error = result === "wrong" ? "รหัสไม่ถูกต้อง" : "รหัสหมดอายุแล้ว กด “จับคู่มือถือ” บนคอมเพื่อรับรหัสใหม่";
      return { ok: false, status: 400, error };
    }
    ctx.endPairing();
    lockout.clear(key);
    const name = `${deviceName(req.headers["user-agent"])}${suffix}`;
    const { id, token } = await ctx.addDevice(name);
    ctx.notify("จับคู่มือถือแล้ว", `${name} ใช้ EasyGAS IDE จากระยะไกลได้แล้ว ถอนได้ที่ ตั้งค่า → ใช้จากมือถือ`);
    return { ok: true, id, token, name };
  }

  async function pair(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (req.method === "GET") return send(res, 200, pairPage({ code: url.searchParams.get("c") ?? "", auto: true }));
    if (req.method !== "POST") return send(res, 405, errorPage("ไม่รองรับ", "ใช้ไม่ได้"));
    const form = await readForm(req);
    const r = await pairWith(req, form.get("c") ?? "");
    if (!r.ok) return r.locked ? send(res, 429, lockedPage(r.locked)) : send(res, r.status, pairPage({ error: r.error }));
    redirect(res, "/", { "set-cookie": deviceCookie(req, r.id, r.token) });
  }

  // ------------------------------------------------------------ /__egs/api/* (Pro app, CORS)

  function json(res: http.ServerResponse, status: number, body: unknown, origin: string | null) {
    res.writeHead(status, {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    });
    res.end(JSON.stringify(body));
  }

  async function readJson(req: http.IncomingMessage): Promise<Record<string, unknown>> {
    const chunks: Buffer[] = [];
    let size = 0;
    for await (const c of req) {
      size += (c as Buffer).length;
      if (size > MAX_FORM_BYTES) throw new Error("too_large");
      chunks.push(c as Buffer);
    }
    try {
      const v = JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}");
      return v && typeof v === "object" ? (v as Record<string, unknown>) : {};
    } catch {
      return {};
    }
  }

  async function api(req: http.IncomingMessage, res: http.ServerResponse, path: string) {
    const origin = typeof req.headers.origin === "string" && ctx.appOrigins.includes(req.headers.origin) ? req.headers.origin : null;
    if (!origin) return json(res, 403, { error: "origin" }, null);
    if (req.method === "OPTIONS") {
      res.writeHead(204, {
        "access-control-allow-origin": origin,
        "access-control-allow-methods": "GET, POST",
        "access-control-allow-headers": "content-type, authorization",
        "access-control-max-age": "600",
        vary: "Origin",
      });
      return res.end();
    }
    if (!ctx.pro()) return json(res, 403, { error: "not_pro", message: "คอมเครื่องนี้ไม่ได้ใช้ Pro" }, origin);

    if (path === "pair" && req.method === "POST") {
      const body = await readJson(req);
      const r = await pairWith(req, String(body.code ?? ""), " · แอป");
      if (!r.ok) return json(res, r.status, { error: r.status === 429 ? "locked" : "bad_code", message: r.error }, origin);
      return json(res, 200, { deviceId: r.id, token: r.token, deviceName: r.name, vapidKey: await ctx.vapidKey(), pin: !!ctx.config().pin }, origin);
    }

    // everything else: the device token the Pro app keeps, as a Bearer header (no cookies cross-site)
    const auth = String(req.headers.authorization ?? "");
    const key = `api:${clientOf(req)}`;
    if (lockedMinutes(key)) return json(res, 429, { error: "locked" }, origin);
    const device = deviceFromCookie(auth.startsWith("Bearer ") ? auth.slice(7) : "", ctx.config().devices);
    if (!device) {
      lockout.fail(key, now());
      return json(res, 401, { error: "not_paired", message: "เครื่องนี้ถูกถอนการจับคู่แล้ว จับคู่ใหม่ได้จากหน้า ตั้งค่า บนคอม" }, origin);
    }
    ctx.touchDevice(device.id);
    if (path === "hello" && req.method === "GET") {
      return json(res, 200, { deviceName: device.name, push: !!device.push, pin: !!ctx.config().pin, vapidKey: await ctx.vapidKey() }, origin);
    }
    if (path === "push" && req.method === "POST") {
      const body = await readJson(req);
      if (body.subscription === null) {
        await ctx.setPush(device.id, null);
        return json(res, 200, { ok: true, push: false }, origin);
      }
      const sub = validSubscription(body.subscription);
      if (!sub) return json(res, 400, { error: "bad_subscription" }, origin);
      await ctx.setPush(device.id, sub);
      return json(res, 200, { ok: true, push: true }, origin);
    }
    if (path === "push-test" && req.method === "POST") {
      return json(res, 200, { result: await ctx.testPush(device.id) }, origin);
    }
    return json(res, 404, { error: "not_found" }, origin);
  }

  // ------------------------------------------------------------ /__egs/resume (Pro app → this host)

  async function resume(req: http.IncomingMessage, res: http.ServerResponse, url: URL) {
    if (req.method === "GET") return send(res, 200, resumePage(safeNext(url.searchParams.get("next"))));
    if (req.method !== "POST") return send(res, 405, errorPage("ไม่รองรับ", "ใช้ไม่ได้"));
    const key = `resume:${clientOf(req)}`;
    if (lockedMinutes(key)) return send(res, 429, "", { "content-type": "text/plain" });
    const form = await readForm(req);
    const device = deviceFromCookie(form.get("t") ?? "", ctx.config().devices);
    if (!device) {
      lockout.fail(key, now());
      return send(res, 403, "", { "content-type": "text/plain" });
    }
    lockout.clear(key);
    const [id, token] = [device.id, (form.get("t") ?? "").slice(device.id.length + 1)];
    res.writeHead(204, { "set-cookie": deviceCookie(req, id, token), "cache-control": "no-store" });
    res.end();
  }

  // ------------------------------------------------------------ /__egs/pin

  async function pin(req: http.IncomingMessage, res: http.ServerResponse, url: URL, device: RemoteDevice) {
    const pinHash = ctx.config().pin;
    const next = safeNext(req.method === "GET" ? url.searchParams.get("next") : null);
    if (!pinHash) return redirect(res, next);
    const ip = clientOf(req);
    const keys = [`pin:${device.id}`, `pin-ip:${ip}`];
    const locked = lockedMinutes(...keys);
    if (locked) return send(res, 429, lockedPage(locked));
    if (req.method === "GET") return send(res, 200, pinPage({ next }));
    if (req.method !== "POST") return send(res, 405, errorPage("ไม่รองรับ", "ใช้ไม่ได้"));
    const form = await readForm(req);
    const back = safeNext(form.get("next"));
    if (!verifyPin(form.get("pin") ?? "", pinHash)) {
      const lockedNow = keys.map((k) => lockout.fail(k, now())).some(Boolean);
      if (lockedNow) {
        ctx.notify("ใส่ PIN ผิด 5 ครั้ง", `${device.name} ใส่ PIN ผิดหลายครั้ง ล็อกไว้ 15 นาที ถ้าไม่ใช่คุณ ถอนเครื่องนี้ที่ ตั้งค่า → ใช้จากมือถือ`);
        return send(res, 429, lockedPage(Math.ceil(lockout.lockedFor(keys[0], now()) / 60_000) || 15));
      }
      return send(res, 401, pinPage({ next: back, error: "PIN ไม่ถูกต้อง" }));
    }
    keys.forEach((k) => lockout.clear(k));
    redirect(res, back, { "set-cookie": startSession(req, device) });
  }

  // ------------------------------------------------------------ proxy

  function proxy(req: http.IncomingMessage, res: http.ServerResponse, device: RemoteDevice, extraCookie: string | null) {
    const host = String(req.headers.host ?? "");
    const upstream = `127.0.0.1:${ctx.upstreamPort}`;
    const headers: http.OutgoingHttpHeaders = {};
    for (const [k, v] of Object.entries(req.headers)) {
      if (v === undefined || HOP_BY_HOP.includes(k) || DROP_PREFIX.test(k)) continue;
      headers[k] = v;
    }
    headers.host = upstream;
    const cookie = stripCookies(req.headers.cookie, [DEVICE_COOKIE, SESSION_COOKIE]);
    if (cookie) headers.cookie = cookie;
    else delete headers.cookie;
    const origin = req.headers.origin;
    if (origin) {
      let originHost = "";
      try {
        originHost = new URL(origin).host;
      } catch {
        /* unparsable → refused below */
      }
      if (originHost !== host) return send(res, 403, errorPage("ไม่อนุญาต", "คำขอนี้ไม่ได้มาจากหน้าของแอป"));
      headers.origin = `http://${upstream}`;
    }
    if (typeof req.headers.referer === "string") {
      try {
        const r = new URL(req.headers.referer);
        headers.referer = r.host === host ? `http://${upstream}${r.pathname}${r.search}` : undefined;
      } catch {
        delete headers.referer;
      }
      if (!headers.referer) delete headers.referer;
    }
    // a compressed stream cannot take keep-alive lines; the app is on this machine, compression buys nothing
    headers["accept-encoding"] = "identity";
    headers["x-egs-remote"] = ctx.secret;
    headers["x-egs-device"] = device.id;

    const up = http.request({ host: "127.0.0.1", port: ctx.upstreamPort, method: req.method, path: req.url, headers, agent }, (ur) => {
      const out: http.OutgoingHttpHeaders = {};
      for (const [k, v] of Object.entries(ur.headers)) if (v !== undefined && !HOP_BY_HOP.includes(k)) out[k] = v;
      const loc = ur.headers.location;
      if (typeof loc === "string") {
        for (const o of [`http://${upstream}`, `http://localhost:${ctx.upstreamPort}`]) {
          const rest = loc.slice(o.length);
          if (loc.startsWith(o) && (rest === "" || /^[/?#]/.test(rest))) out.location = rest || "/";
        }
      }
      if (extraCookie) out["set-cookie"] = [...(Array.isArray(out["set-cookie"]) ? out["set-cookie"] : out["set-cookie"] ? [String(out["set-cookie"])] : []), extraCookie];
      const stream = /text\/event-stream/i.test(String(ur.headers["content-type"] ?? "")) && !ur.headers["content-encoding"];
      if (stream) out["x-accel-buffering"] = "no";
      res.writeHead(ur.statusCode ?? 502, out);
      if (!stream) {
        ur.pipe(res);
        return;
      }
      res.flushHeaders();
      let timer: NodeJS.Timeout | null = null;
      const arm = () => {
        if (timer) clearTimeout(timer);
        timer = setTimeout(() => {
          if (!res.writableEnded) res.write(": keepalive\n\n");
          arm();
        }, ctx.keepAliveMs ?? KEEPALIVE_MS);
      };
      arm();
      ur.on("data", (chunk: Buffer) => {
        arm();
        if (!res.write(chunk)) {
          ur.pause();
          res.once("drain", () => ur.resume());
        }
      });
      const end = () => {
        if (timer) clearTimeout(timer);
        timer = null;
        if (!res.writableEnded) res.end();
      };
      ur.on("end", end);
      ur.on("error", end);
      res.on("close", () => {
        if (timer) clearTimeout(timer);
        ur.destroy();
      });
    });
    up.on("error", () => {
      if (!res.headersSent) send(res, 502, errorPage("แอปบนคอมไม่ตอบ", "ลองใหม่อีกครั้ง ถ้ายังไม่ได้ ดูว่าคอมยังเปิด EasyGAS IDE อยู่"));
      else res.destroy();
    });
    // the phone went away: drop the upstream request too (the agent turn itself runs on, see api/agent)
    res.on("close", () => {
      if (!res.writableFinished) up.destroy();
    });
    req.pipe(up);
  }

  // ------------------------------------------------------------ router

  async function handle(req: http.IncomingMessage, res: http.ServerResponse) {
    const url = new URL(req.url ?? "/", "http://gateway");
    if (url.pathname === "/__egs/pair") return pair(req, res, url);
    if (url.pathname === "/__egs/resume") return resume(req, res, url);
    if (url.pathname.startsWith("/__egs/api/")) return api(req, res, url.pathname.slice("/__egs/api/".length));

    const cookies = parseCookies(req.headers.cookie);
    const device = deviceFromCookie(cookies[DEVICE_COOKIE], ctx.config().devices);
    if (!device) {
      if (wantsPage(req)) return send(res, 403, pairPage({}));
      res.writeHead(403, { "content-type": "application/json", "cache-control": "no-store" });
      return res.end(JSON.stringify({ error: "not_paired" }));
    }
    ctx.touchDevice(device.id);
    if (url.pathname === "/__egs/pin") return pin(req, res, url, device);
    if (url.pathname.startsWith("/__egs/")) return send(res, 404, errorPage("ไม่พบหน้า", "ไม่มีหน้านี้"));

    let extraCookie: string | null = null;
    if (!sessionOf(req, device.id)) {
      if (ctx.config().pin) {
        if (wantsPage(req)) return redirect(res, `/__egs/pin?next=${encodeURIComponent(url.pathname + url.search)}`);
        res.writeHead(401, { "content-type": "application/json", "cache-control": "no-store" });
        return res.end(JSON.stringify({ error: "pin_required" }));
      }
      extraCookie = startSession(req, device);
    }
    proxy(req, res, device, extraCookie);
  }

  const server = http.createServer((req, res) => {
    handle(req, res).catch((e) => {
      console.error("[remote] gateway error:", e instanceof Error ? e.message : e);
      if (!res.headersSent) send(res, 500, errorPage("ขัดข้อง", "ลองใหม่อีกครั้ง"));
      else res.destroy();
    });
  });
  // the app keeps no WebSockets in production; refuse upgrades instead of leaving them hanging
  server.on("upgrade", (_req, socket) => socket.destroy());
  server.on("close", () => agent.destroy());
  return server;
}

export const newDeviceId = (): string => randomUUID().replace(/-/g, "").slice(0, 16);
