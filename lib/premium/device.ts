/**
 * This machine's identity for Pro activation (server-only). The id sent to the licence server is
 * sha256("easygas-device|" + Windows MachineGuid), never the GUID itself. When the GUID cannot be read
 * (not Windows, locked-down registry) a random seed kept in premium.json stands in.
 * Reading never writes: the seed is only created by ensureDeviceIdentity(), which runs in a user action.
 */
import { createHash, randomBytes } from "node:crypto";
import { execFile } from "node:child_process";
import { hostname, platform } from "node:os";
import { childEnv } from "../child-env.ts";
import { readPremium, updatePremium } from "./store.ts";

export interface DeviceIdentity {
  hash: string;
  /** shown to the user and the owner in device lists, e.g. "OFFICE-PC (Windows)" */
  label: string;
}

let guidPromise: Promise<string | null> | null = null;

function readMachineGuid(): Promise<string | null> {
  if (platform() !== "win32") return Promise.resolve(null);
  return new Promise((resolve) => {
    execFile(
      "reg.exe",
      ["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"],
      { env: childEnv(), windowsHide: true, timeout: 5000 },
      (err, stdout) => {
        if (err) return resolve(null);
        const m = /MachineGuid\s+REG_SZ\s+([0-9a-fA-F-]{36})/.exec(String(stdout));
        resolve(m ? m[1].toLowerCase() : null);
      },
    );
  });
}

function machineGuid(): Promise<string | null> {
  guidPromise ??= readMachineGuid();
  return guidPromise;
}

const hashOf = (source: string): string => createHash("sha256").update(`easygas-device|${source}`).digest("hex");

function label(): string {
  const os = platform() === "win32" ? "Windows" : platform() === "darwin" ? "Mac" : "Linux";
  const name = hostname().replace(/[\u0000-\u001f]/g, "").slice(0, 60) || "เครื่องนี้";
  return `${name} (${os})`;
}

/** The identity if one exists already; null means activation has never run on this machine. */
export async function deviceIdentity(): Promise<DeviceIdentity | null> {
  const guid = await machineGuid();
  if (guid) return { hash: hashOf(`guid:${guid}`), label: label() };
  const { deviceSeed } = await readPremium();
  return deviceSeed ? { hash: hashOf(`seed:${deviceSeed}`), label: label() } : null;
}

/** Same as deviceIdentity(), creating the fallback seed when needed. Call only from a user action. */
export async function ensureDeviceIdentity(): Promise<DeviceIdentity> {
  const existing = await deviceIdentity();
  if (existing) return existing;
  const seed = randomBytes(24).toString("base64url");
  await updatePremium({ deviceSeed: seed });
  return { hash: hashOf(`seed:${seed}`), label: label() };
}
