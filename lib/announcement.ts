/**
 * The news banner on the home screen (server-only): the newest post an admin ticked "ประกาศในโปรแกรม" on
 * easygaside.tech (EasyGAS-Site app/api/app/announcement). Read when the home screen asks — never at render
 * time — and kept for CACHE_MS so opening the home screen again costs nothing. Fails quietly: no banner.
 */
export interface Announcement {
  id: string;
  title: string;
  excerpt: string;
  url: string;
}

// EASYGAS_SITE_ORIGIN: a local copy of the site (testing), as for the Pro app in lib/remote/runtime.ts
const source = (): string => `${process.env.EASYGAS_SITE_ORIGIN?.trim() || "https://easygaside.tech"}/api/app/announcement`;
const CACHE_MS = 30 * 60_000;
let cache: { at: number; value: Announcement | null } | null = null;

/** Only what a banner needs, only links into easygaside.tech. */
export function parseAnnouncement(raw: unknown): Announcement | null {
  const a = (raw as { announcement?: Record<string, unknown> } | null)?.announcement;
  if (!a || typeof a.id !== "string" || typeof a.title !== "string" || typeof a.url !== "string") return null;
  if (!/^https:\/\/easygaside\.tech\/[\w\-/]*$/.test(a.url)) return null;
  const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s);
  return {
    id: a.id.slice(0, 64),
    title: clip(a.title.trim(), 120),
    excerpt: clip(typeof a.excerpt === "string" ? a.excerpt.trim() : "", 200),
    url: a.url,
  };
}

export async function latestAnnouncement(): Promise<Announcement | null> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  try {
    const res = await fetch(source(), { signal: AbortSignal.timeout(6000), cache: "no-store" });
    const value = res.ok ? parseAnnouncement(await res.json()) : null;
    cache = { at: Date.now(), value };
    return value;
  } catch {
    cache = { at: Date.now(), value: null };
    return null;
  }
}
