/**
 * Sharing a project as an EasyGAS link, and cloning one (server-only).
 *
 *  share:  the project's files are scanned here first (credentials refuse, personal values warn), then posted
 *          to the website; the link and the owner token land in project.json so "อัปเดตเวอร์ชัน" and
 *          "ลบลิงก์" work later from the same project.
 *  clone:  the website's copy becomes a new local project (origin "cloned") with a first version snapshot,
 *          so the untouched original is one click away in the history.
 */
import { licenseOf, type ShareLicense } from "./license";
import { ensureAuthor } from "./author";
import { randomUUID } from "node:crypto";
import { getFiles, writeFile } from "@/lib/files";
import { createProject, getProject, listProjects, updateProject } from "@/lib/projects";
import { premiumStatus } from "@/lib/premium/status";
import { snapshotProject } from "@/lib/versions";
import type { EgsProject } from "@/types/db";
import { parseShareLink } from "./link";
import { fromShareFiles, kindOf, SHARE_LIMITS, ShareRefusal, toShareFiles, type SharePublic } from "./payload";
import { countCloneRemote, createShareRemote, deleteShareRemote, fetchShare, postVersionRemote, setShareImagesRemote, shareSettingsRemote, siteOrigin, uploadShareImageRemote } from "./remote";
import { scanShare, type Finding } from "./scan";
import { saveShareBase } from "./source";
import { supportMode, SUPPORT_NOTE_MAX, type SupportMode } from "./v2";

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

export type ShareInput = {
  title: string;
  description: string;
  parent: string | null;
  license?: string;
  /** share system 1.2: how the owner looks after it (first share; later through saveShareSupport) */
  support?: { mode: SupportMode; note: string };
  /** a new version: what changed, and the reported issues it fixes */
  notes?: string;
  fixes?: number[];
  /** a fork (a project cloned from a share): what it changed against its parent */
  changes?: string;
};

const cleanSupport = (s: ShareInput["support"]): { mode: SupportMode; note: string } | undefined =>
  s ? { mode: supportMode(s.mode), note: clean(s.note, SUPPORT_NOTE_MAX) } : undefined;
const cleanFixes = (v: unknown): number[] =>
  Array.isArray(v) ? [...new Set(v.map((x) => Math.floor(Number(x))).filter((n) => Number.isFinite(n) && n >= 1))].slice(0, 50) : [];

/** Publish the project (a share that exists already gets a new version instead). */
export async function shareProject(projectId: string, input: ShareInput): Promise<NonNullable<EgsProject["share"]>> {
  const project = await getProject(projectId);
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  const title = clean(input.title, SHARE_LIMITS.title[1]) || project.name.slice(0, SHARE_LIMITS.title[1]);
  const description = clean(input.description, SHARE_LIMITS.description);
  const license = licenseOf(input.license);
  if (title.length < SHARE_LIMITS.title[0]) throw new ShareRefusal("ตั้งชื่อระบบก่อน อย่างน้อย 3 ตัวอักษร");
  const files = toShareFiles(await getFiles(projectId));
  const { blocked } = scanShare(files);
  if (blocked.length) {
    const b = blocked[0];
    throw new ShareRefusal(`พบ ${b.kind} ใน ${b.file} บรรทัด ${b.line} — เอาออกหรือย้ายไป Script Properties ก่อนแชร์`);
  }

  // a front page on GitHub Pages is Pro: the website tags the share and lets only Pro clone it
  const hosting = project.hosting === "github" ? "github" : "gas";
  if (project.share?.slug && project.share.token) {
    const { version } = await postVersionRemote(project.share.slug, project.share.token, {
      title,
      description,
      files,
      hosting,
      license,
      notes: clean(input.notes, 2000),
      fixes: cleanFixes(input.fixes),
    });
    const share = { ...project.share, title, version, license, updated_at: new Date().toISOString() };
    await updateProject(projectId, { share });
    return share;
  }
  const parent = input.parent ? parseShareLink(input.parent) : (project.cloned_from?.slug ?? null);
  // the sharer = the Google account signed in here (lib/share/author.ts); its name, not a typed one
  const author = await ensureAuthor();
  // a fork names the version it is built on and what it changed (the parent's page lists it under ทางแยก)
  const fork = parent && project.cloned_from?.slug === parent;
  const r = await createShareRemote(
    {
      title,
      description,
      name: author.author.display,
      files,
      parent,
      hosting,
      license,
      support: cleanSupport(input.support),
      parentVersion: fork ? project.cloned_from!.version : null,
      changes: fork ? clean(input.changes, 2000) : "",
    },
    author.key,
  );
  const now = new Date().toISOString();
  const share = { slug: r.slug, url: r.url, token: r.token, title, version: 1, license, shared_at: now, updated_at: now };
  await updateProject(projectId, { share });
  return share;
}

