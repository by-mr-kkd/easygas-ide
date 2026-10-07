import { join } from "node:path";
import { rm } from "node:fs/promises";
import { readJson, writeJsonAtomic } from "../local/json-store.ts";
import { dataRoot } from "../local/paths.ts";
import { GITHUB_ACCESS_TOKEN_URL, GITHUB_CLIENT_ID, GITHUB_DEVICE_CODE_URL, GITHUB_SCOPE } from "./config.ts";
import { createGitHubClient, PagesError } from "./github-api.ts";

/**
 * GitHub sign-in through the OAuth device flow (server-only). The token lives in its own file under the
 * data root, like the API keys in settings.json: it is never returned to the client, never logged and
 * never handed to child processes (childEnv strips nothing of it because it never enters process.env).
 */

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export interface GitHubStatus {
  /** false when this build has no GitHub OAuth client id yet */
  available: boolean;
  connected: boolean;
  login?: string;
}

interface StoredGitHub {
  token: string;
  login: string;
  connected_at: string;
}

const githubPath = (): string => join(dataRoot(), "github.json");

async function readStored(): Promise<StoredGitHub | null> {
  const data = await readJson<Partial<StoredGitHub> | null>(githubPath(), null);
  return data && typeof data.token === "string" && data.token.length > 0 ? (data as StoredGitHub) : null;
}

/** Whether the app is signed in to the user's GitHub account (for publishing to GitHub Pages). */
export async function githubStatus(): Promise<GitHubStatus> {
  if (!GITHUB_CLIENT_ID) return { available: false, connected: false };
  const stored = await readStored();
  return stored ? { available: true, connected: true, login: stored.login } : { available: true, connected: false };
}

/** The stored token for server-side API calls only. Null when not connected. */
export async function githubToken(): Promise<{ token: string; login: string } | null> {
  const stored = await readStored();
  return stored ? { token: stored.token, login: stored.login } : null;
}

export async function saveGitHubToken(token: string, login: string): Promise<void> {
  const record: StoredGitHub = { token, login, connected_at: new Date().toISOString() };
  await writeJsonAtomic(githubPath(), record);
}

/** Forget the token. The grant itself stays listed in the user's GitHub settings until revoked there. */
export async function disconnectGitHub(): Promise<void> {
  await rm(githubPath(), { force: true });
}

// ---------------------------------------------------------------------------------------------------
// Device flow (https://docs.github.com/apps/oauth-apps/building-oauth-apps/authorizing-oauth-apps#device-flow)

export interface DeviceCode {
  deviceCode: string;
  userCode: string;
  verificationUri: string;
  /** seconds between polls */
  interval: number;
  /** epoch ms after which the code is dead */
  expiresAt: number;
}

export type DevicePoll =
  | { status: "pending"; interval: number }
  | { status: "ok"; token: string }
  | { status: "expired" }
  | { status: "denied" }
  | { status: "error"; message: string };

const MIN_INTERVAL = 5;
const SLOW_DOWN_STEP = 5;

const form = (fields: Record<string, string>): RequestInit => ({
  method: "POST",
  headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
  body: new URLSearchParams(fields).toString(),
});

/** Step 1: ask GitHub for a code the user types in at verification_uri. */
export async function requestDeviceCode(
  fetchImpl: FetchLike = fetch,
  clientId: string = GITHUB_CLIENT_ID,
  now: () => number = Date.now,
): Promise<DeviceCode> {
  if (!clientId) throw new PagesError("GITHUB_UNAVAILABLE", "ฟีเจอร์นี้ยังไม่เปิดใช้ในเวอร์ชันนี้");
  const r = await fetchImpl(GITHUB_DEVICE_CODE_URL, form({ client_id: clientId, scope: GITHUB_SCOPE }));
  if (!r.ok) throw new PagesError("NETWORK", "ติดต่อ GitHub ไม่สำเร็จ ลองใหม่อีกครั้ง");
  const d = (await r.json()) as {
    device_code?: string;
    user_code?: string;
    verification_uri?: string;
    interval?: number;
    expires_in?: number;
  };
  if (!d.device_code || !d.user_code || !d.verification_uri) throw new PagesError("NETWORK", "GitHub ตอบกลับไม่ครบ ลองใหม่อีกครั้ง");
  return {
    deviceCode: d.device_code,
    userCode: d.user_code,
    verificationUri: d.verification_uri,
    interval: Math.max(MIN_INTERVAL, Number(d.interval) || MIN_INTERVAL),
    expiresAt: now() + (Number(d.expires_in) || 900) * 1000,
  };
}

/**
 * Step 2: one poll. The caller (a server action driven by the client) waits `interval` seconds between
 * calls; `slow_down` raises that interval by 5 s as GitHub asks.
 */
export async function pollDeviceToken(
  code: Pick<DeviceCode, "deviceCode" | "interval" | "expiresAt">,
  fetchImpl: FetchLike = fetch,
  clientId: string = GITHUB_CLIENT_ID,
  now: () => number = Date.now,
): Promise<DevicePoll> {
  if (now() >= code.expiresAt) return { status: "expired" };
  let r: Response;
  try {
    r = await fetchImpl(
      GITHUB_ACCESS_TOKEN_URL,
      form({ client_id: clientId, device_code: code.deviceCode, grant_type: "urn:ietf:params:oauth:grant-type:device_code" }),
    );
  } catch {
    return { status: "error", message: "ติดต่อ GitHub ไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
  const d = (await r.json().catch(() => ({}))) as { access_token?: string; error?: string; interval?: number };
  if (d.access_token) return { status: "ok", token: d.access_token };
  switch (d.error) {
    case "authorization_pending":
      return { status: "pending", interval: code.interval };
    case "slow_down":
      return { status: "pending", interval: Math.max(code.interval, Number(d.interval) || 0, code.interval + SLOW_DOWN_STEP) };
    case "expired_token":
      return { status: "expired" };
    case "access_denied":
      return { status: "denied" };
    default:
      return { status: "error", message: "GitHub ตอบกลับผิดพลาด ลองเชื่อมใหม่อีกครั้ง" };
  }
}

/** Step 3 (after "ok"): look the account up and keep the token. Returns the login. */
export async function completeDeviceFlow(token: string, fetchImpl: FetchLike = fetch): Promise<string> {
  const user = await createGitHubClient(token, fetchImpl).currentUser();
  await saveGitHubToken(token, user.login);
  return user.login;
}
