/**
 * `premium.json` under dataRoot(): the activated licence key and a half-finished order, so a purchase can be
 * resumed after the dialog or the app is closed. Server-only. The key and the order secret never leave this
 * module except to the licence server; the client gets status objects (see status.ts / actions).
 */
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "../local/paths.ts";

export type OrderMode = "slip" | "link";

export interface PendingOrder {
  orderId: string;
  secret: string;
  email: string;
  amount: number;
  mode: OrderMode;
  payUrl: string | null;
  promptpayId: string | null;
  /** ISO timestamp from the server */
  expiresAt: string;
}

export interface PremiumFile {
  v: 1;
  /** the activated licence key (`EGP1.…`) */
  key: string | null;
  pendingOrder: PendingOrder | null;
  /** this machine's activation token (`EGA1.…`) from premium-activate; Pro needs it as well as the key */
  activation: string | null;
  /** random stand-in for the machine id when the Windows MachineGuid cannot be read (see device.ts) */
  deviceSeed: string | null;
  /** the paid camera instructions, fetched from premium-content for this licence + machine (not in the source) */
  cameraRules: string | null;
  cameraRulesVersion: number | null;
  /** the "publish outside Apps Script" runtime (shim + dispatcher) as the server's JSON body, same arrangement */
  pagesRuntime: string | null;
  pagesRuntimeVersion: number | null;
}

const EMPTY: PremiumFile = {
  v: 1,
  key: null,
  pendingOrder: null,
  activation: null,
  deviceSeed: null,
  cameraRules: null,
  cameraRulesVersion: null,
  pagesRuntime: null,
  pagesRuntimeVersion: null,
};

export const premiumPath = (): string => join(dataRoot(), "premium.json");

const str = (v: unknown): v is string => typeof v === "string";

function parseOrder(x: unknown): PendingOrder | null {
  if (!x || typeof x !== "object") return null;
  const o = x as Record<string, unknown>;
  if (!str(o.orderId) || !str(o.secret) || !str(o.email) || typeof o.amount !== "number" || !str(o.expiresAt)) return null;
  if (o.mode !== "slip" && o.mode !== "link") return null;
  return {
    orderId: o.orderId,
    secret: o.secret,
    email: o.email,
    amount: o.amount,
    mode: o.mode,
    payUrl: str(o.payUrl) ? o.payUrl : null,
    promptpayId: str(o.promptpayId) ? o.promptpayId : null,
    expiresAt: o.expiresAt,
  };
}

/** Read the file; a missing or corrupt file reads as empty (the user can re-activate from their key). */
export async function readPremium(): Promise<PremiumFile> {
  let text: string;
  try {
    text = await readFile(premiumPath(), "utf8");
  } catch {
    return EMPTY;
  }
  try {
    const raw = JSON.parse(text) as Record<string, unknown>;
    return {
      v: 1,
      key: str(raw.key) && raw.key ? raw.key : null,
      pendingOrder: parseOrder(raw.pendingOrder),
      activation: str(raw.activation) && raw.activation ? raw.activation : null,
      deviceSeed: str(raw.deviceSeed) && raw.deviceSeed ? raw.deviceSeed : null,
      cameraRules: str(raw.cameraRules) && raw.cameraRules ? raw.cameraRules : null,
      cameraRulesVersion: typeof raw.cameraRulesVersion === "number" && Number.isInteger(raw.cameraRulesVersion) ? raw.cameraRulesVersion : null,
      pagesRuntime: str(raw.pagesRuntime) && raw.pagesRuntime ? raw.pagesRuntime : null,
      pagesRuntimeVersion: typeof raw.pagesRuntimeVersion === "number" && Number.isInteger(raw.pagesRuntimeVersion) ? raw.pagesRuntimeVersion : null,
    };
  } catch {
    return EMPTY;
  }
}

/** Atomic write (tmp + rename), same shape as the other stores in lib/. */
export async function writePremium(next: PremiumFile): Promise<void> {
  const path = premiumPath();
  await mkdir(dataRoot(), { recursive: true });
  const tmp = `${path}.${process.pid}.tmp`;
  await writeFile(tmp, JSON.stringify(next, null, 2), "utf8");
  await rename(tmp, path);
}

export async function updatePremium(patch: Partial<Omit<PremiumFile, "v">>): Promise<PremiumFile> {
  const current = await readPremium();
  const next: PremiumFile = { ...current, ...patch, v: 1 };
  await writePremium(next);
  return next;
}
