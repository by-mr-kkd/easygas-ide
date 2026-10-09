/**
 * Remote access at run time (server-only): one instance per server process, kept on globalThis because
 * Next bundles instrumentation.ts, route handlers and server actions separately and each would otherwise
 * get its own copy of this module's state.
 *
 * instrumentation.ts calls resumeRemote() when the server starts; Settings → ใช้จากมือถือ drives the rest
 * through app/settings/remote-actions.ts (desktop only, see lib/remote/request.ts).
 */
import net from "node:net";
import os from "node:os";
import type { Server } from "node:http";
import { hashPin, hashToken, lanAddresses, newPairingCode, newToken, type PairingCode } from "./auth.ts";
import { PRO_APP_ORIGIN, createGateway, newDeviceId } from "./gateway.ts";
import { renameRelay, reportRelayOff, reportRelayUrl } from "./relay.ts";
import { MAX_DEVICES, readRemote, updateRemote, writeRemoteState, type RemoteConfig, type RemoteMode } from "./store.ts";
import { ensureCloudflared, runTunnel, type TunnelHandle } from "./tunnel.ts";
import { generateVapidKeys, sendPush, type PushResult, type PushSubscription } from "./webpush.ts";
import { premiumStatus } from "../premium/status.ts";

export type RemotePhase = "off" | "starting" | "downloading" | "connecting" | "on" | "error";

interface Runtime {
  secret: string;
  config: RemoteConfig | null;
  phase: RemotePhase;
  progress: number;
  error: string | null;
  server: Server | null;
  serverPort: number | null;
  tunnel: TunnelHandle | null;
  tunnelUrl: string | null;
  pairing: PairingCode | null;
  touched: Map<string, number>;
  event: { id: string; title: string; body: string; path?: string } | null;
  /** bumps on every start/stop so a slow start that was overtaken drops its result */
  generation: number;
  /** Pro status, re-read at most every PRO_CHECK_MS (the gateway asks on every Pro API call) */
  pro: { active: boolean; at: number };
  /** Pro: re-reports the tunnel's address every HEARTBEAT_MS while it is up */
  beat: ReturnType<typeof setInterval> | null;
}

// premiumStatus() only reads two local files, so this can be short: a key entered in Settings → Pro counts at once
const PRO_CHECK_MS = 30_000;
// the licence server calls an address offline after 10 minutes without a report (premium-remote)
const HEARTBEAT_MS = 4 * 60_000;

const KEY = "__egsRemote";
const TOUCH_WRITE_MS = 10 * 60_000;

function rt(): Runtime {
  const g = globalThis as unknown as Record<string, Runtime | undefined>;
  if (!g[KEY]) {
    g[KEY] = {
      secret: newToken(24),
      config: null,
      phase: "off",
      progress: 0,
      error: null,
      server: null,
      serverPort: null,
      tunnel: null,
      tunnelUrl: null,
      pairing: null,
      touched: new Map(),
      event: null,
      generation: 0,
      pro: { active: false, at: 0 },
      beat: null,
    };
  }
  return g[KEY]!;
}

/** The value of x-egs-remote the gateway puts on every request it forwards. */
export const remoteSecret = (): string => rt().secret;

const upstreamPort = (): number => Number(process.env.PORT) || 3000;

/** easygaside.tech, plus EASYGAS_SITE_ORIGIN for a local copy of the site (testing). */
const appOrigins = (): string[] => {
  const extra = process.env.EASYGAS_SITE_ORIGIN?.trim();
  return extra && /^https?:\/\/[a-z0-9.:-]+$/i.test(extra) ? [PRO_APP_ORIGIN, extra] : [PRO_APP_ORIGIN];
};

