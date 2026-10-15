/**
 * Gate 2, part two — "ลองเรียกฟังก์ชัน": after the live page opens, the app has the picked AI name a few SAFE server
 * functions with realistic arguments, calls each one on the deployed app through the self-diagnostics runner
 * (gas-codegen SELF_DIAG: `__egsfn` / `__egsargs`, Logger output captured) and hands every failure — message, stack
 * line, the logs before it — to the repair turn. That is how an AI that has no tools of its own (a CLI engine)
 * still gets to run the code and read its error log. The pure parts live in lib/smoke-plan.ts (tested).
 */
import { askPicked } from "@/lib/share/describe";
import { runFunctionProbe } from "@/lib/gas-verify";
import { parseSmokePlan, SMOKE_MAX_CALLS, type SmokeCall, type SmokeOutcome } from "@/lib/smoke-plan";
import type { EgsProject } from "@/types/db";

export { parseSmokePlan, smokeFailureText, smokeSummary, SMOKE_MAX_CALLS, type SmokeCall, type SmokeOutcome } from "@/lib/smoke-plan";

const PLAN_SYSTEM = `คุณเป็นผู้ทดสอบระบบ Google Apps Script ที่เผยแพร่แล้ว หน้าที่: เลือกฟังก์ชันฝั่ง server (ไฟล์ .gs) ที่ "ปลอดภัยที่จะเรียกทดสอบ" ไม่เกิน ${SMOKE_MAX_CALLS} ฟังก์ชัน พร้อมอาร์กิวเมนต์ที่สมจริง
- ปลอดภัย = อ่านอย่างเดียว หรือเรียกซ้ำได้โดยไม่ทิ้งร่องรอย (เช่น getSettings, listItems, getDashboard, searchX, getReport) — ห้ามฟังก์ชันที่เขียน/ลบ/ส่งอีเมล/ส่ง LINE/ตั้ง trigger/สร้างชีต/เข้าสู่ระบบ/เปลี่ยนรหัส
- เรียกเฉพาะฟังก์ชันที่หน้าเว็บเรียกผ่าน google.script.run จริง ๆ (ชื่อไม่มี _ ท้าย) ถ้าฟังก์ชันต้องการ token/session ที่ไม่มีทางได้ ให้ข้าม
- อาร์กิวเมนต์เป็น JSON ล้วน (string/number/boolean/object/array) ตามลำดับพารามิเตอร์ ใช้ค่าที่น่าจะมีอยู่จริงหรือค่าว่างที่ฟังก์ชันรับได้
- ตอบเป็น JSON อย่างเดียว รูปแบบ {"calls":[{"fn":"ชื่อฟังก์ชัน","args":[...],"why":"ทดสอบอะไร (ไทย สั้น ๆ)"}]} ไม่มีข้อความอื่น ถ้าไม่มีฟังก์ชันที่ปลอดภัยเลย ตอบ {"calls":[]}`;

const PER_FILE = 8000;
const TOTAL = 60_000;

function filesBlock(files: { path: string; content: string }[]): string {
  let budget = TOTAL;
  const parts: string[] = [];
  for (const f of files.filter((f) => /\.(gs|js|html)$/i.test(f.path))) {
    if (budget <= 0) {
      parts.push(`--- ${f.path} (ตัดออกเพราะยาว)`);
      continue;
    }
    const body = f.content.slice(0, Math.min(PER_FILE, budget));
    budget -= body.length;
    parts.push(`--- ${f.path}\n${body}${body.length < f.content.length ? "\n…(ตัด)" : ""}`);
  }
  return parts.join("\n\n");
}

/** Ask the AI picked in the chat which functions to try. Empty when it names none (or cannot answer). */
export async function planSmokeCalls(project: EgsProject, files: { path: string; content: string }[]): Promise<SmokeCall[]> {
  try {
    const user = `ชื่อโปรเจกต์: ${project.name}\n\nไฟล์ในโปรเจกต์:\n${filesBlock(files)}`;
    return parseSmokePlan(await askPicked(project, PLAN_SYSTEM, user, project.ai ?? null));
  } catch (e) {
    console.error("[smoke] plan failed (non-fatal):", e);
    return [];
  }
}

/** Call each planned function on the live app, in order; never throws. */
export async function runSmokeCalls(execUrl: string, calls: SmokeCall[]): Promise<SmokeOutcome[]> {
  const out: SmokeOutcome[] = [];
  for (const call of calls) {
    const result = await runFunctionProbe(execUrl, call.fn, call.args);
    out.push({ call, result });
    if (result.unsupported) break; // the app has no runner: the rest would say the same
  }
  return out;
}
