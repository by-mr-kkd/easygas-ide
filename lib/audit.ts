import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import type { AuditItem, AuditState } from "@/lib/audit-items";
import { projectDir } from "@/lib/local/paths";

/** Where an imported project's "วิเคราะห์โค้ด" result lives: next to project.json, one per project. */
const auditPath = (projectId: string): string => join(projectDir(projectId), "audit.json");

export async function readAudit(projectId: string): Promise<AuditState | null> {
  try {
    const s = JSON.parse(await readFile(auditPath(projectId), "utf8")) as Partial<AuditState>;
    if ((s.status !== "done" && s.status !== "dismissed") || !Array.isArray(s.items)) return null;
    return { status: s.status, at: String(s.at ?? ""), items: s.items as AuditItem[] };
  } catch {
    return null; // none yet (or unreadable: offer the analysis again)
  }
}

export async function saveAudit(projectId: string, state: AuditState): Promise<void> {
  await writeFile(auditPath(projectId), JSON.stringify(state, null, 2), "utf8");
}
