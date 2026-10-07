/**
 * "วิเคราะห์โค้ด" findings for a script the user imported: the critic's audit-mode issues, kept with the
 * project so the user can read them, tick the ones to fix, and send those to the AI. Pure (no IO), so
 * the client and the tests both use it.
 */

export type AuditSeverity = "high" | "medium" | "low";

export interface AuditItem {
  id: string;
  file: string;
  line?: number;
  severity: AuditSeverity;
  title: string;
  problem: string;
  fix: string;
  benefit: string;
  /** when the user sent it to the AI to fix */
  sentAt?: string;
}

export interface AuditState {
  /** dismissed = the user said no to the offer; done = an analysis finished (items may be empty) */
  status: "dismissed" | "done";
  at: string;
  items: AuditItem[];
  /** which AI produced it, e.g. "Codex · gpt-6-astra" (absent on older files) */
  by?: string;
}

interface IssueLike {
  file: string;
  line?: number;
  severity: AuditSeverity;
  problem: string;
  fix: string;
  title?: string;
  benefit?: string;
}

const RANK: Record<AuditSeverity, number> = { high: 0, medium: 1, low: 2 };
const TITLE_MAX = 80;

function shorten(s: string, max: number): string {
  const one = s.replace(/\s+/g, " ").trim();
  return one.length <= max ? one : `${one.slice(0, max - 1).trimEnd()}…`;
}

/** Critic issues → numbered findings, most severe first (stable within a severity). */
export function toAuditItems(issues: IssueLike[]): AuditItem[] {
  return issues
    .map((i, n) => ({ i, n }))
    .sort((a, b) => RANK[a.i.severity] - RANK[b.i.severity] || a.n - b.n)
    .map(({ i }, n) => ({
      id: `a${n + 1}`,
      file: i.file,
      ...(i.line ? { line: i.line } : {}),
      severity: i.severity,
      title: shorten(i.title || i.problem, TITLE_MAX),
      problem: i.problem,
      fix: i.fix,
      benefit: i.benefit ?? "",
    }));
}

const where = (i: AuditItem): string => (i.line ? `${i.file} บรรทัด ${i.line}` : i.file);

/** The chat message that asks the AI to fix exactly the picked findings and nothing else. */
export function buildAuditFixPrompt(items: AuditItem[]): string {
  const list = items.map((i, n) =>
    [`${n + 1}. ${i.title} (${where(i)})`, `   ปัญหา: ${i.problem}`, i.fix && `   แนวทางแก้: ${i.fix}`].filter(Boolean).join("\n"),
  );
  return (
    `แก้โค้ดตามผลวิเคราะห์ เฉพาะ ${items.length} ข้อที่เลือกต่อไปนี้ แก้ให้น้อยที่สุด ไม่แตะส่วนอื่น ` +
    `แล้วสรุปสั้น ๆ ว่าแต่ละข้อแก้อะไร:\n\n${list.join("\n\n")}`
  );
}