function refreshPro(): void {
  const r = rt();
  if (Date.now() - r.pro.at < PRO_CHECK_MS) return;
  r.pro.at = Date.now();
  premiumStatus()
    .then((s) => {
      const was = rt().pro.active;
      rt().pro.active = s.active;
      // Pro switched on while the tunnel is already up: register the fixed link now, not at the next restart
      const url = rt().tunnelUrl;
      if (s.active && !was && url) registerRelay(url);
    })
    .catch(() => {});
}

/** Keep the fixed link "online": the same address again every HEARTBEAT_MS, while it is still this tunnel's. */
function startBeat(url: string): void {
  stopBeat();
  const timer = setInterval(() => {
    if (rt().tunnelUrl === url) registerRelay(url);
    else stopBeat();
  }, HEARTBEAT_MS);
  timer.unref?.();
  rt().beat = timer;
}

function stopBeat(): void {
  const r = rt();
  if (r.beat) clearInterval(r.beat);
  r.beat = null;
}

/** Best effort: if it never arrives, the server still calls the address offline after its silence limit. */
function relayOff(): void {
  if (!rt().config?.relayId) return;
  reportRelayOff().catch((e) => console.error("[remote] relay off:", e instanceof Error ? e.message : e));
}

function registerRelay(url: string): void {
  reportRelayUrl(url)
    .then(async (link) => {
      if (link && (link.id !== rt().config?.relayId || link.name !== rt().config?.relayName)) {
        await save((c) => ({ ...c, relayId: link.id, relayName: link.name }));
      }
    })
    .catch((e) => console.error("[remote] relay:", e instanceof Error ? e.message : e));
}

/** Pro is active (cached for PRO_CHECK_MS). */
export function proActive(): boolean {
  refreshPro();
  return rt().pro.active;
}

async function vapidKeys() {
  const cfg = await config();
  if (cfg.vapid) return cfg.vapid;
  const keys = generateVapidKeys();
  return (await save((c) => ({ ...c, vapid: c.vapid ?? keys }))).vapid!;
}

async function setPush(deviceId: string, sub: PushSubscription | null): Promise<void> {
  await save((c) => ({ ...c, devices: c.devices.map((d) => (d.id === deviceId ? { ...d, push: sub } : d)) }));
}

/**
 * Pro: a notification on one paired phone (the one that asked the AI). Quietly nothing when the phone has
 * not turned notifications on or this install is not Pro. A subscription the push service says is gone is
 * forgotten.
 */
export async function notifyDevice(deviceId: string, payload: { title: string; body: string; path?: string; tag?: string }): Promise<PushResult | "none"> {
  if (!proActive()) return "none";
  const cfg = await config();
  const device = cfg.devices.find((d) => d.id === deviceId);
  if (!device?.push) return "none";
  const link = cfg.relayName ?? cfg.relayId;
  const result = await sendPush(device.push, { ...payload, link }, await vapidKeys());
  if (result === "gone") await setPush(deviceId, null);
  return result;
}

/**
 * Something worth telling the user wherever they are: a desktop notification (a click opens `path` in the app)
 * and, for Pro, a push to every paired phone that has notifications on.
 */
export async function announce(title: string, body: string, path: string): Promise<void> {
  const cfg = await config();
  pushState({ title, body, path });
  await Promise.all(cfg.devices.filter((d) => d.push).map((d) => notifyDevice(d.id, { title, body, path, tag: `announce-${path}` }).catch(() => "none")));
}

async function config(): Promise<RemoteConfig> {
  const r = rt();
  if (!r.config) r.config = await readRemote();
  return r.config;
}

async function save(fn: (c: RemoteConfig) => RemoteConfig): Promise<RemoteConfig> {
  const next = await updateRemote(fn);
  rt().config = next;
  return next;
}

function publicUrl(): string | null {
  const r = rt();
  if (r.phase !== "on" || !r.config) return null;
  if (r.config.mode === "tunnel") return r.tunnelUrl;
  const ip = lanAddresses(os.networkInterfaces())[0];
  return ip && r.serverPort ? `http://${ip}:${r.serverPort}` : null;
}

