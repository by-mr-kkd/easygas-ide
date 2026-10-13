/**
 * A cloned project and the share it came from ("ต้นฉบับ", server-only): what the source is now, the three-way
 * comparison (base · latest · mine), taking an update, reporting a problem, reviewing, following, and telling
 * the website the clone was published. Share system 1.2 — see the contract in lib/share/v2.ts.
 *
 * The base (the share's files at the version this project is built on) is kept in
 * `<project>/share-base.json` — app metadata, outside src/, never pushed. Older clones fall back to the
 * website's kept version, then to the clone's own first snapshot.
 */
import { join } from "node:path";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { deleteFile, getFiles, writeFile } from "@/lib/files";
import { readJson, writeJsonAtomic } from "@/lib/local/json-store";
import { dataRoot, projectDir } from "@/lib/local/paths";
import { getProject, listProjects, mutateProject } from "@/lib/projects";
import { getVersionFiles, listVersionsMeta, snapshotProject } from "@/lib/versions";
import type { EgsProject } from "@/types/db";
import { ensureAuthor } from "./author";
import { classifyFiles, changedPaths, mergeMessage, updatePlan, type CodeFile, type FileClass } from "./merge";
import { fromShareFiles, ShareRefusal, type SharePublic } from "./payload";
import {
  deleteReviewRemote,
  fetchShare,
  fetchShareVersion,
  followingRemote,
  followRemote,
  markPublishedRemote,
  postIssueRemote,
  postReviewRemote,
  reviewsRemote,
  setIssueRemote,
  ShareApiError,
  updatesRemote,
} from "./remote";
import { composeIssue, issueProblem, reviewProblem, cleanText, REVIEW_MAX, type IssueDraft, type IssuePayload } from "./report";
import { behindSource, changedIssues, type MyIssue, type ShareExtras, type ShareReview, type ShareUpdate } from "./v2";

// ---------- the base ----------

type StoredBase = { slug: string; version: number; files: CodeFile[] };
const basePath = (projectId: string): string => join(projectDir(projectId), "share-base.json");

export async function saveShareBase(projectId: string, slug: string, version: number, files: CodeFile[]): Promise<void> {
  await writeJsonAtomic(basePath(projectId), { slug, version, files: files.map((f) => ({ path: f.path, content: f.content })) } satisfies StoredBase);
}

export type BaseFrom = "local" | "site" | "snapshot";

/** The share's files at `version` for this project: kept here, the website's kept version, or the first snapshot. */
export async function baseFilesOf(projectId: string, slug: string, version: number): Promise<{ files: CodeFile[]; from: BaseFrom } | null> {
  const kept = await readJson<StoredBase | null>(basePath(projectId), null);
  if (kept && kept.slug === slug && kept.version === version && Array.isArray(kept.files)) return { files: kept.files, from: "local" };
  const remote = await fetchShareVersion(slug, version).catch(() => null);
  if (remote) {
    try {
      const files = fromShareFiles(remote.files);
      await saveShareBase(projectId, slug, version, files).catch(() => {});
      return { files, from: "site" };
    } catch {
      /* unusable files: the snapshot below */
    }
  }
  // the clone's first snapshot ("import", taken at clone time) — the base as long as no update was taken
  const first = (await listVersionsMeta(projectId, 200)).filter((v) => v.source === "import").pop();
  const files = first ? await getVersionFiles(first.id) : null;
  return files ? { files, from: "snapshot" } : null;
}

const mineOf = async (projectId: string): Promise<CodeFile[]> => (await getFiles(projectId)).map((f) => ({ path: f.path, content: f.content }));

function clonedOrThrow(project: EgsProject | null): asserts project is EgsProject & { cloned_from: NonNullable<EgsProject["cloned_from"]> } {
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  if (!project.cloned_from?.slug) throw new ShareRefusal("โปรเจกต์นี้ไม่ได้โคลนมาจากลิงก์แชร์");
}

// ---------- the source as it is now ----------

