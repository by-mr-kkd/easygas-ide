/**
 * Shared code, pure: the project's files in the shape the website takes (`/api/share`), and the other way
 * round when a share is cloned. Mirrors the website's rules (EasyGAS-Site/lib/shares.ts checkFiles) so the
 * app refuses the same things before uploading, with the reason in Thai.
 */
import type { ShareFile } from "./scan.ts";

export class ShareRefusal extends Error {}

export const SHARE_LIMITS = { files: 60, bytes: 600_000, fileBytes: 200_000, title: [3, 120], description: 4000, name: [1, 40] } as const;
/** A flat Apps Script file name (no folders), as the website accepts it. */
const FILE_NAME_RE = /^[A-Za-z0-9_][A-Za-z0-9_. -]{0,80}\.(gs|js|html|json)$/;
/** Files the project keeps for itself; they never travel. */
const PRIVATE = new Set([".clasp.json", ".claspignore"]);

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

/** The project's files as a share payload. Throws ShareRefusal with what to fix. */
export function toShareFiles(files: { path: string; content: string }[]): ShareFile[] {
  const out: ShareFile[] = [];
  let bytes = 0;
  for (const f of files) {
    if (PRIVATE.has(f.path) || f.path.startsWith(".")) continue;
    if (f.path.includes("/")) throw new ShareRefusal(`ไฟล์ "${f.path}" อยู่ในโฟลเดอร์ย่อย — ลิงก์แชร์รองรับเฉพาะไฟล์ระดับบนสุด ย้ายออกมาก่อน`);
    if (!FILE_NAME_RE.test(f.path)) throw new ShareRefusal(`ชื่อไฟล์ "${f.path}" ใช้ไม่ได้ — แชร์ได้เฉพาะ .gs .js .html และ appsscript.json`);
    const size = utf8Bytes(f.content);
    if (size > SHARE_LIMITS.fileBytes) throw new ShareRefusal(`ไฟล์ ${f.path} ใหญ่เกิน ${SHARE_LIMITS.fileBytes / 1000} KB`);
    bytes += size;
    out.push({ name: f.path, source: f.content.replace(/\r\n?/g, "\n") });
  }
  if (out.length === 0) throw new ShareRefusal("ยังไม่มีโค้ดให้แชร์ ให้ AI สร้างระบบก่อน");
  if (out.length > SHARE_LIMITS.files) throw new ShareRefusal(`แชร์ได้ไม่เกิน ${SHARE_LIMITS.files} ไฟล์`);
  if (bytes > SHARE_LIMITS.bytes) throw new ShareRefusal(`โค้ดรวมใหญ่เกิน ${SHARE_LIMITS.bytes / 1000} KB`);
  if (!out.some((f) => f.name === "appsscript.json")) throw new ShareRefusal("ยังไม่มี appsscript.json — เผยแพร่หนึ่งครั้งก่อน หรือให้ AI สร้างไฟล์ตั้งค่า");
  if (!out.some((f) => /\.(gs|js)$/.test(f.name))) throw new ShareRefusal("ต้องมีไฟล์โค้ด (.gs) อย่างน้อย 1 ไฟล์");
  return out;
}

/** A share's files as project files: .js becomes .gs (the app works in .gs), names re-checked. */
export function fromShareFiles(files: unknown): { path: string; content: string }[] {
  if (!Array.isArray(files) || files.length === 0) throw new ShareRefusal("ลิงก์นี้ไม่มีไฟล์");
  const seen = new Set<string>();
  const out: { path: string; content: string }[] = [];
  for (const raw of files) {
    const f = (raw ?? {}) as { name?: unknown; source?: unknown };
    const name = typeof f.name === "string" ? f.name.trim() : "";
    if (!FILE_NAME_RE.test(name) || name.includes("..")) throw new ShareRefusal(`ไฟล์ในลิงก์มีชื่อที่ใช้ไม่ได้: ${name.slice(0, 40) || "(ว่าง)"}`);
    if (typeof f.source !== "string") throw new ShareRefusal(`ไฟล์ ${name} ในลิงก์ไม่มีเนื้อหา`);
    const path = name.replace(/\.js$/i, ".gs");
    if (seen.has(path.toLowerCase())) throw new ShareRefusal(`ไฟล์ซ้ำในลิงก์: ${path}`);
    seen.add(path.toLowerCase());
    out.push({ path, content: f.source });
  }
  if (!seen.has("appsscript.json")) throw new ShareRefusal("ลิงก์นี้ไม่มี appsscript.json");
  return out;
}