function pushState(event?: { title: string; body: string; path?: string }): void {
  const r = rt();
  if (event) r.event = { id: newToken(6), ...event };
  writeRemoteState({ enabled: !!r.config?.enabled, on: r.phase === "on", url: publicUrl(), devices: r.config?.devices.length ?? 0, event: r.event }).catch(() => {});
}

const portFree = (port: number, host: string): Promise<boolean> =>
  new Promise((resolve) => {
    const probe = net.createServer();
    probe.once("error", () => resolve(false));
    probe.listen(port, host, () => probe.close(() => resolve(true)));
  });

async function pickPort(host: string, wanted: number | null): Promise<number> {
  if (wanted && (await portFree(wanted, host))) return wanted;
  return new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", reject);
    probe.listen(0, host, () => {
      const p = (probe.address() as net.AddressInfo).port;
      probe.close(() => resolve(p));
    });
  });
}

function stopNow(): void {
  const r = rt();
  if (r.tunnelUrl) relayOff();
  stopBeat();
  r.generation += 1;
  r.tunnel?.stop();
  r.tunnel = null;
  r.tunnelUrl = null;
  r.server?.close();
  r.server?.closeAllConnections?.();
  r.server = null;
  r.serverPort = null;
  r.pairing = null;
}

async function start(): Promise<void> {
  stopNow();
  const r = rt();
  const gen = r.generation;
  const cfg = await config();
  if (!cfg.enabled) {
    r.phase = "off";
    r.error = null;
    pushState();
    return;
  }
  r.phase = "starting";
  r.error = null;
  r.progress = 0;
  pushState(); // replaces whatever an earlier run (or a crash) left in remote-state.json
  try {
    const host = cfg.mode === "lan" ? "0.0.0.0" : "127.0.0.1";
    const port = await pickPort(host, cfg.port);
    if (port !== cfg.port) await save((c) => ({ ...c, port }));
    const server = createGateway({
      upstreamPort: upstreamPort(),
      secret: r.secret,
      mode: () => rt().config?.mode ?? "tunnel",
      config: () => rt().config ?? cfg,
      pairing: () => rt().pairing,
      endPairing: () => {
        rt().pairing = null;
      },
      addDevice,
      touchDevice,
      pro: proActive,
      appOrigins: appOrigins(),
      vapidKey: async () => (await vapidKeys()).publicKey,
      setPush,
      testPush: (id) => notifyDevice(id, { title: "EasyGAS IDE", body: "แจ้งเตือนใช้ได้แล้ว AI ทำเสร็จหรือถามกลับเมื่อไหร่ จะเด้งแบบนี้", tag: "test" }),
      notify: (title, body) => pushState({ title, body }),
    });
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(port, host, () => resolve());
    });
    if (gen !== r.generation) {
      server.close();
      return;
    }
    r.server = server;
    r.serverPort = port;

    if (cfg.mode === "lan") {
      r.phase = "on";
      pushState();
      return;
    }
    r.phase = "downloading";
    const exe = await ensureCloudflared((f) => {
      rt().progress = f;
    });
    if (gen !== r.generation) return;
    r.phase = "connecting";
    r.tunnel = runTunnel(
      exe,
      port,
      (url) => {
        if (gen !== rt().generation) return;
        rt().tunnelUrl = url;
        rt().phase = "on";
        rt().error = null;
        pushState();
        registerRelay(url);
        startBeat(url);
      },
      (why) => {
        if (gen !== rt().generation) return;
        console.error("[remote] tunnel down:", why);
        stopBeat();
        relayOff();
        rt().tunnelUrl = null;
        rt().phase = "connecting";
        pushState();
      },
    );
  } catch (e) {
    if (gen !== r.generation) return;
    console.error("[remote] start failed:", e);
    stopNow();
    r.phase = "error";
    r.error = e instanceof Error ? e.message : String(e);
    pushState();
  }
}