export type SourceInfo = {
  slug: string;
  url: string;
  title: string;
  author: string;
  /** the version this project is built on */
  base: number;
  /** the share's newest version (null: the share is gone) */
  latest: number | null;
  gone: boolean;
  /** the website hands this share's files to Pro only */
  proLocked: boolean;
  hosting: "gas" | "github";
  extra: ShareExtras | null;
  /** versions newer than the base, newest first, with notes */
  newer: { version: number; notes: string; fixes: number[]; createdAt: string }[];
};

export async function sourceInfo(projectId: string): Promise<SourceInfo> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const c = project.cloned_from;
  const out: SourceInfo = { slug: c.slug, url: c.url, title: c.title, author: c.author, base: c.version, latest: null, gone: false, proLocked: false, hosting: "gas", extra: null, newer: [] };
  let share: SharePublic;
  try {
    share = await fetchShare(c.slug);
  } catch (e) {
    if (e instanceof ShareApiError && e.code === "not_found") return { ...out, gone: true };
    if (e instanceof ShareApiError && e.code === "pro") return { ...out, proLocked: true, hosting: "github" };
    throw e;
  }
  return {
    ...out,
    title: share.title,
    author: share.author.name,
    url: share.url || c.url,
    latest: share.version,
    hosting: share.hosting,
    extra: share.extra,
    newer: share.extra.versions.filter((v) => v.version > c.version),
  };
}

// ---------- compare ----------

export type Compare = {
  base: CodeFile[] | null;
  baseFrom: BaseFrom | null;
  baseVersion: number;
  latest: CodeFile[];
  latestVersion: number;
  mine: CodeFile[];
  plans: { path: string; cls: FileClass }[];
};

export async function compareWithSource(projectId: string): Promise<Compare> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const c = project.cloned_from;
  const share = await fetchShare(c.slug);
  const latest = fromShareFiles(share.files);
  const [base, mine] = await Promise.all([baseFilesOf(projectId, c.slug, c.version), mineOf(projectId)]);
  // without a base every difference counts as "both": nothing is taken blindly
  const plans = classifyFiles(base?.files ?? mine, latest, mine).map((p) => ({ path: p.path, cls: base ? p.cls : p.cls === "same" ? "same" : "both" }));
  return { base: base?.files ?? null, baseFrom: base?.from ?? null, baseVersion: c.version, latest, latestVersion: share.version, mine, plans };
}

// ---------- take the update (and a fork's proposal: same path) ----------

export type TakeResult = { version: number; written: string[]; deleted: string[]; kept: string[]; conflicts: string[]; draft: string | null };

/**
 * Snapshot first; files only the source changed are written (or removed); files changed on both sides become
 * ONE chat message for the user to send; files only this project changed stay. `apply` decides what else
 * changes (the clone's base version, or nothing for a proposal).
 */
export async function takeFiles(
  projectId: string,
  input: { base: CodeFile[] | null; latest: CodeFile[]; kind: "update" | "proposal"; title: string; from: number | null; to: number | null; label: string },
  after?: () => Promise<void>,
): Promise<Omit<TakeResult, "version">> {
  const lock = await acquireProjectRun(projectId);
  if (!lock) throw new ShareRefusal("โปรเจกต์นี้กำลังทำงานอยู่ (AI หรือการเผยแพร่) รอให้เสร็จก่อนแล้วลองใหม่");
  try {
    const mine = await mineOf(projectId);
    await snapshotProject(projectId, "manual", { label: input.label });
    const plans = classifyFiles(input.base ?? mine, input.latest, mine).map((p) => (input.base || p.cls === "same" ? p : { ...p, cls: "both" as const }));
    const plan = updatePlan(plans);
    for (const f of plan.writes) await writeFile(projectId, f.path, f.content);
    for (const p of plan.deletes) await deleteFile(projectId, p);
    if (plan.writes.length || plan.deletes.length) await snapshotProject(projectId, "manual", { label: `${input.label} (แล้ว)` });
    await after?.();
    return {
      written: plan.writes.map((f) => f.path),
      deleted: plan.deletes,
      kept: plan.kept,
      conflicts: plan.conflicts.map((c) => c.path),
      draft: plan.conflicts.length ? mergeMessage({ kind: input.kind, title: input.title, from: input.from, to: input.to, conflicts: plan.conflicts }) : null,
    };
  } finally {
    await releaseProjectRun(projectId, lock);
  }
}

