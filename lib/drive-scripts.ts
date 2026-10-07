import { readFile } from "node:fs/promises";
import { claspAuthPath } from "@/lib/clasp";
import { publishInfoFrom, type ApiDeployment, type PublishInfo } from "@/lib/publish-info";

export type { PublishInfo };

/**
 * The user's Apps Script files and their deployments straight from Google, with the login clasp uses.
 * clasp's own `list-scripts` has no `trashed=false`, so scripts in the Drive trash would show up as if they
 * were in use. Server-only: the token is read here, used for these requests, and never leaves this module.
 * Any failure returns null and the caller falls back to clasp (or shows no status).
 */

export interface DriveScript {
  id: string;
  name: string;
  modifiedTime: string;
}

interface ClaspToken {
  client_id?: string;
  client_secret?: string;
  refresh_token?: string;
  access_token?: string;
  expiry_date?: number;
}

const TIMEOUT_MS = 15_000;
const PAGE_LIMIT = 10; // 10 × 200 scripts is more than anyone keeps
const PARALLEL = 8;

async function accessToken(): Promise<string | null> {
  const rc = JSON.parse(await readFile(claspAuthPath(), "utf8")) as { tokens?: { default?: ClaspToken } };
  const t = rc.tokens?.default;
  if (!t) return null;
  if (t.access_token && (t.expiry_date ?? 0) > Date.now() + 60_000) return t.access_token;
  if (!t.refresh_token || !t.client_id || !t.client_secret) return null;
  // a fresh token for this request only; clasp keeps managing its own file
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: t.refresh_token,
      client_id: t.client_id,
      client_secret: t.client_secret,
    }),
    signal: AbortSignal.timeout(TIMEOUT_MS),
  });
  if (!res.ok) return null;
  const body = (await res.json()) as { access_token?: string };
  return body.access_token ?? null;
}

/** Scripts not in the trash, most recently edited first; null when Drive could not be asked. */
export async function listDriveScripts(): Promise<DriveScript[] | null> {
  try {
    const token = await accessToken();
    if (!token) return null;
    const out: DriveScript[] = [];
    let pageToken: string | undefined;
    for (let page = 0; page < PAGE_LIMIT; page++) {
      const q = new URLSearchParams({
        q: "mimeType='application/vnd.google-apps.script' and trashed=false",
        fields: "nextPageToken, files(id, name, modifiedTime)",
        orderBy: "modifiedTime desc",
        pageSize: "200",
        ...(pageToken ? { pageToken } : {}),
      });
      const res = await fetch(`https://www.googleapis.com/drive/v3/files?${q}`, {
        headers: { Authorization: `Bearer ${token}` },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!res.ok) return null;
      const body = (await res.json()) as { files?: Partial<DriveScript>[]; nextPageToken?: string };
      for (const f of body.files ?? []) {
        if (typeof f.id === "string" && typeof f.name === "string") out.push({ id: f.id, name: f.name, modifiedTime: String(f.modifiedTime ?? "") });
      }
      pageToken = body.nextPageToken;
      if (!pageToken) break;
    }
    return out;
  } catch (e) {
    console.error("[drive-scripts]", e instanceof Error ? e.message : e);
    return null;
  }
}

/**
 * Whether each script was published (Apps Script API, a few at a time). A script that could not be read
 * maps to null: shown without a status rather than as "not published".
 */
export async function scriptsPublishInfo(ids: string[]): Promise<Record<string, PublishInfo | null>> {
  const out: Record<string, PublishInfo | null> = {};
  let token: string | null = null;
  try {
    token = await accessToken();
  } catch {
    token = null;
  }
  if (!token) {
    for (const id of ids) out[id] = null;
    return out;
  }
  const queue = [...ids];
  async function worker(): Promise<void> {
    for (let id = queue.shift(); id; id = queue.shift()) {
      try {
        const res = await fetch(`https://script.googleapis.com/v1/projects/${encodeURIComponent(id)}/deployments?pageSize=50`, {
          headers: { Authorization: `Bearer ${token}` },
          signal: AbortSignal.timeout(TIMEOUT_MS),
        });
        out[id] = res.ok ? publishInfoFrom(((await res.json()) as { deployments?: ApiDeployment[] }).deployments ?? []) : null;
      } catch {
        out[id] = null;
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(PARALLEL, ids.length) }, worker));
  return out;
}