async function addDevice(name: string): Promise<{ id: string; token: string }> {
  const id = newDeviceId();
  const token = newToken(32);
  const at = new Date().toISOString();
  await save((c) => ({
    ...c,
    // the oldest pairing makes room when the list is full
    devices: [...c.devices, { id, tokenHash: hashToken(token), name, pairedAt: at, lastSeenAt: at, push: null }].slice(-MAX_DEVICES),
  }));
  pushState();
  return { id, token };
}

function touchDevice(id: string): void {
  const r = rt();
  const last = r.touched.get(id) ?? 0;
  if (Date.now() - last < TOUCH_WRITE_MS) return;
  r.touched.set(id, Date.now());
  const at = new Date().toISOString();
  save((c) => ({ ...c, devices: c.devices.map((d) => (d.id === id ? { ...d, lastSeenAt: at } : d)) })).catch(() => {});
}

// ------------------------------------------------------------------ public API

/** Pro: the owner's own name for the fixed link (unique; errors carry a Thai message). */
export async function setRelayName(name: string): Promise<void> {
  const link = await renameRelay(name);
  await save((c) => ({ ...c, relayId: link.id, relayName: link.name }));
}

/** On server start: bring the gateway back if it was on when the app last ran. */
export async function resumeRemote(): Promise<void> {
  refreshPro();
  if ((await config()).enabled) await start();
  else pushState();
}

export async function setRemoteEnabled(on: boolean, mode?: RemoteMode): Promise<void> {
  await save((c) => ({ ...c, enabled: on, mode: mode ?? c.mode }));
  if (on) {
    // the tunnel can take a while (first download is ~55 MB): answer now, the page polls the status
    void start();
    await new Promise((r) => setTimeout(r, 150));
  } else {
    stopNow();
    rt().phase = "off";
    rt().error = null;
    pushState();
  }
}

export function newPairing(): PairingCode {
  const p = newPairingCode(Date.now());
  rt().pairing = p;
  return p;
}

export function cancelPairing(): void {
  rt().pairing = null;
}

export async function setRemotePin(pin: string | null): Promise<void> {
  await save((c) => ({ ...c, pin: pin ? hashPin(pin) : null }));
}

export async function removeRemoteDevice(id: string): Promise<void> {
  await save((c) => ({ ...c, devices: c.devices.filter((d) => d.id !== id) }));
  pushState();
}

export interface RemoteSnapshot {
  enabled: boolean;
  mode: RemoteMode;
  phase: RemotePhase;
  progress: number;
  error: string | null;
  /** where a phone opens the app now (tunnel or Wi-Fi address); null until it is up */
  url: string | null;
  pairing: { code: string; expiresAt: number; link: string | null } | null;
  pinSet: boolean;
  devices: { id: string; name: string; pairedAt: string; lastSeenAt: string | null; push: boolean }[];
  relayId: string | null;
  relayName: string | null;
}

export async function remoteSnapshot(): Promise<RemoteSnapshot> {
  refreshPro(); // Settings asks often: a key entered in Settings → Pro registers the fixed link within one poll
  const cfg = await config();
  const r = rt();
  const url = publicUrl();
  const pairing = r.pairing && r.pairing.expiresAt > Date.now() ? r.pairing : null;
  return {
    enabled: cfg.enabled,
    mode: cfg.mode,
    phase: r.phase,
    progress: r.progress,
    error: r.error,
    url,
    pairing: pairing ? { code: pairing.code, expiresAt: pairing.expiresAt, link: url ? `${url}/__egs/pair?c=${pairing.code}` : null } : null,
    pinSet: !!cfg.pin,
    devices: cfg.devices.map(({ id, name, pairedAt, lastSeenAt, push }) => ({ id, name, pairedAt, lastSeenAt, push: !!push })),
    relayId: cfg.relayId,
    relayName: cfg.relayName,
  };
}
