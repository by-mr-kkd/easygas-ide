"use server";

import { revalidatePath } from "next/cache";
import { ShareRefusal } from "@/lib/share/payload";
import { ShareApiError } from "@/lib/share/remote";
import {
  closeMyIssue,
  compareWithSource,
  deleteSourceReview,
  followSource,
  markSeen,
  previewIssue,
  reportIssue,
  reviewSource,
  shareNotices,
  sourceInfo,
  sourceReviews,
  takeSourceUpdate,
  type Compare,
  type ShareNotices,
  type SourceInfo,
  type TakeResult,
} from "@/lib/share/source";
import type { IssueDraft, IssuePayload } from "@/lib/share/report";
import type { ShareReview } from "@/lib/share/v2";

/**
 * A cloned project and its source share ("ต้นฉบับ", share system 1.2). Like the other share actions these may
 * run from a paired phone (nothing here touches settings a phone must not reach), so none calls
 * assertLocalRequest(). Every network call is made from a user action or a client effect, never at render.
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string; code?: string };

function failFrom(e: unknown): { ok: false; error: string; code?: string } {
  if (e instanceof ShareRefusal) return { ok: false, error: e.message, code: "refused" };
  if (e instanceof ShareApiError) {
    if (e.code === "not_found") return { ok: false, error: "เว็บไซต์ยังไม่รองรับเรื่องนี้ หรือลิงก์แชร์ถูกลบไปแล้ว", code: e.code };
    return { ok: false, error: e.message, code: e.code };
  }
  console.error("[share-source]", e);
  return { ok: false, error: "ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

const PROJECT_ID = /^[a-z0-9-]{8,64}$/;
const SLUG = /^[a-z0-9]{6,16}$/;
const bad = { ok: false as const, error: "ไม่พบโปรเจกต์" };

async function wrap<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return failFrom(e);
  }
}

/** The home screen's and the code screen's notices (cached a few minutes on the server; force = look again). */
export async function shareNoticesAction(force = false): Promise<Result<ShareNotices>> {
  return wrap(() => shareNotices(force === true));
}

/** "รับทราบ": these notices go away. */
export async function dismissShareNoticesAction(input: { issues?: { slug: string; number: number; status: string }[]; follows?: { slug: string; version: number }[] }): Promise<Result<null>> {
  return wrap(async () => {
    const issues = Array.isArray(input?.issues) ? input.issues.slice(0, 100).map((i) => ({ slug: String(i?.slug ?? ""), number: Number(i?.number), status: String(i?.status ?? "") })) : [];
    const follows = Array.isArray(input?.follows) ? input.follows.slice(0, 100).map((f) => ({ slug: String(f?.slug ?? ""), version: Number(f?.version) })) : [];
    await markSeen({ issues, follows });
    return null;
  });
}

export async function sourceInfoAction(projectId: string): Promise<Result<SourceInfo>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => sourceInfo(projectId));
}

export async function compareSourceAction(projectId: string): Promise<Result<Compare>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => compareWithSource(projectId));
}

export async function takeSourceUpdateAction(projectId: string): Promise<Result<TakeResult>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  const r = await wrap(() => takeSourceUpdate(projectId));
  if (r.ok) revalidatePath(`/projects/${projectId}`);
  return r;
}

const draftOf = (d: unknown): IssueDraft => {
  const x = (d ?? {}) as Record<string, unknown>;
  return { title: String(x.title ?? ""), what: String(x.what ?? ""), steps: String(x.steps ?? ""), error: String(x.error ?? "") };
};

export async function previewIssueAction(projectId: string, draft: unknown): Promise<Result<{ payload: IssuePayload; problem: string | null }>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => previewIssue(projectId, draftOf(draft)));
}

export async function reportIssueAction(projectId: string, draft: unknown): Promise<Result<{ number: number }>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => reportIssue(projectId, draftOf(draft)));
}

export async function closeMyIssueAction(slug: string, number: number, status: "fixed" | "wontfix"): Promise<Result<null>> {
  if (!SLUG.test(String(slug)) || !Number.isInteger(number)) return { ok: false, error: "ไม่พบรายการนี้" };
  return wrap(async () => {
    await closeMyIssue(slug, number, status === "wontfix" ? "wontfix" : "fixed");
    return null;
  });
}

export async function sourceReviewsAction(projectId: string): Promise<Result<{ avg: number | null; count: number; reviews: ShareReview[] } | null>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => sourceReviews(projectId));
}

export async function reviewSourceAction(projectId: string, stars: number, body: string): Promise<Result<null>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(async () => {
    await reviewSource(projectId, Math.round(Number(stars)), String(body ?? ""));
    return null;
  });
}

export async function deleteSourceReviewAction(projectId: string): Promise<Result<null>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(async () => {
    await deleteSourceReview(projectId);
    return null;
  });
}

export async function followSourceAction(projectId: string, on: boolean): Promise<Result<{ following: boolean; followers: number }>> {
  if (!PROJECT_ID.test(projectId)) return bad;
  return wrap(() => followSource(projectId, on === true));
}
