import { readdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { claspAuthPath, getClaspAccount } from "@/lib/clasp";
import { dataRoot, projectsRoot } from "@/lib/local/paths";
import { ShareRefusal } from "./payload";
import { ShareApiError, siteOrigin } from "./remote-core";

/**
 * Who shares: the Google account the app is signed in with (EasyGAS-Site lib/authors.ts). To prove it, the app
 * sends the site a Google ID token — Google's signed statement of the account's email, which opens nothing
 * (no Drive, no scripts) — fetched fresh with clasp's login for this one request, never stored or logged; the
 * access token never leaves this machine. The site answers with an author key, kept in
 * `<dataRoot>/share-author.json` (server-side only), and the name shares show: a masked email
 * (easy******@gmail.com) until the user picks one in Settings (once every 30 days, spread to every share).
 */

export interface ShareAuthor {
  display: string;
  masked: string;
  custom: string | null;
  nextRenameAt: string | null;
}

interface Stored {
  key: string;
  author: ShareAuthor;
  /** the Google account the key was made for: another account signed in = a new author */
  account?: string | null;
}

const FILE = () => join(dataRoot(), "share-author.json");
const TIMEOUT_MS = 15_000;

async function readStored(): Promise<Stored | null> {
  try {
    const j = JSON.parse(await readFile(FILE(), "utf8")) as Stored;
    return typeof j?.key === "string" && j.author ? j : null;
  } catch {
    return null;
  }
}

async function store(s: Stored | null): Promise<void> {
  if (!s) return rm(FILE(), { force: true });
  await writeFile(FILE(), JSON.stringify(s, null, 2), "utf8");
}

function parseAuthor(x: unknown): ShareAuthor {
  const a = (x ?? {}) as Record<string, unknown>;
  if (typeof a.display !== "string" || typeof a.masked !== "string") throw new ShareApiError("เว็บไซต์ตอบกลับไม่ครบ ลองใหม่อีกครั้ง");
  return {
    display: a.display,
    masked: a.masked,
    custom: typeof a.custom === "string" ? a.custom : null,
    nextRenameAt: typeof a.nextRenameAt === "string" ? a.nextRenameAt : null,
  };
}

/** A fresh Google ID token of the signed-in account (clasp's login), or null when not signed in. */
async function googleIdToken(): Promise<string | null> {
  let t: { client_id?: string; client_secret?: string; refresh_token?: string } | undefined;
  try {
    t = (JSON.parse(await readFile(claspAuthPath(), "utf8")) as { tokens?: { default?: typeof t } }).tokens?.default;
  } catch {
    return null;
  }
  if (!t?.refresh_token || !t.client_id || !t.client_secret) return null;
  try {
    const res = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ grant_type: "refresh_token", refresh_token: t.refresh_token, client_id: t.client_id, client_secret: t.client_secret }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!res.ok) return null;
    return ((await res.json()) as { id_token?: string }).id_token ?? null;
  } catch {
    return null;
  }
}

async function site(path: string, init: { method: string; key?: string; body?: unknown }): Promise<{ status: number; body: Record<string, unknown> }> {
  let res: Response;
  try {
    res = await fetch(`${siteOrigin()}${path}`, {
      method: init.method,
      headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...(init.key ? { "x-egs-author": init.key } : {}) },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new ShareApiError("ติดต่อ easygaside.tech ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่", "unreachable");
  }
  return { status: res.status, body: ((await res.json().catch(() => ({}))) ?? {}) as Record<string, unknown> };
}

const failMessage = (b: Record<string, unknown>) => (typeof b.message === "string" ? b.message : "เว็บไซต์ตอบกลับผิดพลาด ลองใหม่อีกครั้ง");

/** Shares made before authors existed (their owner tokens are in project.json, deleted projects too). */
async function claimOldShares(key: string): Promise<void> {
  const items: { slug: string; token: string }[] = [];
  for (const id of await readdir(projectsRoot()).catch(() => [] as string[])) {
    try {
      const p = JSON.parse(await readFile(join(projectsRoot(), id, "project.json"), "utf8")) as { share?: { slug?: string; token?: string } };
      if (p.share?.slug && p.share.token) items.push({ slug: p.share.slug, token: p.share.token });
    } catch {
      /* not a project */
    }
  }
  if (items.length) await site("/api/author/claim", { method: "POST", key, body: { items } }).catch(() => null);
}

/** The author as last known on this machine (no network). */
export async function storedAuthor(): Promise<ShareAuthor | null> {
  const s = await readStored();
  if (!s) return null;
  const account = (await getClaspAccount()).email?.toLowerCase() ?? null;
  return !account || !s.account || s.account === account ? s.author : null;
}

/**
 * The stored author key, no network and no sign-in: for reads that only get richer with it (my clone, my
 * review, my issues). Null when none is stored or another Google account is signed in now.
 */
export async function storedAuthorKey(): Promise<string | null> {
  const s = await readStored();
  if (!s) return null;
  const account = (await getClaspAccount()).email?.toLowerCase() ?? null;
  return !account || !s.account || s.account === account ? s.key : null;
}

/**
 * The author key for a share: the stored one (its name refreshed), or a new one from the signed-in Google
 * account. Refuses when the app is not signed in to Google.
 */
export async function ensureAuthor(): Promise<Stored> {
  const account = (await getClaspAccount()).email?.toLowerCase() ?? null;
  const kept = await readStored();
  const s = kept && (!account || !kept.account || kept.account === account) ? kept : null;
  if (s) {
    const r = await site("/api/author", { method: "GET", key: s.key });
    if (r.status === 200) {
      const next = { key: s.key, author: parseAuthor(r.body.author), account: s.account ?? account };
      await store(next);
      return next;
    }
    if (r.status !== 401) throw new ShareApiError(failMessage(r.body));
    // the key is gone on the site: sign in again below
  }
  const idToken = await googleIdToken();
  if (!idToken) throw new ShareRefusal("เชื่อมบัญชี Google ในแอปก่อน ชื่อผู้แชร์ผูกกับบัญชีนี้ (ตั้งค่า → บัญชี Google)");
  const r = await site("/api/author", { method: "POST", body: { idToken } });
  if (r.status !== 200 || typeof r.body.key !== "string") throw new ShareApiError(failMessage(r.body), r.status === 400 ? "refused" : "server");
  const next = { key: r.body.key, author: parseAuthor(r.body.author), account };
  await store(next);
  await claimOldShares(next.key);
  return next;
}

/** Pick the name shares show (null = the masked email); the site allows it once every 30 days. */
export async function renameAuthor(name: string | null): Promise<ShareAuthor> {
  const { key, account } = await ensureAuthor();
  const r = await site("/api/author", { method: "PATCH", key, body: { displayName: name } });
  if (r.status !== 200) throw new ShareApiError(failMessage(r.body), r.status === 429 || r.status === 409 || r.status === 400 ? "refused" : "server");
  const author = parseAuthor(r.body.author);
  await store({ key, author, account });
  return author;
}

/** Signing out of Google here = a different person may sign in next: forget the author key. */
export async function forgetAuthor(): Promise<void> {
  await store(null);
}
