import { ensureAuthor } from "@/lib/share/author";
import { siteOrigin } from "@/lib/share/remote";
import { premiumStatus } from "@/lib/premium/status";
import { readPremium } from "@/lib/premium/store";
import type { HubDoc, HubVisibility } from "./doc";

/**
 * Hubs ("ฮับ · หน้ารวมลิงก์", EasyGAS-Site lib/hubs.ts) from the app's side. Who: the share author key
 * (lib/share/author.ts — the Google account signed in here). Pro: this machine's activation token (EGA1, signed
 * by the licence server; the site checks it) — the licence key never leaves the machine. Server-only.
 */

const TIMEOUT_MS = 20_000;

export class HubApiError extends Error {
  /** the site said "this needs Pro" (402) */
  pro: boolean;
  constructor(message: string, pro = false) {
    super(message);
    this.pro = pro;
  }
}

export type HubSummary = { id: string; slug: string; title: string; visibility: HubVisibility; views: number; updatedAt: string; role: "owner" | "editor"; disabled: boolean };
export type HubEditorView = {
  id: string;
  slug: string;
  doc: HubDoc;
  visibility: HubVisibility;
  hasPin: boolean;
  showBrand: boolean;
  views: number;
  role: "owner" | "editor";
  proActive: boolean;
  disabledReason: string | null;
  editors: { id: string; name: string }[];
  clicks: Record<string, number>;
  updatedAt: string;
};

async function proToken(): Promise<string | null> {
  if (!(await premiumStatus().catch(() => null))?.active) return null;
  return (await readPremium()).activation;
}

async function call<T>(path: string, method: string, body?: unknown): Promise<T> {
  const { key } = await ensureAuthor();
  const pro = await proToken();
  let res: Response;
  try {
    res = await fetch(`${siteOrigin()}/api/hub${path}`, {
      method,
      headers: { "x-egs-author": key, ...(pro ? { "x-egs-pro": pro } : {}), ...(body === undefined ? {} : { "content-type": "application/json" }) },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(TIMEOUT_MS),
      cache: "no-store",
    });
  } catch {
    throw new HubApiError("ติดต่อ easygaside.tech ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok) throw new HubApiError(typeof json.message === "string" ? json.message : "เว็บไซต์ตอบกลับผิดพลาด ลองใหม่อีกครั้ง", res.status === 402);
  return json as T;
}

export const listHubs = () => call<{ hubs: HubSummary[]; author: string }>("", "GET");
export const createHub = (title: string, slug?: string) => call<{ id: string; slug: string }>("", "POST", slug ? { title, slug } : { title });
export const getHub = (id: string) => call<HubEditorView>(`/${encodeURIComponent(id)}`, "GET");
export const saveHub = (id: string, input: { doc?: HubDoc; slug?: string; visibility?: HubVisibility; pin?: string; showBrand?: boolean; updatedAt?: string }) =>
  call<{ slug: string; updatedAt: string }>(`/${encodeURIComponent(id)}`, "PUT", input);
export const deleteHub = (id: string) => call<{ ok: true }>(`/${encodeURIComponent(id)}`, "DELETE");
export const hubImage = (id: string, kind: "cover" | "logo" | "icon", data: string) => call<{ url: string }>(`/${encodeURIComponent(id)}`, "POST", { action: "image", kind, data });
export const hubLinkMeta = (id: string, url: string) => call<{ url: string; title: string; iconUrl: string }>(`/${encodeURIComponent(id)}`, "POST", { action: "meta", url });
export const hubInvite = (id: string) => call<{ token: string; expiresAt: string }>(`/${encodeURIComponent(id)}`, "POST", { action: "invite" });
export const hubRemoveEditor = (id: string, editorId: string) => call<{ ok: true }>(`/${encodeURIComponent(id)}`, "POST", { action: "remove-editor", editorId });
export const joinHub = (token: string) => call<{ id: string; slug: string; title: string }>("/join", "POST", { token });

export const hubPublicUrl = (slug: string): string => `${siteOrigin()}/hub/${slug}`;
