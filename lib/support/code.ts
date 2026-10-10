/**
 * Fast Track: a project's code attached to a support question (pure; the server side reads the files).
 * Everything but the project's own dot files travels, credentials masked (lib/share/scan.ts), within the
 * limits premium-support checks again: 60 files, 200 KB a file, 600 KB in all.
 */
import { redactCredentials } from "../share/scan.ts";

export type CodeAttachment = { project: string; files: { name: string; source: string }[]; redacted: number };

export const ATTACH_LIMITS = { files: 60, fileBytes: 200_000, bytes: 600_000 } as const;

export class AttachRefusal extends Error {}

const utf8Bytes = (s: string): number => new TextEncoder().encode(s).length;

export function buildAttachment(project: string, files: { path: string; content: string }[]): CodeAttachment {
  const out: CodeAttachment["files"] = [];
  let bytes = 0;
  let redacted = 0;
  const sorted = [...files].sort((a, b) => a.path.localeCompare(b.path));
  for (const f of sorted) {
    if (f.path.split("/").some((part) => part.startsWith("."))) continue;
    const { text, count } = redactCredentials(f.content.replace(/\r\n?/g, "\n"));
    const size = utf8Bytes(text);
    if (size > ATTACH_LIMITS.fileBytes) throw new AttachRefusal(`ไฟล์ ${f.path} ใหญ่เกิน ${ATTACH_LIMITS.fileBytes / 1000} KB แนบไม่ได้ ลองอธิบายเป็นข้อความแทน`);
    bytes += size;
    redacted += count;
    out.push({ name: f.path, source: text });
  }
  if (out.length === 0) throw new AttachRefusal("โปรเจกต์นี้ยังไม่มีโค้ดให้แนบ");
  if (out.length > ATTACH_LIMITS.files) throw new AttachRefusal(`แนบโค้ดได้ไม่เกิน ${ATTACH_LIMITS.files} ไฟล์`);
  if (bytes > ATTACH_LIMITS.bytes) throw new AttachRefusal(`โค้ดรวมใหญ่เกิน ${ATTACH_LIMITS.bytes / 1000} KB แนบไม่ได้`);
  return { project: project.trim().slice(0, 120) || "โปรเจกต์", files: out, redacted };
}
