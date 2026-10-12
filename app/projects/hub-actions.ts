"use server";

import { ShareRefusal } from "@/lib/share/payload";
import { ShareApiError } from "@/lib/share/remote";
import { premiumStatus } from "@/lib/premium/status";
import { type HubDoc, type HubVisibility } from "@/lib/hub/doc";
import { listHubProjects } from "@/lib/hub/projects";
import {
  createHub,
  deleteHub,
  getHub,
  hubImage,
  hubInvite,
  hubLinkMeta,
  hubPublicUrl,
  hubRemoveEditor,
  joinHub,
  listHubs,
  saveHub,
  HubApiError,
  type HubEditorView,
  type HubSummary,
} from "@/lib/hub/api";

/**
 * "ฮับ" (หน้ารวมลิงก์) on the home screen: every call goes to easygaside.tech as the signed-in Google account's
 * share author (lib/hub/api.ts). A phone may use these too (the hub is a web page the user edits from anywhere),
 * so they deliberately do not call assertLocalRequest().
 */

type Result<T> = { ok: true; data: T } | { ok: false; error: string; pro?: boolean };

function failFrom(e: unknown): { ok: false; error: string; pro?: boolean } {
  if (e instanceof HubApiError) return { ok: false, error: e.message, pro: e.pro };
  if (e instanceof ShareRefusal || e instanceof ShareApiError) return { ok: false, error: e.message };
  console.error("[hub]", e);
  return { ok: false, error: "ไม่สำเร็จ ลองใหม่อีกครั้ง" };
}

async function run<T>(fn: () => Promise<T>): Promise<Result<T>> {
  try {
    return { ok: true, data: await fn() };
  } catch (e) {
    return failFrom(e);
  }
}

export type HubListData = { hubs: (HubSummary & { url: string })[]; author: string; pro: boolean };

export async function hubListAction(): Promise<Result<HubListData>> {
  return run(async () => {
    const [{ hubs, author }, premium] = await Promise.all([listHubs(), premiumStatus().catch(() => ({ active: false }))]);
    return { hubs: hubs.map((h) => ({ ...h, url: hubPublicUrl(h.slug) })), author, pro: premium.active };
  });
}

export async function hubCreateAction(title: string): Promise<Result<{ id: string; slug: string }>> {
  return run(() => createHub(String(title ?? "").slice(0, 80)));
}

export async function hubGetAction(id: string): Promise<Result<HubEditorView & { url: string }>> {
  return run(async () => {
    const h = await getHub(id);
    return { ...h, url: hubPublicUrl(h.slug) };
  });
}

export async function hubSaveAction(
  id: string,
  input: { doc?: HubDoc; slug?: string; visibility?: HubVisibility; pin?: string; showBrand?: boolean; updatedAt?: string },
): Promise<Result<{ slug: string; updatedAt: string; url: string }>> {
  return run(async () => {
    const r = await saveHub(id, input);
    return { ...r, url: hubPublicUrl(r.slug) };
  });
}

export async function hubDeleteAction(id: string): Promise<Result<true>> {
  return run(async () => {
    await deleteHub(id);
    return true as const;
  });
}

/** `data` = base64 (no data: prefix), already shrunk by the browser. */
export async function hubImageAction(id: string, kind: "cover" | "logo" | "icon", data: string): Promise<Result<string>> {
  return run(async () => (await hubImage(id, kind, String(data ?? ""))).url);
}

export async function hubLinkMetaAction(id: string, url: string): Promise<Result<{ url: string; title: string; iconUrl: string }>> {
  return run(() => hubLinkMeta(id, String(url ?? "")));
}

export async function hubInviteAction(id: string): Promise<Result<{ token: string; expiresAt: string }>> {
  return run(() => hubInvite(id));
}

export async function hubRemoveEditorAction(id: string, editorId: string): Promise<Result<true>> {
  return run(async () => {
    await hubRemoveEditor(id, editorId);
    return true as const;
  });
}

export async function hubJoinAction(token: string): Promise<Result<{ id: string; slug: string; title: string }>> {
  return run(() => joinHub(String(token ?? "")));
}

export type { HubProject } from "@/lib/hub/projects";

/** Published web apps of this app, for "เพิ่มจากโปรเจกต์ของฉัน". */
export async function hubProjectsAction() {
  return listHubProjects();
}

