/**
 * The notices bar on the home screen (server-only), from easygaside.tech (EasyGAS-Site app/api/app/announcement):
 * - `notice`: the website's "ประกาศ" pill (admin → ประกาศ), the same text and link the landing page shows;
 * - `post`: the newest post an admin ticked "ประกาศในโปรแกรม".
 * Read when the home screen asks — never at render time — and kept for CACHE_MS so opening the home screen again costs
 * nothing. Fails quietly: no bar. A closed notice is remembered by id in settings.app (DISMISSED_KEY) — the desktop
 * app's localStorage changes with its port — and comes back only as a NEW id (the site hashes text + link).
 */
export interface Announcement {
  id: string;
  kind: "notice" | "post";
  title: string;
  excerpt: string;
  url: string;
}

// EASYGAS_SITE_ORIGIN: a local copy of the site (testing), as for the Pro app in lib/remote/runtime.ts
const source = (): string => `${process.env.EASYGAS_SITE_ORIGIN?.trim() || "https://easygaside.tech"}/api/app/announcement`;
const CACHE_MS = 10 * 60_000;
let cache: { at: number; value: Announcement[] } | null = null;

export const DISMISSED_KEY = "announce_dismissed";
const KEEP_DISMISSED = 20;
/** Ids as this file makes them: "n:<hex>" for the notice, "p:<post id>" for a post. */
export const ANNOUNCE_ID = /^[np]:[\w-]{1,64}$/;

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);

/** Only what the bar needs. A post links into easygaside.tech only; the notice may link any https page (the site's admin wrote it). */
export function parseAnnouncements(raw: unknown): Announcement[] {
  const out: Announcement[] = [];
  const body = raw as { announcement?: Record<string, unknown>; notice?: Record<string, unknown> } | null;
  const n = body?.notice;
  if (n && typeof n.id === "string" && /^[\w-]{1,64}$/.test(n.id) && typeof n.text === "string" && n.text.trim() && typeof n.url === "string") {
    if (/^https:\/\/[^\s"'<>\\]{1,500}$/.test(n.url)) {
      out.push({ id: `n:${n.id}`, kind: "notice", title: clip(n.text.trim(), 200), excerpt: "", url: n.url });
    }
  }
  const a = body?.announcement;
  if (a && typeof a.id === "string" && /^[\w-]{1,64}$/.test(a.id) && typeof a.title === "string" && typeof a.url === "string") {
    if (/^https:\/\/easygaside\.tech\/[\w\-/]*$/.test(a.url)) {
      out.push({
        id: `p:${a.id}`,
        kind: "post",
        title: clip(a.title.trim(), 120),
        excerpt: clip(typeof a.excerpt === "string" ? a.excerpt.trim() : "", 200),
        url: a.url,
      });
    }
  }
  return out;
}

/** settings.app holds the closed ids as one comma list, newest last. */
export function readDismissed(stored: string | null | undefined): string[] {
  return (stored ?? "").split(",").filter((id) => ANNOUNCE_ID.test(id));
}

export function addDismissed(stored: string | null | undefined, id: string): string {
  const ids = readDismissed(stored).filter((x) => x !== id);
  return [...ids, id].slice(-KEEP_DISMISSED).join(",");
}

export async function latestAnnouncements(): Promise<Announcement[]> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const res = await fetch(source(), { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const value = res.ok ? parseAnnouncements(await res.json()) : [];
    cache = { at: Date.now(), value };
    return value;
  } catch {
    cache = { at: Date.now(), value: [] };
    return [];
  }
}
