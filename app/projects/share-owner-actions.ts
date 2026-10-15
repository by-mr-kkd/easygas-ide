"use server";

import { revalidatePath } from "next/cache";
import { describeChanges } from "@/lib/share/describe";
import { boardLink, compareProposal, forkChangesPrefill, ownerInfo, proposeToParent, setIssueStatus, setProposal, takeProposal, type OwnerInfo } from "@/lib/share/owner";
import { ShareRefusal } from "@/lib/share/payload";
import { ShareApiError } from "@/lib/share/remote";
import { saveShareSupport } from "@/lib/share/service";
import type { FileClass, CodeFile } from "@/lib/share/merge";
import type { TakeResult } from "@/lib/share/source";
import { supportMode } from "@/lib/share/v2";

/**
 * The owner's side of a share (share system 1.2): support mode, reported issues, proposals from forks, and a
 * fork offering itself back. The owner token never leaves the server. Share actions may run from a paired
 * phone, so none calls assertLocalRequest().
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

function failFrom(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof ShareRefusal) return { ok: false, error: e.message, code: "refused" };
  if (e instanceof ShareApiError) {
    if (e.code === "not_found") return { ok: false, error: "เว็บไซต์ยังไม่รองรับเรื่องนี้ ลองใหม่ภายหลัง", code: e.code };
    return { ok: false, error: e.message, code: e.code };
  }
  console.error("[share-owner]", e);
  return { ok: false, error: "ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

const PROJECT_ID = /^[a-z0-9-]{8,64}$/;
const PROPOSAL_ID = /^[0-9a-f-]{8,40}$/i;
const bad = { ok: false as const, error: "ไม่พบโปรเจกต์" };

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return failFrom(e);
  }
}

export async function ownerInfoAction(projectId: string): Promise<Result<OwnerInfo>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => ownerInfo(projectId));
}

export async function saveSupportAction(projectId: string, support: { mode: string; note: string }): Promise<Result<null>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(async () => {
    await saveShareSupport(projectId, { mode: supportMode(support?.mode), note: String(support?.note ?? "") });
    return null;
  });
}

export async function setIssueStatusAction(projectId: string, number: number, status: string, note: string): Promise<Result<null>> {
  if (!PROJECT_ID.test(projectId) || !Number.isInteger(number) || number < 1) return bad;
  return wrap(async () => {
    await setIssueStatus(projectId, number, String(status), String(note ?? ""));
    return null;
  });
}

export async function compareProposalAction(projectId: string, id: string): Promise<Result<{ base: CodeFile[] | null; latest: CodeFile[]; mine: CodeFile[]; plans: { path: string; cls: FileClass }[]; title: string }>> {
  if (!PROJECT_ID.test(projectId) || !PROPOSAL_ID.test(String(id))) return bad;
  return wrap(() => compareProposal(projectId, id));
}

export async function takeProposalAction(projectId: string, id: string): Promise<Result<Omit<TakeResult, "version">>> {
  if (!PROJECT_ID.test(projectId) || !PROPOSAL_ID.test(String(id))) return bad;
  const r = await wrap(() => takeProposal(projectId, id));
  if (r.ok) revalidatePath(`/projects/${projectId}`);
  return r;
}

export async function setProposalAction(projectId: string, id: string, status: "merged" | "declined"): Promise<Result<null>> {
  if (!PROJECT_ID.test(projectId) || !PROPOSAL_ID.test(String(id))) return bad;
  return wrap(async () => {
    await setProposal(projectId, id, status === "merged" ? "merged" : "declined");
    return null;
  });
}

/** A fork's "what changed", prefilled from the file diff (no AI, no network beyond the base). */
export async function forkChangesAction(projectId: string): Promise<Result<string>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => forkChangesPrefill(projectId));
}

/** "ให้ AI สรุป" for a fork's "what changed", by the AI picked in the chat. */
export async function describeChangesAction(projectId: string, ai: unknown): Promise<Result<string>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => describeChanges(projectId, ai));
}

export async function proposeToParentAction(projectId: string, title: string, summary: string): Promise<Result<{ id: string }>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => proposeToParent(projectId, String(title ?? ""), String(summary ?? "")));
}

/** The owner link to the share's thread (lib/share/owner.ts boardLink). */
export async function boardLinkAction(projectId: string): Promise<Result<string>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => boardLink(projectId));
}