export async function takeSourceUpdate(projectId: string): Promise<TakeResult> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const c = project.cloned_from;
  const share = await fetchShare(c.slug);
  const latest = fromShareFiles(share.files);
  const base = await baseFilesOf(projectId, c.slug, c.version);
  const r = await takeFiles(projectId, { base: base?.files ?? null, latest, kind: "update", title: share.title, from: c.version, to: share.version, label: `ก่อนรับอัปเดตจากต้นฉบับ v${share.version}` }, async () => {
    // the project is built on the newest version now; its files are the next base
    await mutateProject(projectId, (cur) => (cur.cloned_from ? { cloned_from: { ...cur.cloned_from, version: share.version, title: share.title } } : {}));
    await saveShareBase(projectId, c.slug, share.version, latest);
  });
  updatesCache = null;
  return { ...r, version: share.version };
}

// ---------- report a problem ----------

/** Exactly what "แจ้งปัญหา" sends (the dialog shows it before sending), and what stops it. */
export async function previewIssue(projectId: string, draft: IssueDraft): Promise<{ payload: IssuePayload; problem: string | null }> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const c = project.cloned_from;
  const base = await baseFilesOf(projectId, c.slug, c.version).catch(() => null);
  const changed = base ? changedPaths(base.files, await mineOf(projectId)) : [];
  const payload = composeIssue(draft, c.version, changed);
  return { payload, problem: issueProblem(payload) };
}

export async function reportIssue(projectId: string, draft: IssueDraft): Promise<{ number: number }> {
  const { payload, problem } = await previewIssue(projectId, draft);
  if (problem) throw new ShareRefusal(problem);
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const { key } = await ensureAuthor();
  const r = await postIssueRemote(project.cloned_from.slug, payload, key);
  if (r.number) await markSeen({ issues: [{ slug: project.cloned_from.slug, number: r.number, status: "open" }] });
  return r;
}

/** A reporter closes their own report. */
export async function closeMyIssue(slug: string, number: number, status: "fixed" | "wontfix"): Promise<void> {
  const { key } = await ensureAuthor();
  await setIssueRemote(slug, number, { authorKey: key, status });
  await markSeen({ issues: [{ slug, number, status }] });
}

// ---------- review / follow ----------

export async function sourceReviews(projectId: string): Promise<{ avg: number | null; count: number; reviews: ShareReview[] } | null> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  return reviewsRemote(project.cloned_from.slug);
}

export async function reviewSource(projectId: string, stars: number, body: string): Promise<void> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const text = cleanText(body, REVIEW_MAX);
  const problem = reviewProblem(stars, text);
  if (problem) throw new ShareRefusal(problem);
  const { key } = await ensureAuthor();
  await postReviewRemote(project.cloned_from.slug, { stars, body: text }, key);
}

export async function deleteSourceReview(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const { key } = await ensureAuthor();
  await deleteReviewRemote(project.cloned_from.slug, key);
}

export async function followSource(projectId: string, on: boolean): Promise<{ following: boolean; followers: number }> {
  const project = await getProject(projectId);
  clonedOrThrow(project);
  const { key } = await ensureAuthor();
  const r = await followRemote(project.cloned_from.slug, on, key);
  updatesCache = null;
  return r;
}

// ---------- published ----------

