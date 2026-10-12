/**
 * Build gate: a project with no code yet is a conversation until the user says "go". Until then the AI
 * may talk, ask and summarise, but the APP refuses every file write (all engines: executeEgsTool for the
 * API / Codex / Muse engines, a read-only tool list for Claude Code). "Go" = an app button that sends with
 * `build: true` (เริ่มสร้างเลย, สร้างตามนี้, the demo choices) or a typed confirmation (`isGoMessage`).
 * A project that already has code is not gated: edits there are requests in themselves.
 */

/** Typed approval: "สร้างเลย", "เขียนเลย", "ลุยเลย", "ยืนยัน …" ("เลย์เอาต์" is not "เลย"). A bare "โอเค" is
 *  not one: it is usually the answer to the AI's last question. */
const GO = new RegExp(
  [
    "(สร้าง|เขียน|ทำ|เริ่ม|ลุย|จัด|เอา)(ได้)?เลย(?!์)",
    "เริ่ม(สร้าง|เขียน)",
    "อนุมัติ",
    "เอาตามนี้",
    "ตามนี้เลย",
    "^ยืนยัน",
    "\\b(go ahead|build it|start building)\\b",
  ].join("|"),
  "i",
);

/** "ยังไม่ต้องสร้างเลย", "อย่าเพิ่งเขียน", "ไม่ต้องทำเลย" — a go word that is negated. */
const NEGATED = /(ไม่ต้อง|ยังไม่(ต้อง)?|อย่า(เพิ่ง)?|ห้าม|ไม่อยากให้)\s*(รีบ)?\s*(สร้าง|เขียน|ทำ|เริ่ม|ลุย|อนุมัติ|ยืนยัน)|\b(don'?t|do not|not yet)\b/i;

export function isGoMessage(text: string): boolean {
  const t = text.trim().replace(/\s+/g, " ");
  if (!t) return false;
  return GO.test(t) && !NEGATED.test(t);
}

/** May this turn write files? */
export function buildAllowed(input: { hasCode: boolean; go: boolean; message: string }): boolean {
  return input.hasCode || input.go || isGoMessage(input.message);
}

/** Rides on the turn message (every engine) while the gate is shut. */
export const PLAN_ONLY_BLOCK = `## ยังไม่ได้รับอนุมัติให้เขียนโค้ด (แอปล็อกไว้)
โปรเจกต์นี้ยังไม่มีโค้ด และผู้ใช้ยังไม่ได้กดอนุมัติ รอบนี้แอปปิดการเขียนไฟล์ทุกแบบ (เขียน/แก้/ลบไฟล์จะถูกปฏิเสธ)
- คุยต่อ ตอบคำถาม ถามสิ่งที่ยังไม่ชัด หรือสรุปสิ่งที่จะสร้าง (ชื่อระบบ ฟีเจอร์หลัก ข้อมูลที่เก็บ เก็บที่ไหน ผลลัพธ์) ให้กระชับ
- ห้ามบอกว่ากำลังเขียนหรือเขียนเสร็จแล้ว และห้ามพิมพ์โค้ดทั้งไฟล์ลงในแชตแทนการเขียนไฟล์
- ปิดท้ายด้วยบรรทัดเดียว: ถ้าตรงใจแล้ว กดปุ่ม "สร้างตามนี้" ใต้แชต หรือพิมพ์ว่า "สร้างเลย" ถ้ายังไม่ตรง บอกสิ่งที่อยากแก้ได้เลย`;

/** What the AI hears when it tries to write anyway. */
export const PLAN_ONLY_REFUSAL =
  "แอปปฏิเสธ: ผู้ใช้ยังไม่ได้อนุมัติให้เริ่มเขียนโค้ด รอบนี้เขียนไฟล์ไม่ได้ ให้สรุปสิ่งที่จะสร้างเป็นข้อความ แล้วบอกผู้ใช้ให้กด \"สร้างตามนี้\" หรือพิมพ์ \"สร้างเลย\"";

// The turn's gate, keyed by project. One run per project at a time (agent-lock), so a set is enough;
// kept on globalThis so every server bundle that loads this module sees the same set.
const KEY = "__egsPlanOnly";
function planning(): Set<string> {
  const g = globalThis as unknown as Record<string, Set<string> | undefined>;
  return (g[KEY] ??= new Set<string>());
}
export function setPlanOnly(projectId: string, on: boolean): void {
  if (on) planning().add(projectId);
  else planning().delete(projectId);
}
export function isPlanOnly(projectId: string): boolean {
  return planning().has(projectId);
}
