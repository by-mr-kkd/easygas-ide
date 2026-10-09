"use server";

import { assertLocalRequest } from "@/lib/remote/request";
import { revalidatePath } from "next/cache";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { ImportError, NotConnectedError, UserSettingsDisabledError } from "@/lib/errors";
import { scriptsPublishInfo, type PublishInfo } from "@/lib/drive-scripts";
import {
  checkWithGoogle,
  importScript,
  listGoogleScripts,
  pullRemote,
  setScriptHidden,
  type GoogleCheck,
  type GoogleScript,
} from "@/lib/import";
import { openProjectFolder } from "@/lib/open-folder";
import { SCRIPT_ID } from "@/lib/script-id";
import { getProject } from "@/lib/projects";

/** Editing an existing Apps Script: list, import (clone), and take Google's latest copy. */

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

function failFrom(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof ImportError) return { ok: false, error: e.message, code: e.code };
  if (e instanceof NotConnectedError) return { ok: false, error: "ยังไม่ได้เชื่อมบัญชี Google เชื่อมที่ ตั้งค่า → บัญชี Google ก่อน", code: "NOT_CONNECTED" };
  if (e instanceof UserSettingsDisabledError)
    return { ok: false, error: "ยังไม่ได้เปิด Apps Script API ที่ script.google.com/home/usersettings เปิดแล้วลองใหม่", code: "USER_SETTINGS_DISABLED" };
  console.error("[import]", e);
  return { ok: false, error: "ติดต่อ Google ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

export async function listGoogleScriptsAction(): Promise<Result<GoogleScript[]>> {
  try {
    return { ok: true, data: await listGoogleScripts() };
  } catch (e) {
    return failFrom(e);
  }
}

const MAX_STATUS_IDS = 300;

/** Published or not, for the scripts in the list (ids that are not script ids are ignored). */
export async function publishInfoAction(ids: string[]): Promise<Record<string, PublishInfo | null>> {
  const clean = (Array.isArray(ids) ? ids : []).map(String).filter((id) => SCRIPT_ID.test(id)).slice(0, MAX_STATUS_IDS);
  return scriptsPublishInfo(clean);
}

/** "ซ่อน" / "แสดง" a script in the list on this computer; nothing changes on Google. */
export async function setScriptHiddenAction(scriptId: string, hidden: boolean): Promise<Result<null>> {
  const id = String(scriptId ?? "");
  if (!SCRIPT_ID.test(id)) return { ok: false, error: "รหัสสคริปต์ไม่ถูกต้อง" };
  await setScriptHidden(id, hidden === true);
  return { ok: true, data: null };
}

/** `input` = a script id or an editor URL; `name` = the title from the list (a pasted id has none). */
export async function importScriptAction(input: string, name?: string): Promise<Result<{ projectId: string; existed: boolean }>> {
  try {
    const r = await importScript(String(input ?? ""), name ? String(name) : undefined);
    revalidatePath("/projects");
    return { ok: true, data: r };
  } catch (e) {
    return failFrom(e);
  }
}

/** "เช็คกับ Google": does the local copy match the script on Google now? */
export async function checkWithGoogleAction(projectId: string): Promise<Result<GoogleCheck | null>> {
  const project = await getProject(String(projectId ?? "")).catch(() => null);
  if (!project?.script_id) return { ok: false, error: "โปรเจกต์นี้ยังไม่ได้อยู่บน Google" };
  try {
    return { ok: true, data: await checkWithGoogle(project) };
  } catch (e) {
    return failFrom(e);
  }
}

/** "เปิดโฟลเดอร์": the project's code folder in File Explorer. */
export async function openProjectFolderAction(projectId: string): Promise<Result<null>> {
  await assertLocalRequest();
  const project = await getProject(String(projectId ?? "")).catch(() => null);
  if (!project) return { ok: false, error: "ไม่พบโปรเจกต์นี้ในเครื่อง" };
  try {
    await openProjectFolder(project.id);
    return { ok: true, data: null };
  } catch (e) {
    console.error("[open-folder]", e);
    return { ok: false, error: "เปิดโฟลเดอร์ไม่สำเร็จ" };
  }
}

/**
 * "ดึงของล่าสุดจาก Google" / "อัปเดตจาก Google": the current local files go into the history first. Not for
 * a project whose front page is on GitHub: Google holds a backend version of it, not the project's files.
 */
export async function pullRemoteAction(projectId: string): Promise<Result<null>> {
  const project = await getProject(String(projectId ?? "")).catch(() => null);
  if (!project?.script_id) return { ok: false, error: "โปรเจกต์นี้ยังไม่ได้อยู่บน Google" };
  if (project.origin !== "imported" && project.hosting === "github") return { ok: false, error: "โปรเจกต์ที่วางหน้าเว็บบน GitHub ดึงจาก Google ไม่ได้" };
  const lock = await acquireProjectRun(projectId);
  if (!lock) return { ok: false, error: "โปรเจกต์นี้กำลังทำงานอยู่ รอให้เสร็จก่อนแล้วลองใหม่" };
  try {
    await pullRemote(project);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, data: null };
  } catch (e) {
    return failFrom(e);
  } finally {
    await releaseProjectRun(projectId, lock);
  }
}
