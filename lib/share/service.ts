/**
 * Sharing a project as an EasyGAS link, and cloning one (server-only).
 *
 *  share:  the project's files are scanned here first (credentials refuse, personal values warn), then posted
 *          to the website; the link and the owner token land in project.json so "อัปเดตเวอร์ชัน" and
 *          "ลบลิงก์" work later from the same project.
 *  clone:  the website's copy becomes a new local project (origin "cloned") with a first version snapshot,
 *          so the untouched original is one click away in the history.
 */
import { randomUUID } from "node:crypto";
import { getFiles, writeFile } from "@/lib/files";
import { createProject, getProject, listProjects, updateProject } from "@/lib/projects";
import { snapshotProject } from "@/lib/versions";
import type { EgsProject } from "@/types/db";
import { parseShareLink } from "./link";
import { fromShareFiles, kindOf, SHARE_LIMITS, ShareRefusal, toShareFiles, type SharePublic } from "./payload";
import { countCloneRemote, createShareRemote, deleteShareRemote, fetchShare, postVersionRemote, siteOrigin } from "./remote";
import { scanShare, type Finding } from "./scan";

export type ScanResult = { blocked: Finding[]; warnings: Finding[]; fileCount: number; bytes: number };

const clean = (s: unknown, max: number): string =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

/** What the share dialog shows before anything leaves the computer. */
export async function scanProject(projectId: string): Promise<ScanResult> {
  const files = toShareFiles(await getFiles(projectId));
  const r = scanShare(files);
  return { ...r, fileCount: files.length, bytes: files.reduce((n, f) => n + Buffer.byteLength(f.source, "utf8"), 0) };
}

export type ShareInput = { title: string; description: string; name: string; parent: string | null };

/** Publish the project (a share that exists already gets a new version instead). */
export async function shareProject(projectId: string, input: ShareInput): Promise<NonNullable<EgsProject["share"]>> {
  const project = await getProject(projectId);
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  const title = clean(input.title, SHARE_LIMITS.title[1]) || project.name.slice(0, SHARE_LIMITS.title[1]);
  const description = clean(input.description, SHARE_LIMITS.description);
  const name = clean(input.name, SHARE_LIMITS.name[1]).replace(/\s+/g, " ");
  if (title.length < SHARE_LIMITS.title[0]) throw new ShareRefusal("ตั้งชื่อระบบก่อน อย่างน้อย 3 ตัวอักษร");
  if (!name) throw new ShareRefusal("ใส่ชื่อที่จะแสดงบนลิงก์ก่อน");
  const files = toShareFiles(await getFiles(projectId));
  const { blocked } = scanShare(files);
  if (blocked.length) {
    const b = blocked[0];
    throw new ShareRefusal(`พบ ${b.kind} ใน ${b.file} บรรทัด ${b.line} — เอาออกหรือย้ายไป Script Properties ก่อนแชร์`);
  }

  // a front page on GitHub Pages is Pro: the website tags the share and lets only Pro clone it
  const hosting = project.hosting === "github" ? "github" : "gas";
  if (project.share?.slug && project.share.token) {
    const { version } = await postVersionRemote(project.share.slug, project.share.token, { title, description, files, hosting });
    const share = { ...project.share, title, version, updated_at: new Date().toISOString() };
    await updateProject(projectId, { share });
    return share;
  }
  const parent = input.parent ? parseShareLink(input.parent) : (project.cloned_from?.slug ?? null);
  const r = await createShareRemote({ title, description, name, files, parent, hosting });
  const now = new Date().toISOString();
  const share = { slug: r.slug, url: r.url, token: r.token, title, version: 1, shared_at: now, updated_at: now };
  await updateProject(projectId, { share });
  return share;
}

/** Take the link down on the website and forget it here. */
export async function unshareProject(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project?.share) return;
  await deleteShareRemote(project.share.slug, project.share.token);
  await updateProject(projectId, { share: null });
}

/** The link only (never the token) plus what the dialog needs to show. */
export async function shareState(projectId: string): Promise<{ share: { slug: string; url: string; title: string; version: number; updated_at: string } | null; clonedFrom: EgsProject["cloned_from"] | null; name: string }> {
  const project = await getProject(projectId);
  if (!project) return { share: null, clonedFrom: null, name: "" };
  const s = project.share;
  return { share: s ? { slug: s.slug, url: s.url, title: s.title, version: s.version, updated_at: s.updated_at } : null, clonedFrom: project.cloned_from ?? null, name: project.name };
}

/** What a pasted link points at; the slug is resolved locally, the details come from the website. */
export async function previewShare(link: string): Promise<SharePublic> {
  const slug = parseShareLink(link);
  if (!slug) throw new ShareRefusal("ไม่ใช่ลิงก์แชร์ของ EasyGAS — ต้องเป็น https://easygaside.tech/s/… หรือ easygas://clone/…");
  return fetchShare(slug);
}

/**
 * Clone a share into a new project. The same share cloned twice gives two projects (the first may have
 * been edited); the name gets a counter from createProject.
 */
export async function cloneShare(link: string): Promise<{ projectId: string; title: string }> {
  const share = await previewShare(link);
  const files = fromShareFiles(share.files);
  const projectId = await createProject(share.title, kindOf(files), { description: share.description.slice(0, 500) || null, cloned: true });
  for (const f of files) await writeFile(projectId, f.path, f.content);
  await updateProject(projectId, {
    origin: "cloned",
    cloned_from: { slug: share.slug, url: share.url || `${siteOrigin()}/s/${share.slug}`, title: share.title, author: share.author.name, version: share.version, cloned_at: new Date().toISOString() },
  });
  await snapshotProject(projectId, "import", { label: `ต้นฉบับจากลิงก์แชร์ (${share.author.name})` });
  void countCloneRemote(share.slug);
  return { projectId, title: share.title };
}

/** Projects already cloned from this share, for "เปิดอันที่มีอยู่แทน". */
export async function projectsClonedFrom(slug: string): Promise<{ id: string; name: string }[]> {
  return (await listProjects()).filter((p) => p.cloned_from?.slug === slug && !p.deleted_at).map((p) => ({ id: p.id, name: p.name }));
}

export const randomId = (): string => randomUUID();
