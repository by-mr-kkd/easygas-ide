/**
 * Remote access settings on disk (server-only): <dataRoot>/remote.json. Device tokens and the PIN are
 * stored as hashes only (lib/remote/auth.ts). <dataRoot>/remote-state.json is the other direction: what
 * the running gateway reports for the desktop shell (electron/main.js shows a tray icon, keeps the PC
 * awake and pops notifications from it). Neither file holds anything a phone could use to get in.
 */
import { join } from "node:path";
import { dataRoot } from "../local/paths.ts";
import { readJson, writeJsonAtomic } from "../local/json-store.ts";
import type { PinHash } from "./auth.ts";
import { validSubscription, type PushSubscription, type VapidKeys } from "./webpush.ts";

export type RemoteMode = "tunnel" | "lan";

export interface RemoteDevice {
  id: string;
  tokenHash: string;
  name: string;
  pairedAt: string;
  lastSeenAt: string | null;
  /** Pro: where to send "AI finished / asks" notifications for this phone (set from easygaside.tech/app) */
  push: PushSubscription | null;
}

export interface RemoteConfig {
  v: 1;
  enabled: boolean;
  mode: RemoteMode;
  /** the gateway's port; kept so a phone's LAN link (and Wi-Fi bookmark) stays the same */
  port: number | null;
  pin: PinHash | null;
  devices: RemoteDevice[];
  /** Pro: this machine's fixed link id at easygaside.tech/r/<id> (premium-remote) */
  relayId: string | null;
  /** Pro: the owner's own name for that link (easygaside.tech/r/<name>), unique across everyone */
  relayName: string | null;
  /** Pro: this machine's own VAPID key pair for Web Push (made on first use, never leaves the machine but the public half) */
  vapid: VapidKeys | null;
}

export const MAX_DEVICES = 10;

const EMPTY: RemoteConfig = { v: 1, enabled: false, mode: "tunnel", port: null, pin: null, devices: [], relayId: null, relayName: null, vapid: null };

export const remotePath = (): string => join(dataRoot(), "remote.json");
export const remoteStatePath = (): string => join(dataRoot(), "remote-state.json");

function sanitize(raw: Partial<RemoteConfig> | null): RemoteConfig {
  const r = raw ?? {};
  const port = Number(r.port);
  return {
    v: 1,
    enabled: r.enabled === true,
    mode: r.mode === "lan" ? "lan" : "tunnel",
    port: Number.isInteger(port) && port > 1023 && port < 65536 ? port : null,
    pin: r.pin && typeof r.pin.salt === "string" && typeof r.pin.hash === "string" ? { salt: r.pin.salt, hash: r.pin.hash } : null,
    devices: Array.isArray(r.devices)
      ? r.devices
          .filter((d) => d && typeof d.id === "string" && typeof d.tokenHash === "string")
          .slice(0, MAX_DEVICES)
          .map((d) => ({
            id: d.id,
            tokenHash: d.tokenHash,
            name: String(d.name ?? "อุปกรณ์"),
            pairedAt: String(d.pairedAt ?? ""),
            lastSeenAt: d.lastSeenAt ?? null,
            push: validSubscription(d.push),
          }))
      : [],
    relayId: typeof r.relayId === "string" && /^[A-Za-z0-9_-]{6,40}$/.test(r.relayId) ? r.relayId : null,
    relayName: typeof r.relayName === "string" && /^[a-z0-9-]{3,24}$/.test(r.relayName) ? r.relayName : null,
    vapid: r.vapid && typeof r.vapid.publicKey === "string" && typeof r.vapid.privateKey === "string" ? { publicKey: r.vapid.publicKey, privateKey: r.vapid.privateKey } : null,
  };
}

export async function readRemote(): Promise<RemoteConfig> {
  return sanitize(await readJson<Partial<RemoteConfig> | null>(remotePath(), EMPTY));
}

let queue: Promise<unknown> = Promise.resolve();

/** Read-modify-write, one at a time (two phones pairing at once must not drop a device). */
export function updateRemote(fn: (cur: RemoteConfig) => RemoteConfig): Promise<RemoteConfig> {
  const run = queue.then(async () => {
    const next = sanitize(fn(await readRemote()));
    await writeJsonAtomic(remotePath(), next);
    return next;
  });
  queue = run.catch(() => {});
  return run;
}

/** What the desktop shell reads (electron/main.js). `event` changes id each time something worth a notification happens. */
export interface RemoteState {
  /** the switch is on (the tunnel may be reconnecting); the shell keeps the app alive in the tray */
  enabled: boolean;
  /** the gateway is up and reachable */
  on: boolean;
  url: string | null;
  devices: number;
  /** `path`: the app page a click on the notification opens (default: Settings → ใช้จากมือถือ) */
  event: { id: string; title: string; body: string; path?: string } | null;
}

export const writeRemoteState = (state: RemoteState): Promise<void> => writeJsonAtomic(remoteStatePath(), state);
