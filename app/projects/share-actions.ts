"use server";

import { revalidatePath } from "next/cache";
import { getProject } from "@/lib/projects";
import { ShareRefusal, type SharePublic } from "@/lib/share/payload";
import { ShareApiError } from "@/lib/share/remote";
import { cloneShare, previewShare, projectsClonedFrom, scanProject, shareProject, shareState, unshareProject, type ScanResult, type ShareInput } from "@/lib/share/service";
import { getAppSetting, setAppSetting } from "@/lib/settings";

/**
 * Share links (easygaside.tech/s/<slug>): publish a project, look at a pasted link, clone it. A phone (the
 * remote gateway) may run all of these — cloning from the phone is the point — so none calls
 * assertLocalRequest(); nothing here touches settings a phone must not reach.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

const NAME_KEY = "share_name";

function failFrom(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof ShareRefusal) return { ok: false, error: e.message, code: "refused" };
  if (e instanceof ShareApiError) return { ok: false, error: e.message, code: e.code };
  console.error("[share]", e);
  return { ok: false, error: "ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

const PROJECT_ID = /^[a-z0-9-]{8,64}$/;

/** The dialog's opening state: link so far, scan of the current files, the remembered display name. */
export async function shareDialogAction(projectId: string): Promise<Result<{ state: Awaited<ReturnType<typeof shareState>>; scan: ScanResult | null; scanError: string | null; name: string }>> {
  if (!PROJECT_ID.test(projectId) || !(await getProject(projectId))) return { ok: false, error: "ไม่พบโปรเจกต์" };
  const [state, name] = await Promise.all([shareState(projectId), getAppSetting(NAME_KEY)]);
  try {
    return { ok: true, data: { state, scan: await scanProject(projectId), scanError: null, name: name ?? "" } };
  } catch (e) {
    return { ok: true, data: { state, scan: null, scanError: e instanceof ShareRefusal ? e.message : "อ่านไฟล์ไม่สำเร็จ", name: name ?? "" } };
  }
}

export async function shareProjectAction(projectId: string, input: ShareInput): Promise<Result<{ slug: string; url: string; version: number }>> {
  if (!PROJECT_ID.test(projectId)) return { ok: false, error: "ไม่พบโปรเจกต์" };
  try {
    const share = await shareProject(projectId, {
      title: String(input?.title ?? ""),
      description: String(input?.description ?? ""),
      name: String(input?.name ?? ""),
      parent: typeof input?.parent === "string" && input.parent ? input.parent : null,
    });
    const name = String(input?.name ?? "").trim().slice(0, 40);
    if (name) await setAppSetting(NAME_KEY, name);
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
