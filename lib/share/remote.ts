/**
 * The website's share API, server-only (the app's own server calls it; a phone goes through the app, never
 * to the website directly). easygaside.tech/api/share — see EasyGAS-Site/app/api/share.
 *
 * Share system 1.2 (versions, support, reviews, issues, follows, proposals) is newer than some websites the
 * app may meet: the readers below turn a 404 into "nothing yet" so the new panels stay quiet instead of failing.
 */
import type { ShareLicense } from "./license";
import { deviceIdentity } from "@/lib/premium/device";
import { readPremium } from "@/lib/premium/store";
import { storedAuthorKey } from "./author";
import { parseSharePublic, ShareRefusal, type SharePublic } from "./payload";
import { call, ShareApiError, siteOrigin } from "./remote-core";
import type { ShareFile } from "./scan";
import { parseShareSummaries, type ShareSummary } from "./summary";
import {
  parseFollowing,
  parseIssues,
  parseProposals,
  parseReviews,
  parseUpdates,
  parseVersionFiles,
  type IssueStatus,
  type MyIssue,
  type ShareIssue,
  type ShareProposal,
  type ShareReview,
  type ShareUpdate,
  type ShareVersionFiles,
  type SupportMode,
} from "./v2";

export { ShareApiError, siteOrigin };

const SLUG = /^[a-z0-9]{6,16}$/;
function slugOrThrow(slug: string): string {
  if (!SLUG.test(slug)) throw new ShareApiError("ลิงก์แชร์ไม่ถูกต้อง", "refused");
  return slug;
}

/** This machine's Pro key + registration, as the website checks it (none on Free). */
async function proHeaders(): Promise<Record<string, string>> {
  const [{ key }, device] = await Promise.all([readPremium(), deviceIdentity()]);
  return key && device ? { "x-egs-key": key, "x-egs-device": device.hash } : {};
}

/** The stored author key, when there is one (reads get "me"; nothing is created here). */
async function authorHeader(key?: string | null): Promise<Record<string, string>> {
  const k = key === undefined ? await storedAuthorKey().catch(() => null) : key;
  return k ? { "x-egs-author": k } : {};
}

/** A share by its slug: title, files, scopes, warnings, forks (+ 1.2's extras). A Pro-only share answers "pro" without Pro. */
export async function fetchShare(slug: string): Promise<SharePublic> {
  try {
    return parseSharePublic(await call(`/api/share/${slugOrThrow(slug)}`, { headers: { ...(await proHeaders()), ...(await authorHeader()) } }));
  } catch (e) {
    if (e instanceof ShareRefusal) throw new ShareApiError(e.message, "server");
    throw e;
  }
}

/** One kept version's files; null when the website does not keep it (or is older than versions). */
export async function fetchShareVersion(slug: string, version: number): Promise<ShareVersionFiles | null> {
  if (!Number.isInteger(version) || version < 1) return null;
  try {
    return parseVersionFiles(await call(`/api/share/${slugOrThrow(slug)}/versions/${version}`, { headers: await proHeaders() }));
  } catch (e) {
    if (e instanceof ShareApiError && e.code === "not_found") return null;
    throw e;
  }
}

export type ShareOrder = "new" | "clones";
export type ShareList = { shares: ShareSummary[]; /** served from the last good answer because the website did not answer now */ stale: boolean; at: number };

/** the list changes slowly; the home screen and "ระบบที่คนแชร์" share one answer for a while */
const LIST_TTL_MS = 2 * 60_000;
const listCache = new Map<ShareOrder, ShareList>();

/**
 * The website's public list of shares. Cached in this process for a couple of minutes; when the website
 * cannot be reached, the last good list is returned marked stale (none yet: the error).
 */
export async function listSharesRemote(order: ShareOrder = "new", limit = 60): Promise<ShareList> {
  const hit = listCache.get(order);
  if (hit && Date.now() - hit.at < LIST_TTL_MS && !hit.stale) return hit;
  try {
    const raw = await call(`/api/share?order=${order}&limit=${Math.min(100, Math.max(1, limit))}`, { timeoutMs: 10_000 });
    const fresh: ShareList = { shares: parseShareSummaries(raw), stale: false, at: Date.now() };
    listCache.set(order, fresh);
    return fresh;
  } catch (e) {
    if (hit) {
      const stale = { ...hit, stale: true, at: Date.now() };
      listCache.set(order, stale);
      return stale;
    }
    if (e instanceof ShareRefusal) throw new ShareApiError(e.message, "server");
    throw e;
  }
}

