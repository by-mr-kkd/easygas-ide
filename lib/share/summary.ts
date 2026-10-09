/**
 * The website's public list of shares (GET /api/share), as the app shows it on "ระบบที่คนแชร์" and on
 * the home screen: no sources, one line of description. Pure: parses another server's answer field by
 * field (lib/share/payload.ts does the same for one share).
 */
import { ShareRefusal } from "./payload.ts";

export type ShareSummary = {
  slug: string;
  title: string;
  description: string;
  author: { name: string; kind: "guest" | "pro" | "admin" };
  fileCount: number;
  services: string[];
  /** its front page is on GitHub Pages: only Pro can clone it (the website checks at clone time) */
  proOnly: boolean;
  cloneCount: number;
  url: string;
  createdAt: string;
};

const SLUG_RE = /^[a-z0-9]{6,16}$/;
const str = (v: unknown, max: number): string => (typeof v === "string" ? v.slice(0, max) : "");

export function parseShareSummaries(raw: unknown): ShareSummary[] {
  const list = ((raw ?? {}) as { shares?: unknown }).shares;
  if (!Array.isArray(list)) throw new ShareRefusal("คำตอบจากเว็บไซต์ไม่ถูกต้อง");
  const out: ShareSummary[] = [];
  for (const item of list) {
    const s = (item ?? {}) as Record<string, unknown>;
    const slug = str(s.slug, 16);
    if (!SLUG_RE.test(slug)) continue;
    const author = (s.author ?? {}) as { name?: unknown; kind?: unknown };
    out.push({
      slug,
      title: str(s.title, 120) || "ระบบที่แชร์",
      description: str(s.description, 400),
      author: { name: str(author.name, 40) || "ไม่ระบุชื่อ", kind: author.kind === "pro" || author.kind === "admin" ? author.kind : "guest" },
      fileCount: Math.max(0, Number(s.fileCount) || 0),
      services: Array.isArray(s.services) ? s.services.filter((x): x is string => typeof x === "string").slice(0, 12) : [],
      proOnly: s.proOnly === true || s.hosting === "github",
      cloneCount: Math.max(0, Number(s.cloneCount) || 0),
      url: /^https:\/\/[a-z0-9.-]+\/s\/[a-z0-9]{6,16}$/.test(str(s.url, 200)) ? str(s.url, 200) : "",
      createdAt: str(s.createdAt, 40),
    });
    if (out.length >= 100) break;
  }
  return out;
}

/** "9 ต.ค." for a card; empty when the date does not parse. Server-side only, so one locale everywhere. */
export function shareDateLabel(iso: string): string {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short" });
}
