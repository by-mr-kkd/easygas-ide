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

export async function describeProject(projectId: string, requested: unknown): Promise<string> {
  const project = await getProject(projectId);
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  const files = await getFiles(projectId);
  if (!files.length) throw new ShareRefusal("โปรเจกต์ยังไม่มีโค้ดให้สรุป");
  const choice = await resolveChoice(project, sanitizeChoice(requested));
  const user = request(project.name, files.map((f) => ({ path: f.path, content: f.content })));
  let text: string;
  if (isCliEngine(choice.engine)) {
    const prompt = `${SYSTEM}\n\n=====\nคุณไม่ต้องใช้เครื่องมือใด ๆ ทุกอย่างอยู่ในข้อความนี้แล้ว\n\n${user}`;
    text =
      choice.engine === "muse-cli"
        ? await museOneShot(projectId, prompt, choice.model)
        : choice.engine === "codex-cli"
          ? await codexOneShot(projectId, prompt, choice.model)
          : await claudeOneShot(projectId, prompt, choice.model);
  } else {
    text = await askApiText(project, SYSTEM, user);
  }
  const out = cleanDescription(text);
  if (!out) throw new ShareRefusal("AI ตอบกลับว่าง ลองใหม่อีกครั้ง หรือพิมพ์เอง");
  return out;
}