/** The owner's support mode for an existing share. */
export async function saveShareSupport(projectId: string, support: { mode: SupportMode; note: string }): Promise<void> {
  const project = await getProject(projectId);
  if (!project?.share?.slug || !project.share.token) throw new ShareRefusal("โปรเจกต์นี้ยังไม่ได้แชร์");
  await shareSettingsRemote(project.share.slug, project.share.token, cleanSupport(support)!);
}

/** Take the link down on the website and forget it here. */
export async function unshareProject(projectId: string): Promise<void> {
  const project = await getProject(projectId);
  if (!project?.share) return;
  await deleteShareRemote(project.share.slug, project.share.token);
  await updateProject(projectId, { share: null });
}

/** The link only (never the token) plus what the dialog needs to show. */
export async function shareState(projectId: string): Promise<{
  share: { slug: string; url: string; title: string; version: number; updated_at: string; license: ShareLicense; cover: string; images: string[] } | null;
  clonedFrom: EgsProject["cloned_from"] | null;
  name: string;
}> {
  const project = await getProject(projectId);
  if (!project) return { share: null, clonedFrom: null, name: "" };
  const s = project.share;
  return {
    share: s ? { slug: s.slug, url: s.url, title: s.title, version: s.version, updated_at: s.updated_at, license: licenseOf(s.license), cover: s.cover ?? "", images: s.images ?? [] } : null,
    clonedFrom: project.cloned_from ?? null,
    name: project.name,
  };
}

/** A picture for the share page: one the website already holds (url), or a new one from the browser (base64). */
export type SharePictureInput = { url: string } | { data: string };
export const SHARE_PHOTOS_MAX = 4;
/** base64 of a browser-shrunk JPEG (lib/client/image-compress): well under the website's 3 MB cap */
const PICTURE_BASE64_MAX = 2_800_000;

/**
 * The pictures of a project's share: new ones are uploaded (the website re-encodes them), then the list is set —
 * the website drops anything that is not this share's own upload and removes what is no longer listed.
 */
export async function setShareImages(projectId: string, input: { cover: SharePictureInput | null; images: SharePictureInput[] }): Promise<{ cover: string; images: string[] }> {
  const project = await getProject(projectId);
  if (!project?.share?.slug || !project.share.token) throw new ShareRefusal("สร้างลิงก์แชร์ก่อน แล้วค่อยใส่รูป");
  const { slug, token } = project.share;
  const place = async (p: SharePictureInput, kind: "cover" | "photo"): Promise<string> => {
    if ("url" in p) return typeof p.url === "string" ? p.url : "";
    if (typeof p.data !== "string" || !p.data) throw new ShareRefusal("รูปไม่ถูกต้อง");
    if (p.data.length > PICTURE_BASE64_MAX) throw new ShareRefusal("รูปใหญ่เกินไป ลองเลือกรูปที่เล็กกว่านี้");
    return uploadShareImageRemote(slug, token, kind, p.data);
  };
  const cover = input.cover ? await place(input.cover, "cover") : "";
  const images: string[] = [];
  for (const p of input.images.slice(0, SHARE_PHOTOS_MAX)) images.push(await place(p, "photo"));
  const r = await setShareImagesRemote(slug, token, { cover, images: images.filter(Boolean) });
  await updateProject(projectId, { share: { ...project.share, cover: r.cover, images: r.images } });
  return r;
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
  // a share made for GitHub Pages (camera, installable app) keeps that front page; a Sheet script cannot have it
  const github = share.hosting === "github" && kindOf(files) === "webapp" && (await premiumStatus()).active;
  await updateProject(projectId, {
    ...(github ? { hosting: "github" as const } : {}),
    origin: "cloned",
    cloned_from: { slug: share.slug, url: share.url || `${siteOrigin()}/s/${share.slug}`, title: share.title, author: share.author.name, version: share.version, cloned_at: new Date().toISOString(), license: share.license },
  });
  await snapshotProject(projectId, "import", { label: `ต้นฉบับจากลิงก์แชร์ (${share.author.name})` });
  // the base for "เทียบกับต้นฉบับ" / "รับอัปเดต" later (app metadata, outside src/)
  await saveShareBase(projectId, share.slug, share.version, files).catch(() => {});
  void countCloneRemote(share.slug, share.version);
  return { projectId, title: share.title };
}

/** Projects already cloned from this share, for "เปิดอันที่มีอยู่แทน". */
export async function projectsClonedFrom(slug: string): Promise<{ id: string; name: string }[]> {
  return (await listProjects()).filter((p) => p.cloned_from?.slug === slug && !p.deleted_at).map((p) => ({ id: p.id, name: p.name }));
}

export const randomId = (): string => randomUUID();
