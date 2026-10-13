import { isCliEngine, sanitizeChoice } from "@/lib/ai-choice";
import { resolveChoice } from "@/lib/ai-options";
import { askApiText } from "@/lib/critic";
import { claudeOneShot } from "@/lib/engines/claude-cli";
import { codexOneShot } from "@/lib/engines/codex-cli";
import { museOneShot } from "@/lib/engines/muse-cli";
import { getFiles } from "@/lib/files";
import { getProject } from "@/lib/projects";
import { cleanDescription } from "./describe-text";
import { ShareRefusal } from "./payload";
import { classifyFiles, unifiedDiff } from "./merge";
import { baseFilesOf } from "./source";
import type { EgsProject } from "@/types/db";

/**
 * The share dialog's "ให้ AI สรุป": a short Thai description of a project for its share page, written by the AI
 * picked in the chat (a CLI pick through its CLI, one question, no session; an API pick through its key). Only
 * the code goes in; the answer is plain text, trimmed, and the user still edits it before anything is sent.
 */

const PER_FILE = 6000;
const TOTAL = 40_000;

const SYSTEM = `คุณเขียนคำอธิบายสั้นสำหรับหน้าแชร์โค้ด Google Apps Script ให้คนอื่นโคลนไปใช้
- ภาษาไทย 2–4 ประโยค ข้อความล้วน ไม่มีหัวข้อ ไม่มี markdown ไม่มีอีโมจิ ไม่เกิน 400 ตัวอักษร
- บอกว่า ระบบทำอะไร ใช้กับงานแบบไหน และหลังโคลนต้องตั้งค่าอะไรเอง (เช่น ใส่ token ใน Script Properties หรือเตรียม Google Sheet) ถ้าไม่ต้องตั้งค่าอะไร บอกว่ากดเผยแพร่ใช้ได้เลย
- ห้ามใส่ชื่อคน อีเมล เบอร์โทร ID ของไฟล์หรือชีต หรือคีย์ใด ๆ ที่เห็นในโค้ด
- ตอบเฉพาะคำอธิบาย ไม่ต้องมีคำนำ`;

function request(name: string, files: { path: string; content: string }[]): string {
  let budget = TOTAL;
  const parts: string[] = [];
  for (const f of files) {
    if (budget <= 0) {
      parts.push(`--- ${f.path} (ตัดออกเพราะยาว)`);
      continue;
    }
    const body = f.content.slice(0, Math.min(PER_FILE, budget));
    budget -= body.length;
    parts.push(`--- ${f.path}\n${body}${body.length < f.content.length ? "\n…(ตัด)" : ""}`);
  }
  return `ชื่อโปรเจกต์: ${name}\n\nไฟล์ในโปรเจกต์:\n${parts.join("\n\n")}`;
}

/** One question to the AI picked in the chat (a CLI pick through its CLI, no session; an API pick through its key). */
async function askPicked(project: EgsProject, system: string, user: string, requested: unknown): Promise<string> {
  const choice = await resolveChoice(project, sanitizeChoice(requested));
  if (isCliEngine(choice.engine)) {
    const prompt = `${system}\n\n=====\nคุณไม่ต้องใช้เครื่องมือใด ๆ ทุกอย่างอยู่ในข้อความนี้แล้ว\n\n${user}`;
    return choice.engine === "muse-cli"
      ? museOneShot(project.id, prompt, choice.model)
      : choice.engine === "codex-cli"
        ? codexOneShot(project.id, prompt, choice.model)
        : claudeOneShot(project.id, prompt, choice.model);
  }
  return askApiText(project, system, user);
}

export async function describeProject(projectId: string, requested: unknown): Promise<string> {
  const project = await getProject(projectId);
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  const files = await getFiles(projectId);
  if (!files.length) throw new ShareRefusal("โปรเจกต์ยังไม่มีโค้ดให้สรุป");
  const user = request(project.name, files.map((f) => ({ path: f.path, content: f.content })));
  const out = cleanDescription(await askPicked(project, SYSTEM, user, requested));
  if (!out) throw new ShareRefusal("AI ตอบกลับว่าง ลองใหม่อีกครั้ง หรือพิมพ์เอง");
  return out;
}

const CHANGES_SYSTEM = `คุณสรุปว่าโปรเจกต์ Google Apps Script นี้เปลี่ยนอะไรจากต้นฉบับที่โคลนมา สำหรับหน้าแชร์ (ทางแยกของต้นฉบับ)
- ภาษาไทย ข้อความล้วน 1–5 บรรทัด ขึ้นต้นแต่ละบรรทัดด้วย "- " ไม่มีหัวข้อ ไม่มีอีโมจิ ไม่เกิน 500 ตัวอักษร
- บอกสิ่งที่ผู้ใช้เห็นหรือใช้ได้ต่างไป (ฟีเจอร์ที่เพิ่ม ที่แก้ ที่เอาออก) ไม่ต้องบอกชื่อตัวแปรหรือบรรทัด
- ห้ามใส่ชื่อคน อีเมล เบอร์โทร ID ของไฟล์หรือชีต หรือคีย์ใด ๆ ที่เห็นในโค้ด
- ตอบเฉพาะรายการ ไม่ต้องมีคำนำ`;

/** "ให้ AI สรุป" for a fork's "what changed": the diffs against the version it was cloned from. */
export async function describeChanges(projectId: string, requested: unknown): Promise<string> {
  const project = await getProject(projectId);
  const c = project?.cloned_from;
  if (!project || !c?.slug) throw new ShareRefusal("โปรเจกต์นี้ไม่ได้โคลนมาจากลิงก์แชร์");
  const base = await baseFilesOf(projectId, c.slug, c.version).catch(() => null);
  if (!base) throw new ShareRefusal("หาโค้ดต้นฉบับที่โคลนมาไม่เจอ พิมพ์สรุปเองได้เลย");
  const mine = (await getFiles(projectId)).map((f) => ({ path: f.path, content: f.content }));
  const parts: string[] = [];
  let budget = TOTAL;
  for (const p of classifyFiles(base.files, mine, base.files)) {
    if (p.cls !== "take" || budget <= 0) continue;
    const d = p.base === null ? `(ไฟล์ใหม่)
${(p.latest ?? "").slice(0, PER_FILE)}` : p.latest === null ? "(ลบไฟล์นี้)" : unifiedDiff(p.base, p.latest).slice(0, PER_FILE);
    budget -= d.length;
    parts.push(`--- ${p.path}
${d}`);
  }
  if (!parts.length) throw new ShareRefusal("โค้ดยังเหมือนต้นฉบับ ยังไม่มีอะไรให้สรุป");
  const user = `ต้นฉบับ: ${c.title}
โปรเจกต์นี้: ${project.name}

สิ่งที่เปลี่ยนจากต้นฉบับ (diff):
${parts.join("\n\n")}`;
  const out = cleanDescription(await askPicked(project, CHANGES_SYSTEM, user, requested)).replace(/^\s*[•*]\s*/gm, "- ");
  if (!out) throw new ShareRefusal("AI ตอบกลับว่าง ลองใหม่อีกครั้ง หรือพิมพ์เอง");
  return out;
}
