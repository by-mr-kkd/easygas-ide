"use server";

import { revalidatePath } from "next/cache";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import {
  completeDeviceFlow,
  disconnectGitHub,
  githubStatus,
  pollDeviceToken,
  requestDeviceCode,
  type DeviceCode,
  type GitHubStatus,
} from "@/lib/pages/github-auth";
import { PagesError, type PagesErrorCode } from "@/lib/pages/github-api";
import { pagesStateFor, publishToPages, type PublishPagesResult } from "@/lib/pages/publish";
import { premiumStatus } from "@/lib/premium/status";
import { getFiles } from "@/lib/files";
import { probeExec } from "@/lib/gas-verify";
import { getCurrentUserId, getProject, updateProject } from "@/lib/projects";

/**
 * Server actions for "วางหน้าเว็บบน GitHub". The device flow is driven by the client: it calls
 * pollGitHubAction every `interval` seconds; no timer runs on the server. The pending device code stays
 * in server memory (single-user local app) and is never sent to the client.
 */

let pending: DeviceCode | null = null;

const GOOGLE_MSG: Record<string, string> = {
  USER_SETTINGS_DISABLED: "ต้องเปิด Apps Script API ก่อน กด “เผยแพร่” แบบปกติแล้วทำตามขั้นตอนหนึ่งครั้ง",
  NOT_CONNECTED: "ยังไม่ได้เชื่อมบัญชี Google",
  NEEDS_REAUTH: "การเชื่อมต่อ Google หมดอายุ ต้องเชื่อมใหม่อีกครั้ง",
};

/** `code` is a PagesErrorCode, a Google-side code from lib/errors.ts (the GAS deploy failed) or UNKNOWN. */
export type ActionError = { ok: false; code: PagesErrorCode | string; error: string };

function fail(e: unknown): ActionError {
  if (e instanceof PagesError) return { ok: false, code: e.code, error: e.message };
  const msg = e instanceof Error ? e.message : "";
  const code = (e as { code?: unknown })?.code;
  if (typeof code === "string" && /^[A-Z_]+$/.test(code)) return { ok: false, code, error: GOOGLE_MSG[code] ?? "เผยแพร่บน Google ไม่สำเร็จ ลองกด “เผยแพร่” แบบปกติเพื่อดูสาเหตุ" };
  console.error("[pages]", msg || e);
  return { ok: false, code: "UNKNOWN", error: msg && /^[฀-๿]/.test(msg) ? msg : "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง" };
}

export async function githubStatusAction(): Promise<GitHubStatus> {
  return githubStatus();
}

export async function startGitHubConnectAction(): Promise<
  { ok: true; userCode: string; verificationUri: string; interval: number; expiresAt: number } | ActionError
> {
  try {
    pending = await requestDeviceCode();
    const { userCode, verificationUri, interval, expiresAt } = pending;
    return { ok: true, userCode, verificationUri, interval, expiresAt };
  } catch (e) {
    return fail(e);
  }
}

export type PollResult =
  | { status: "pending"; interval: number }
  | { status: "ok"; login: string }
  | { status: "expired" | "denied" | "none" }
  | { status: "error"; message: string };

export async function pollGitHubAction(): Promise<PollResult> {
  if (!pending) return { status: "none" };
  const r = await pollDeviceToken(pending);
  if (r.status === "pending") {
    pending = { ...pending, interval: r.interval };
    return r;
  }
  pending = null;
  if (r.status !== "ok") return r;
  try {
    const login = await completeDeviceFlow(r.token);
    revalidatePath("/settings");
    return { status: "ok", login };
  } catch (e) {
    const f = fail(e);
    return { status: "error", message: f.error };
  }
}

export async function cancelGitHubConnectAction(): Promise<void> {
  pending = null;
}

export async function disconnectGitHubAction(): Promise<{ ok: true }> {
  await disconnectGitHub();
  revalidatePath("/settings");
  return { ok: true };
}

export interface PagesState {
  hosting: "gas" | "github";
  /** the user picked (or the camera gate set) where the front page lives; false = ask a Pro user once */
  chosen: boolean;
  pages: { repo: string; url: string; published_at: string } | null;
  premium: boolean;
  github: GitHubStatus;
}

