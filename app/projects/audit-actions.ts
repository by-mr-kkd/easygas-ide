"use server";

import { aiName } from "@/lib/ai-choice";
import { readAudit, saveAudit } from "@/lib/audit";
import { toAuditItems, type AuditState } from "@/lib/audit-items";
import { runCritic } from "@/lib/critic-run";
import { getProject } from "@/lib/projects";
import { snapshotProject } from "@/lib/versions";

/** "วิเคราะห์โค้ด" for a script imported from Google: offer, run, dismiss, and mark findings sent to the AI. */

type Result<T> = { ok: true; data: T } | { ok: false; error: string };

async function importedProject(projectId: string) {
  const project = await getProject(String(projectId ?? "")).catch(() => null);
  return project?.origin === "imported" ? project : null;
}

export async function getAuditAction(projectId: string): Promise<AuditState | null> {
  if (!(await importedProject(projectId))) return null;
  return readAudit(projectId);
}

/** One review of the whole script by the AI picked in the chat (`ai` = the picker's choice). */
export async function runAuditAction(projectId: string, ai: unknown): Promise<Result<{ state: AuditState; tokens: number }>> {
  const project = await importedProject(projectId);
  if (!project) return { ok: false, error: "โปรเจกต์นี้ไม่ได้นำเข้าจาก Google" };
  const r = await runCritic(project, ai, "audit");
  if (r.failed) {
    return {
      ok: false,
      error: "วิเคราะห์ไม่สำเร็จ ตรวจว่าตั้งค่า AI ไว้แล้ว (ตั้งค่า → AI) แล้วลองใหม่อีกครั้ง",
    };
  }
  const state: AuditState = { status: "done", at: new Date().toISOString(), items: toAuditItems(r.issues), by: aiName(r.project.ai) ?? undefined };
  await saveAudit(projectId, state);
  return { ok: true, data: { state, tokens: r.tokens } };
}

export async function dismissAuditAction(projectId: string): Promise<void> {
  if (!(await importedProject(projectId))) return;
  await saveAudit(projectId, { status: "dismissed", at: new Date().toISOString(), items: [] });
}

/** Before the picked findings go to the AI: keep the current code in the history, and mark them sent. */
export async function markAuditSentAction(projectId: string, ids: string[]): Promise<AuditState | null> {
  if (!(await importedProject(projectId))) return null;
  await snapshotProject(projectId, "manual", { label: "ก่อนให้ AI แก้ตามผลวิเคราะห์" });
  const state = await readAudit(projectId);
  if (!state) return null;
  const picked = new Set((Array.isArray(ids) ? ids : []).map(String));
  const at = new Date().toISOString();
  const next: AuditState = { ...state, items: state.items.map((i) => (picked.has(i.id) ? { ...i, sentAt: at } : i)) };
  await saveAudit(projectId, next);
  return next;
}