export type Created = { slug: string; url: string; token: string; warnings: unknown[] };
export type SupportInput = { mode: SupportMode; note: string };

/** Publish: a Pro key + this machine's registration gets the PRO badge; without, a guest share. */
export async function createShareRemote(
  input: {
    title: string;
    description: string;
    name: string;
    files: ShareFile[];
    parent: string | null;
    hosting: "gas" | "github";
    license: ShareLicense;
    support?: SupportInput;
    parentVersion?: number | null;
    changes?: string;
  },
  authorKey: string,
): Promise<Created> {
  const [{ key }, device] = await Promise.all([readPremium(), deviceIdentity()]);
  const pro = key && device ? { key, deviceHash: device.hash } : {};
  const body = {
    ...input,
    parent: input.parent ?? undefined,
    parentVersion: input.parent && input.parentVersion ? input.parentVersion : undefined,
    changes: input.parent && input.changes ? input.changes : undefined,
    ...pro,
  };
  // the author key (lib/share/author.ts) names the sharer; `name` is only for an older website
  const r = (await call("/api/share", { method: "POST", body, headers: { "x-egs-author": authorKey }, timeoutMs: 30_000 })) as Record<string, unknown>;
  if (typeof r.slug !== "string" || typeof r.token !== "string" || typeof r.url !== "string") throw new ShareApiError("เว็บไซต์ตอบกลับไม่ครบ ลองใหม่อีกครั้ง");
  return { slug: r.slug, url: r.url, token: r.token, warnings: Array.isArray(r.warnings) ? r.warnings : [] };
}

export async function postVersionRemote(
  slug: string,
  token: string,
  input: { title?: string; description?: string; files: ShareFile[]; hosting: "gas" | "github"; license?: ShareLicense; notes?: string; fixes?: number[] },
): Promise<{ version: number }> {
  const body = { action: "version", token, ...input, notes: input.notes || undefined, fixes: input.fixes?.length ? input.fixes : undefined };
  const r = (await call(`/api/share/${slugOrThrow(slug)}`, { method: "POST", body, timeoutMs: 30_000 })) as Record<string, unknown>;
  return { version: Math.max(1, Number(r.version) || 1) };
}

/** The owner's support mode (`action:"settings"`). */
export async function shareSettingsRemote(slug: string, token: string, support: SupportInput): Promise<void> {
  await call(`/api/share/${slugOrThrow(slug)}`, { method: "POST", body: { action: "settings", token, support } });
}

export async function deleteShareRemote(slug: string, token: string): Promise<void> {
  await call(`/api/share/${slugOrThrow(slug)}`, { method: "POST", body: { action: "delete", token } });
}

/** Best effort: the website counts one more clone (and, with an author, records which version I took). */
export async function countCloneRemote(slug: string, version?: number): Promise<void> {
  try {
    await call(`/api/share/${slugOrThrow(slug)}/clone`, { method: "POST", body: version ? { version } : {}, headers: await authorHeader(), timeoutMs: 8_000 });
  } catch {
    /* the clone itself succeeded; the counter is cosmetic */
  }
}

/** Best effort: a project cloned from this share was published (a review then reads "ใช้งานจริง"). */
export async function markPublishedRemote(slug: string): Promise<boolean> {
  const h = await authorHeader();
  if (!h["x-egs-author"]) return false;
  try {
    await call(`/api/share/${slugOrThrow(slug)}/published`, { method: "POST", body: {}, headers: h, timeoutMs: 8_000 });
    return true;
  } catch {
    return false;
  }
}

export async function followRemote(slug: string, on: boolean, authorKey: string): Promise<{ following: boolean; followers: number }> {
  const r = (await call(`/api/share/${slugOrThrow(slug)}/follow`, { method: "POST", body: { on }, headers: { "x-egs-author": authorKey } })) as Record<string, unknown>;
  return { following: r.following === true, followers: Math.max(0, Number(r.followers) || 0) };
}

/** The shares I follow (an older website, or no author: none). */
export async function followingRemote(): Promise<{ slug: string; title: string; latest: number }[]> {
  const h = await authorHeader();
  if (!h["x-egs-author"]) return [];
  try {
    return parseFollowing(await call("/api/share/following", { headers: h, timeoutMs: 10_000 }));
  } catch {
    return [];
  }
}