/**
 * Where the front page lives, picked by the user (components/pages/HostingChoiceDialog). "github" is Pro:
 * the AI keeps writing google.script.run, the publisher swaps in the fetch shim. Switching back to "gas" is
 * refused while the project has camera code, because Google's page cannot run it.
 */
export async function setHostingAction(projectId: string, hosting: "gas" | "github"): Promise<{ ok: true } | ActionError> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, code: "UNKNOWN", error: "ไม่พบโปรเจกต์" };
  if (hosting !== "gas" && hosting !== "github") return { ok: false, code: "UNKNOWN", error: "ค่าไม่ถูกต้อง" };
  if (hosting === "github" && !(await premiumStatus()).active) return { ok: false, code: "PREMIUM_REQUIRED", error: "วางหน้าเว็บบน GitHub เป็นฟีเจอร์ของ Pro" };
  if (hosting === "gas") {
    const files = await getFiles(projectId);
    if (files.some((f) => /getUserMedia|capture=["']?(camera|environment)/.test(f.content))) {
      return { ok: false, code: "UNKNOWN", error: "โปรเจกต์นี้ใช้กล้อง ซึ่งหน้าเว็บของ Google เปิดกล้องไม่ได้ ต้องอยู่บน GitHub Pages ต่อไป" };
    }
  }
  await updateProject(projectId, { hosting });
  revalidatePath(`/projects/${projectId}`);
  return { ok: true };
}

/** Everything the publish UI needs for one project (called from a client effect, never at render). */
export async function pagesStateAction(projectId: string): Promise<PagesState | null> {
  const state = await pagesStateFor(projectId);
  if (!state) return null;
  const [premium, github] = await Promise.all([premiumStatus(), githubStatus()]);
  return { hosting: state.hosting, chosen: state.chosen, pages: state.pages ?? null, premium: premium.active, github };
}

export type BackendAuth = { execUrl: string | null; status: "ok" | "auth_required" | "unknown"; message?: string };

/**
 * Has the owner approved the backend yet? A GAS web app that touches Sheets/Drive answers everyone (the
 * GitHub page included) with Google's permission wall until its owner opens /exec once and presses Allow.
 * The probe is remembered on the project once it passes, so the reminder goes away for good.
 */
export async function backendAuthAction(projectId: string): Promise<BackendAuth> {
  const project = await getProject(projectId);
  const execUrl = project?.deployment?.exec_url ?? null;
  if (!project || !execUrl) return { execUrl: null, status: "unknown" };
  if (project.backend_authorized_at) return { execUrl, status: "ok" };
  const probe = await probeExec(execUrl);
  if (probe.authRequired) return { execUrl, status: "auth_required", message: probe.error };
  // timeout / network / deleted deployment: nothing learned
  if (probe.infraError) return { execUrl, status: "unknown", message: probe.error };
  // the app answered — fine, or with a runtime error of its own: either way the permission wall is gone
  await updateProject(projectId, { backend_authorized_at: new Date().toISOString() });
  return { execUrl, status: "ok" };
}

export type PublishPagesAction = ({ ok: true } & Omit<PublishPagesResult, "deploy"> & { execUrl: string }) | ActionError;

/** One press: GAS deploy (with the dispatcher) + the static page on GitHub Pages. */
export async function publishPagesAction(projectId: string): Promise<PublishPagesAction> {
  const project = await getProject(projectId);
  if (!project) return { ok: false, code: "UNKNOWN", error: "ไม่พบโปรเจกต์" };
  if (project.hosting !== "github") return { ok: false, code: "UNKNOWN", error: "โปรเจกต์นี้ไม่ได้ตั้งค่าให้วางหน้าเว็บบน GitHub" };
  const lock = await acquireProjectRun(projectId);
  if (!lock) return { ok: false, code: "UNKNOWN", error: "โปรเจกต์กำลังทำงานอยู่ รอให้เสร็จก่อน" };
  try {
    const r = await publishToPages(await getCurrentUserId(), project);
    revalidatePath(`/projects/${projectId}`);
    return { ok: true, url: r.url, shareUrl: r.shareUrl, repo: r.repo, built: r.built, execUrl: r.deploy.execUrl ?? "" };
  } catch (e) {
    return fail(e);
  } finally {
    await releaseProjectRun(projectId, lock);
  }
}