/** Best effort, once per clone: the website marks my clone record "published" (reviews read "ใช้งานจริง"). */
export async function reportClonePublished(projectId: string): Promise<void> {
  try {
    const project = await getProject(projectId);
    const c = project?.cloned_from;
    if (!c?.slug || c.published_sent) return;
    if (await markPublishedRemote(c.slug)) await mutateProject(projectId, (cur) => (cur.cloned_from ? { cloned_from: { ...cur.cloned_from, published_sent: true } } : {}));
  } catch {
    /* never fails a publish */
  }
}

// ---------- updates for the home screen and the code screen ----------

type Seen = { issues: Record<string, string>; follows: Record<string, number> };
const seenPath = (): string => join(dataRoot(), "share-seen.json");
const readSeen = async (): Promise<Seen> => {
  const s = await readJson<Partial<Seen> | null>(seenPath(), null);
  return { issues: s?.issues && typeof s.issues === "object" ? s.issues : {}, follows: s?.follows && typeof s.follows === "object" ? s.follows : {} };
};

/** Remember what the user has seen (an issue's status, a followed share's version): its notice goes away. */
export async function markSeen(input: { issues?: { slug: string; number: number; status: string }[]; follows?: { slug: string; version: number }[] }): Promise<void> {
  const s = await readSeen();
  for (const i of input.issues ?? []) if (/^[a-z0-9]{6,16}$/.test(i.slug) && Number.isInteger(i.number)) s.issues[`${i.slug}#${i.number}`] = String(i.status).slice(0, 20);
  for (const f of input.follows ?? []) if (/^[a-z0-9]{6,16}$/.test(f.slug) && Number.isInteger(f.version)) s.follows[f.slug] = f.version;
  await writeJsonAtomic(seenPath(), s);
  updatesCache = null;
}

export type ShareNotices = {
  /** projectId → the share's newest version, for cloned projects behind their source */
  behind: Record<string, number>;
  /** followed shares (not cloned here) with a version I have not seen */
  followed: { slug: string; title: string; latest: number; notes: string }[];
  /** my reports whose status changed */
  issues: MyIssue[];
  at: number;
};

const UPDATES_TTL_MS = 4 * 60_000;
let updatesCache: ShareNotices | null = null;

/** Called from a client effect (never at render). Cached in memory a few minutes; an older website: nothing. */
export async function shareNotices(force = false): Promise<ShareNotices> {
  if (!force && updatesCache && Date.now() - updatesCache.at < UPDATES_TTL_MS) return updatesCache;
  const projects = (await listProjects()).filter((p) => p.cloned_from?.slug);
  const clones = projects.map((p) => ({ id: p.id, slug: p.cloned_from!.slug, version: p.cloned_from!.version || 1 }));
  const [follows, seen] = await Promise.all([followingRemote(), readSeen()]);
  const since = new Map<string, number>();
  for (const c of clones) since.set(c.slug, Math.min(since.get(c.slug) ?? Infinity, c.version));
  const cloned = new Set(since.keys());
  const newFollows: { slug: string; version: number }[] = [];
  for (const f of follows) {
    if (cloned.has(f.slug)) continue;
    // first time seen: today's version is the starting point, no notice for what came before following
    if (seen.follows[f.slug] === undefined) newFollows.push({ slug: f.slug, version: f.latest });
    since.set(f.slug, seen.follows[f.slug] ?? f.latest);
  }
  if (newFollows.length) await markSeen({ follows: newFollows }).catch(() => {});
  const { updates, myIssues } = await updatesRemote([...since].map(([slug, s]) => ({ slug, since: s })));
  const notes = (u: ShareUpdate) => u.versions.find((v) => v.notes)?.notes ?? "";
  const out: ShareNotices = {
    behind: behindSource(clones, updates),
    followed: updates.filter((u) => !cloned.has(u.slug) && u.latest > (since.get(u.slug) ?? u.latest)).map((u) => ({ slug: u.slug, title: u.title, latest: u.latest, notes: notes(u).slice(0, 200) })),
    issues: changedIssues(myIssues, seen.issues),
    at: Date.now(),
  };
  updatesCache = out;
  return out;
}
