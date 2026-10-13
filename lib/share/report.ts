/**
 * "แจ้งปัญหา" and "รีวิว" from a cloned project, pure: the exact text that goes to the share's owner, built
 * and checked here so the dialog previews what is sent, and refused (like a share) when it carries a key.
 */
import { redactCredentials, scanShare, type Finding } from "./scan.ts";

export const ISSUE_LIMITS = { title: [3, 140], body: 4000, errors: 2000, changedFiles: 60 } as const;
export const REVIEW_MAX = 1000;

const clean = (s: unknown, max: number): string =>
  String(s ?? "")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .trim()
    .slice(0, max);

export type IssueDraft = { title: string; what: string; steps: string; error: string };
export type IssuePayload = { title: string; body: string; version: number | null; details: { changedFiles: string[]; errors: string } };

/** The report as the website takes it: the two text parts joined under Thai headings, the files by name only. */
export function composeIssue(d: IssueDraft, version: number | null, changedFiles: string[]): IssuePayload {
  const what = clean(d.what, 2500);
  const steps = clean(d.steps, 1400);
  const body = [what && `เกิดอะไรขึ้น:\n${what}`, steps && `ทำอะไรก่อนเจอ:\n${steps}`].filter(Boolean).join("\n\n").slice(0, ISSUE_LIMITS.body);
  return {
    title: clean(d.title, ISSUE_LIMITS.title[1]),
    body,
    version,
    details: { changedFiles: changedFiles.slice(0, ISSUE_LIMITS.changedFiles).map((f) => f.slice(0, 100)), errors: clean(d.error, ISSUE_LIMITS.errors) },
  };
}

/** What is wrong with a report before it can go (Thai), or null. */
export function issueProblem(p: IssuePayload): string | null {
  if (p.title.length < ISSUE_LIMITS.title[0]) return "ใส่หัวข้อสั้น ๆ อย่างน้อย 3 ตัวอักษร";
  if (!p.body) return "เล่าว่าเกิดอะไรขึ้น";
  const b = textFindings([p.title, p.body, p.details.errors].join("\n"))[0];
  return b ? `พบ ${b.kind} ในข้อความ — เอาออกก่อนส่ง (ข้อความนี้ทุกคนที่เปิดลิงก์อ่านได้)` : null;
}

/** Credentials in free text (the share scanner's "block" rules). */
export function textFindings(text: string): Finding[] {
  return scanShare([{ name: "message.txt", source: text }]).blocked;
}

/** An error the user pasted often carries a key in a URL: offer the masked copy instead of refusing outright. */
export const maskError = (text: string): string => redactCredentials(text).text;

export function reviewProblem(stars: number, body: string): string | null {
  if (!Number.isInteger(stars) || stars < 1 || stars > 5) return "เลือกจำนวนดาว 1–5";
  const b = textFindings(body)[0];
  return b ? `พบ ${b.kind} ในข้อความ — เอาออกก่อนส่ง` : null;
}

export const cleanText = clean;
