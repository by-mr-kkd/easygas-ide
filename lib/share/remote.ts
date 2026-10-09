/**
 * The website's share API, server-only (the app's own server calls it; a phone goes through the app, never
 * to the website directly). easygaside.tech/api/share — see EasyGAS-Site/app/api/share.
 */
import { deviceIdentity } from "@/lib/premium/device";
import { readPremium } from "@/lib/premium/store";
import { parseSharePublic, ShareRefusal, type SharePublic } from "./payload";
import type { ShareFile } from "./scan";

export const siteOrigin = (): string => (process.env.EASYGAS_SITE_ORIGIN?.trim() || "https://easygaside.tech").replace(/\/+$/, "");

export class ShareApiError extends Error {
  constructor(
    message: string,
    public code: "unreachable" | "not_found" | "refused" | "pro" | "server" = "server",
  ) {
    super(message);
  }
}

async function call(path: string, init: { method?: string; body?: unknown; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<unknown> {
  let res: Response;
  try {
    res = await fetch(`${siteOrigin()}${path}`, {
      method: init.method ?? "GET",
      headers: { ...(init.body === undefined ? {} : { "content-type": "application/json" }), ...init.headers },
      body: init.body === undefined ? undefined : JSON.stringify(init.body),
      signal: AbortSignal.timeout(init.timeoutMs ?? 20_000),
      cache: "no-store",
    });
  } catch {
    throw new ShareApiError("ติดต่อ easygaside.tech ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่", "unreachable");
  }
  const out = (await res.json().catch(() => ({}))) as { error?: unknown; message?: unknown };
  if (res.ok) return out;
  const message = typeof out.message === "string" ? out.message : "เว็บไซต์ตอบกลับผิดพลาด ลองใหม่อีกครั้ง";
  if (res.status === 404) throw new ShareApiError(message, "not_found");
  // a share whose front page is on GitHub Pages: the website hands its files to Pro only
  if (res.status === 403 && out.error === "pro_required") throw new ShareApiError(message, "pro");
  if (res.status === 400 || res.status === 429) throw new ShareApiError(message, "refused");
  throw new ShareApiError(message, "server");
}

/** This machine's Pro key + registration, as the website checks it (none on Free). */
async function proHeaders(): Promise<Record<string, string>> {
  const [{ key }, device] = await Promise.all([readPremium(), deviceIdentity()]);
  return key && device ? { "x-egs-key": key, "x-egs-device": device.hash } : {};
}

/** A share by its slug: title, files, scopes, warnings, forks. A Pro-only share answers "pro" without Pro. */
export async function fetchShare(slug: string): Promise<SharePublic> {
  try {
    return parseSharePublic(await call(`/api/share/${slug}`, { headers: await proHeaders() }));
  } catch (e) {
    if (e instanceof ShareRefusal) throw new ShareApiError(e.message, "server");
    throw e;
  }
}

export type Created = { slug: string; url: string; token: string; warnings: unknown[] };

/** Publish: a Pro key + this machine's registration gets the PRO badge; without, a guest share. */
export async function createShareRemote(input: { title: string; description: string; name: string; files: ShareFile[]; parent: string | null; hosting: "gas" | "github" }): Promise<Created> {
  const [{ key }, device] = await Promise.all([readPremium(), deviceIdentity()]);
  const pro = key && device ? { key, deviceHash: device.hash } : {};
  const r = (await call("/api/share", { method: "POST", body: { ...input, parent: input.parent ?? undefined, ...pro }, timeoutMs: 30_000 })) as Record<string, unknown>;
  if (typeof r.slug !== "string" || typeof r.token !== "string" || typeof r.url !== "string") throw new ShareApiError("เว็บไซต์ตอบกลับไม่ครบ ลองใหม่อีกครั้ง");
  return { slug: r.slug, url: r.url, token: r.token, warnings: Array.isArray(r.warnings) ? r.warnings : [] };
}

export async function postVersionRemote(slug: string, token: string, input: { title?: string; description?: string; files: ShareFile[]; hosting: "gas" | "github" }): Promise<{ version: number }> {
  const r = (await call(`/api/share/${slug}`, { method: "POST", body: { action: "version", token, ...input }, timeoutMs: 30_000 })) as Record<string, unknown>;
  return { version: Math.max(1, Number(r.version) || 1) };
}

export async function deleteShareRemote(slug: string, token: string): Promise<void> {
  await call(`/api/share/${slug}`, { method: "POST", body: { action: "delete", token } });
}

/** Best effort: the website counts one more clone. */
export async function countCloneRemote(slug: string): Promise<void> {
  try {
    await call(`/api/share/${slug}/clone`, { method: "POST", timeoutMs: 8_000 });
  } catch {
    /* the clone itself succeeded; the counter is cosmetic */
  }
}
