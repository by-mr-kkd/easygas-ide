"use server";

import { revalidatePath } from "next/cache";
import { getProject } from "@/lib/projects";
import { ShareRefusal, type SharePublic } from "@/lib/share/payload";
import { ShareApiError } from "@/lib/share/remote";
import { cloneShare, previewShare, projectsClonedFrom, scanProject, shareProject, shareState, unshareProject, type ScanResult, type ShareInput } from "@/lib/share/service";
import { describeProject } from "@/lib/share/describe";
import { ensureAuthor, renameAuthor, storedAuthor, type ShareAuthor } from "@/lib/share/author";

/**
 * Share links (easygaside.tech/s/<slug>): publish a project, look at a pasted link, clone it. A phone (the
 * remote gateway) may run all of these — cloning from the phone is the point — so none calls
 * assertLocalRequest(); nothing here touches settings a phone must not reach.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

function failFrom(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof ShareRefusal) return { ok: false, error: e.message, code: "refused" };
  if (e instanceof ShareApiError) return { ok: false, error: e.message, code: e.code };
  console.error("[share]", e);
  return { ok: false, error: "ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

const PROJECT_ID = /^[a-z0-9-]{8,64}$/;

/** The dialog's opening state: link so far, scan of the current files, the remembered display name. */
export async function shareDialogAction(projectId: string): Promise<Result<{ state: Awaited<ReturnType<typeof shareState>>; scan: ScanResult | null; scanError: string | null; author: ShareAuthor | null }>> {
  if (!PROJECT_ID.test(projectId) || !(await getProject(projectId))) return { ok: false, error: "ไม่พบโปรเจกต์" };
  // the name the share will carry: the one known here (no network), refreshed on publish
  const [state, author] = await Promise.all([shareState(projectId), storedAuthor()]);
  try {
    return { ok: true, data: { state, scan: await scanProject(projectId), scanError: null, author } };
  } catch (e) {
    return { ok: true, data: { state, scan: null, scanError: e instanceof ShareRefusal ? e.message : "อ่านไฟล์ไม่สำเร็จ", author } };
  }
}

/** "ให้ AI สรุป": a short description for the share page, written by the AI picked in the chat (`ai`). */
export async function describeShareAction(projectId: string, ai: unknown): Promise<Result<string>> {
  if (!PROJECT_ID.test(projectId)) return { ok: false, error: "ไม่พบโปรเจกต์" };
  try {
    return { ok: true, data: await describeProject(projectId, ai) };
  } catch (e) {
    if (e instanceof ShareRefusal) return { ok: false, error: e.message };
    console.error("[share] describe", e);
    return { ok: false, error: "AI สรุปไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์เอง" };
  }
}

/** Who shares (the Google account signed in here): made / refreshed on the website. */
export async function shareAuthorAction(): Promise<Result<ShareAuthor>> {
  try {
    return { ok: true, data: (await ensureAuthor()).author };
  } catch (e) {
    return failFrom(e);
  }
}

/** Pick the name shares show (null = the masked email). The website allows it once every 30 days. */
export async function renameShareAuthorAction(name: string | null): Promise<Result<ShareAuthor>> {
  try {
    const clean = typeof name === "string" ? name.trim().slice(0, 60) : "";
    return { ok: true, data: await renameAuthor(clean || null) };
  } catch (e) {
    return failFrom(e);
  }
}

export async function shareProjectAction(projectId: string, input: ShareInput): Promise<Result<{ slug: string; url: string; version: number }>> {
  if (!PROJECT_ID.test(projectId)) return { ok: false, error: "ไม่พบโปรเจกต์" };
  try {
    const share = await shareProject(projectId, {
      title: String(input?.title ?? ""),
      description: String(input?.description ?? ""),
      parent: typeof input?.parent === "string" && input.parent ? input.parent : null,
      license: typeof input?.license === "string" ? input.license : undefined,
    });
    return { ok: true, data: { slug: share.slug, url: share.url, version: share.version } };
  } catch (e) {
    return failFrom(e);
  }
}

export async function unshareProjectAction(projectId: string): Promise<Result<null>> {
  if (!PROJECT_ID.test(projectId)) return { ok: false, error: "ไม่พบโปรเจกต์" };
  try {
    await unshareProject(projectId);
    return { ok: true, data: null };
  } catch (e) {
    return failFrom(e);
  }
}

/** What a pasted link is, before cloning: title, author, files, permissions, warnings. */
export async function previewShareAction(link: string): Promise<Result<{ share: SharePublic; existing: { id: string; name: string }[] }>> {
  try {
    const share = await previewShare(String(link ?? "").slice(0, 300));
    return { ok: true, data: { share, existing: await projectsClonedFrom(share.slug) } };
  } catch (e) {
    return failFrom(e);
  }
}

export async function cloneShareAction(link: string): Promise<Result<{ projectId: string; title: string }>> {
  try {
    const r = await cloneShare(String(link ?? "").slice(0, 300));
    revalidatePath("/projects");
    return { ok: true, data: r };
  } catch (e) {
    return failFrom(e);
  }
}
