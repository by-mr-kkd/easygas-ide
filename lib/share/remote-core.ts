/**
 * The website's share API transport (server-only): one JSON call with a timeout, and the error kinds the
 * dialogs tell apart. lib/share/remote.ts builds every endpoint on it; author.ts uses the origin and the error.
 */

export const siteOrigin = (): string => (process.env.EASYGAS_SITE_ORIGIN?.trim() || "https://easygaside.tech").replace(/\/+$/, "");

export type ShareApiCode = "unreachable" | "not_found" | "refused" | "pro" | "author" | "server";

export class ShareApiError extends Error {
  constructor(
    message: string,
    public code: ShareApiCode = "server",
    /** the website's own error id (`not_cloned`, `no_support`, …) — never shown, only told apart */
    public reason: string = "",
  ) {
    super(message);
  }
}

export async function call(path: string, init: { method?: string; body?: unknown; timeoutMs?: number; headers?: Record<string, string> } = {}): Promise<unknown> {
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
  if (res.ok) return out ?? {};
  const reason = typeof out?.error === "string" ? out.error.slice(0, 40) : "";
  const message = typeof out?.message === "string" ? out.message.slice(0, 300) : "เว็บไซต์ตอบกลับผิดพลาด ลองใหม่อีกครั้ง";
  if (res.status === 404) throw new ShareApiError(message, "not_found", reason);
  // a share whose files the website hands to Pro only (GitHub Pages + camera)
  if (res.status === 403 && reason === "pro_required") throw new ShareApiError(message, "pro", reason);
  if (res.status === 401) throw new ShareApiError(message, "author", reason);
  if (res.status === 400 || res.status === 403 || res.status === 409 || res.status === 429) throw new ShareApiError(message, "refused", reason);
  throw new ShareApiError(message, "server", reason);
}
