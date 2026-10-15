/**
 * The owner's side of a share (server-only): its support mode, the issues people reported, the proposals forks
 * sent back, and — for a fork — what it changed and offering it to its parent. The owner token stays here
 * (project.share.token); the client only ever sees slugs, numbers and text.
 */
import { getFiles } from "@/lib/files";
import { getProject } from "@/lib/projects";
import type { EgsProject } from "@/types/db";
import { changeSummary, classifyFiles, type CodeFile, type FileClass } from "./merge";
import { fromShareFiles, ShareRefusal } from "./payload";
import { call, siteOrigin } from "./remote-core";
import { fetchShare, fetchShareVersion, issuesRemote, proposalsRemote, proposeRemote, setIssueRemote, setProposalRemote, ShareApiError } from "./remote";
import { cleanText } from "./report";
import { baseFilesOf, takeFiles, type TakeResult } from "./source";
import { issueStatus, type ShareExtras, type ShareIssue, type ShareProposal } from "./v2";

function sharedOrThrow(project: EgsProject | null): asserts project is EgsProject & { share: NonNullable<EgsProject["share"]> } {
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  if (!project.share?.slug || !project.share.token) throw new ShareRefusal("โปรเจกต์นี้ยังไม่ได้แชร์");
}

const mineOf = async (projectId: string): Promise<CodeFile[]> => (await getFiles(projectId)).map((f) => ({ path: f.path, content: f.content }));

export type OwnerInfo = {
  /** the website knows share system 1.2 (support, issues, proposals) */
  v2: boolean;
  extra: ShareExtras | null;
  issues: ShareIssue[];
  proposals: ShareProposal[];
};

/** Loaded when the share dialog opens (a user action): the share's 1.2 fields, its issues and proposals. */
export async function ownerInfo(projectId: string): Promise<OwnerInfo> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  const slug = project.share.slug;
  const [share, issues, proposals] = await Promise.all([fetchShare(slug).catch(() => null), issuesRemote(slug, "all").catch(() => null), proposalsRemote(slug).catch(() => null)]);
  return { v2: !!share?.extra.v2 || issues !== null, extra: share?.extra ?? null, issues: issues ?? [], proposals: proposals ?? [] };
}

export async function setIssueStatus(projectId: string, number: number, status: string, note: string): Promise<void> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  await setIssueRemote(project.share.slug, number, { token: project.share.token, status: issueStatus(status), note: cleanText(note, 500) });
}

// ---------- proposals ----------

async function proposalOf(slug: string, id: string): Promise<ShareProposal> {
  const list = (await proposalsRemote(slug)) ?? [];
  const p = list.find((x) => x.id === id);
  if (!p) throw new ShareRefusal("ไม่พบข้อเสนอนี้ (อาจถูกลบไปแล้ว)");
  return p;
}

/** The fork's files (at the proposed version when the website keeps it) and the base it started from. */
async function proposalFiles(project: EgsProject & { share: NonNullable<EgsProject["share"]> }, p: ShareProposal): Promise<{ base: CodeFile[] | null; theirs: CodeFile[]; forkTitle: string; from: number | null; to: number | null }> {
  const fork = await fetchShare(p.forkSlug);
  const kept = p.forkVersion ? await fetchShareVersion(p.forkSlug, p.forkVersion).catch(() => null) : null;
  const theirs = fromShareFiles(kept?.files ?? fork.files);
  // the fork started from my share at parentInfo.version; without it, my share as it is published now
  const startedAt = fork.extra.parentInfo?.version ?? null;
  let base: CodeFile[] | null = null;
  if (startedAt) {
    const v = await fetchShareVersion(project.share.slug, startedAt).catch(() => null);
    if (v) base = fromShareFiles(v.files);
  }
  if (!base) {
    const mineShared = await fetchShare(project.share.slug).catch(() => null);
    base = mineShared ? fromShareFiles(mineShared.files) : null;
  }
  return { base, theirs, forkTitle: fork.title, from: startedAt, to: p.forkVersion };
}

export async function compareProposal(
  projectId: string,
  id: string,
): Promise<{ base: CodeFile[] | null; latest: CodeFile[]; mine: CodeFile[]; plans: { path: string; cls: FileClass }[]; title: string }> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  const p = await proposalOf(project.share.slug, id);
  const f = await proposalFiles(project, p);
  const mine = await mineOf(projectId);
  const plans = classifyFiles(f.base ?? mine, f.theirs, mine).map((x) => ({ path: x.path, cls: f.base ? x.cls : x.cls === "same" ? ("same" as const) : ("both" as const) }));
  return { base: f.base, latest: f.theirs, mine, plans, title: f.forkTitle };
}

/** "รับเข้า": the same path as รับอัปเดต, with the fork's files as the newer side. */
export async function takeProposal(projectId: string, id: string): Promise<Omit<TakeResult, "version">> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  const p = await proposalOf(project.share.slug, id);
  const f = await proposalFiles(project, p);
  return takeFiles(projectId, { base: f.base, latest: f.theirs, kind: "proposal", title: p.title || f.forkTitle, from: f.from, to: f.to, label: `ก่อนรับข้อเสนอ "${p.title.slice(0, 40)}"` });
}

export async function setProposal(projectId: string, id: string, status: "merged" | "declined"): Promise<void> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  await setProposalRemote(project.share.slug, id, project.share.token, status);
}

// ---------- a fork ----------

/** The plain "what changed" against the version this project was cloned from (the AI can write a nicer one). */
export async function forkChangesPrefill(projectId: string): Promise<string> {
  const project = await getProject(projectId);
  const c = project?.cloned_from;
  if (!c?.slug) return "";
  const base = await baseFilesOf(projectId, c.slug, c.version).catch(() => null);
  return base ? changeSummary(base.files, await mineOf(projectId)).slice(0, 2000) : "";
}

/** "เสนอให้ต้นฉบับ": this fork's share offered back to the share it was cloned from. */
export async function proposeToParent(projectId: string, title: string, summary: string): Promise<{ id: string }> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  const parent = project.cloned_from?.slug;
  if (!parent) throw new ShareRefusal("โปรเจกต์นี้ไม่ได้โคลนมาจากลิงก์แชร์");
  const t = cleanText(title, 140);
  if (t.length < 3) throw new ShareRefusal("ใส่หัวข้ออย่างน้อย 3 ตัวอักษร");
  try {
    return await proposeRemote(parent, { forkSlug: project.share.slug, token: project.share.token, title: t, summary: cleanText(summary, 2000) });
  } catch (e) {
    if (e instanceof ShareApiError && e.code === "not_found") throw new ShareRefusal("เว็บไซต์ยังไม่รองรับการเสนอให้ต้นฉบับ หรือต้นฉบับถูกลบไปแล้ว");
    throw e;
  }
}

/**
 * "ดูกระทู้ในเว็บบอร์ด": a link (an hour) that opens the share's thread on the website as its poster — edit the post,
 * add pictures, answer as คนแชร์. The owner token goes in the request body, never a URL; an older website without
 * the endpoint gets the plain thread link.
 */
export async function boardLink(projectId: string): Promise<string> {
  const project = await getProject(projectId);
  sharedOrThrow(project);
  const plain = `${siteOrigin()}/s/${project.share.slug}/board`;
  try {
    const r = (await call(`/api/share/${project.share.slug}/board-link`, { method: "POST", body: { token: project.share.token }, timeoutMs: 10_000 })) as { url?: unknown };
    return typeof r.url === "string" && r.url.startsWith(siteOrigin() + "/") ? r.url : plain;
  } catch {
    return plain;
  }
}