/** Newer versions of the given shares, and my reported issues that moved. An older website: nothing. */
export async function updatesRemote(items: { slug: string; since: number }[]): Promise<{ updates: ShareUpdate[]; myIssues: MyIssue[] }> {
  const clean = items.filter((i) => SLUG.test(i.slug)).slice(0, 60);
  if (clean.length === 0) return { updates: [], myIssues: [] };
  try {
    return parseUpdates(await call("/api/share/updates", { method: "POST", body: { items: clean }, headers: await authorHeader(), timeoutMs: 10_000 }));
  } catch (e) {
    if (e instanceof ShareApiError && (e.code === "not_found" || e.code === "unreachable" || e.code === "server")) return { updates: [], myIssues: [] };
    throw e;
  }
}

// ---------- reviews ----------

/** null = the website has no reviews yet (older site). */
export async function reviewsRemote(slug: string, offset = 0): Promise<{ avg: number | null; count: number; reviews: ShareReview[] } | null> {
  try {
    return parseReviews(await call(`/api/share/${slugOrThrow(slug)}/reviews?offset=${Math.max(0, Math.floor(offset))}`, { timeoutMs: 10_000 }));
  } catch (e) {
    if (e instanceof ShareApiError && e.code === "not_found") return null;
    throw e;
  }
}

export async function postReviewRemote(slug: string, input: { stars: number; body: string }, authorKey: string): Promise<void> {
  await call(`/api/share/${slugOrThrow(slug)}/reviews`, { method: "POST", body: input, headers: { "x-egs-author": authorKey } });
}

export async function deleteReviewRemote(slug: string, authorKey: string): Promise<void> {
  await call(`/api/share/${slugOrThrow(slug)}/reviews`, { method: "POST", body: { action: "delete" }, headers: { "x-egs-author": authorKey } });
}

// ---------- issues ----------

/** null = the website has no issues yet (older site). */
export async function issuesRemote(slug: string, status: "open" | "all" = "all"): Promise<ShareIssue[] | null> {
  try {
    return parseIssues(await call(`/api/share/${slugOrThrow(slug)}/issues?status=${status}`, { timeoutMs: 10_000 }));
  } catch (e) {
    if (e instanceof ShareApiError && e.code === "not_found") return null;
    throw e;
  }
}

export async function postIssueRemote(
  slug: string,
  input: { title: string; body: string; version: number | null; details: { changedFiles: string[]; errors: string } },
  authorKey: string,
): Promise<{ number: number }> {
  const r = (await call(`/api/share/${slugOrThrow(slug)}/issues`, { method: "POST", body: input, headers: { "x-egs-author": authorKey } })) as Record<string, unknown>;
  return { number: Math.max(0, Number(r.number) || 0) };
}

/** The owner (token) sets any status + a note; a reporter (author key) closes their own. */
export async function setIssueRemote(slug: string, number: number, input: { token: string; status: IssueStatus; note: string } | { authorKey: string; status: "fixed" | "wontfix" }): Promise<void> {
  if (!Number.isInteger(number) || number < 1) throw new ShareApiError("ไม่พบรายการนี้", "refused");
  if ("token" in input) {
    await call(`/api/share/${slugOrThrow(slug)}/issues/${number}`, { method: "POST", body: { token: input.token, status: input.status, note: input.note } });
  } else {
    await call(`/api/share/${slugOrThrow(slug)}/issues/${number}`, { method: "POST", body: { status: input.status }, headers: { "x-egs-author": input.authorKey } });
  }
}

// ---------- proposals ----------

export async function proposeRemote(parent: string, input: { forkSlug: string; token: string; title: string; summary: string }): Promise<{ id: string }> {
  const r = (await call(`/api/share/${slugOrThrow(parent)}/proposals`, { method: "POST", body: input })) as Record<string, unknown>;
  return { id: typeof r.id === "string" ? r.id.slice(0, 40) : "" };
}

/** null = the website has no proposals yet (older site). */
export async function proposalsRemote(parent: string): Promise<ShareProposal[] | null> {
  try {
    return parseProposals(await call(`/api/share/${slugOrThrow(parent)}/proposals`, { timeoutMs: 10_000 }));
  } catch (e) {
    if (e instanceof ShareApiError && e.code === "not_found") return null;
    throw e;
  }
}

export async function setProposalRemote(parent: string, id: string, token: string, status: "merged" | "declined"): Promise<void> {
  if (!/^[0-9a-f-]{8,40}$/i.test(id)) throw new ShareApiError("ไม่พบข้อเสนอนี้", "refused");
  await call(`/api/share/${slugOrThrow(parent)}/proposals/${id}`, { method: "POST", body: { token, status } });
}