/** The manifest says web app → a "webapp" project, else "bound". */
export function kindOf(files: { path: string; content: string }[]): "webapp" | "bound" {
  const m = files.find((f) => f.path === "appsscript.json")?.content;
  try {
    return m && (JSON.parse(m) as { webapp?: unknown }).webapp ? "webapp" : "bound";
  } catch {
    return "bound";
  }
}

export type SharePublic = {
  slug: string;
  title: string;
  description: string;
  author: { name: string; kind: "guest" | "pro" | "admin" };
  files: ShareFile[];
  fileCount: number;
  bytes: number;
  scopes: string[];
  services: string[];
  warnings: { level: "block" | "warn"; kind: string; file: string; line: number; sample: string }[];
  version: number;
  parent: string | null;
  cloneCount: number;
  forks: { slug: string; title: string; author: string; cloneCount: number }[];
  url: string;
  createdAt: string;
  updatedAt: string;
};

const str = (v: unknown, max = 4000): string => (typeof v === "string" ? v.slice(0, max) : "");
const strs = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").slice(0, 40) : []);

/** The website's answer, checked field by field (it is another server's data). */
export function parseSharePublic(raw: unknown): SharePublic {
  const s = ((raw ?? {}) as { share?: unknown }).share as Record<string, unknown> | undefined;
  if (!s || typeof s !== "object") throw new ShareRefusal("คำตอบจากเว็บไซต์ไม่ถูกต้อง");
  const slug = str(s.slug, 16);
  if (!/^[a-z0-9]{6,16}$/.test(slug)) throw new ShareRefusal("คำตอบจากเว็บไซต์ไม่ถูกต้อง");
  const author = (s.author ?? {}) as { name?: unknown; kind?: unknown };
  const kind = author.kind === "pro" || author.kind === "admin" ? author.kind : "guest";
  const files = fromShareFiles(s.files).map((f) => ({ name: f.path, source: f.content }));
  const warnings = Array.isArray(s.warnings)
    ? s.warnings
        .filter((w): w is Record<string, unknown> => !!w && typeof w === "object")
        .map((w) => ({ level: w.level === "block" ? ("block" as const) : ("warn" as const), kind: str(w.kind, 80), file: str(w.file, 100), line: Number(w.line) || 0, sample: str(w.sample, 40) }))
        .slice(0, 50)
    : [];
  const forks = Array.isArray(s.forks)
    ? s.forks
        .filter((f): f is Record<string, unknown> => !!f && typeof f === "object" && /^[a-z0-9]{6,16}$/.test(str(f.slug, 16)))
        .map((f) => ({ slug: str(f.slug, 16), title: str(f.title, 120), author: str(f.author, 40), cloneCount: Number(f.cloneCount) || 0 }))
        .slice(0, 20)
    : [];
  return {
    slug,
    title: str(s.title, 120) || "ระบบที่แชร์",
    description: str(s.description),
    author: { name: str(author.name, 40) || "ไม่ระบุชื่อ", kind },
    files,
    fileCount: files.length,
    bytes: Number(s.bytes) || files.reduce((n, f) => n + utf8Bytes(f.source), 0),
    scopes: strs(s.scopes),
    services: strs(s.services),
    warnings,
    version: Math.max(1, Number(s.version) || 1),
    parent: /^[a-z0-9]{6,16}$/.test(str(s.parent, 16)) ? str(s.parent, 16) : null,
    cloneCount: Number(s.cloneCount) || 0,
    forks,
    url: /^https:\/\/[a-z0-9.-]+\/s\/[a-z0-9]{6,16}$/.test(str(s.url, 200)) ? str(s.url, 200) : "",
    createdAt: str(s.createdAt, 40),
    updatedAt: str(s.updatedAt, 40),
  };
}
