/**
 * What the phone's notification says when an AI turn started from it ends (pure — tests/remote-notice.test.ts).
 * The AI's own last words decide between "finished" and "asks you something".
 */

export interface TurnNotice {
  title: string;
  body: string;
}

const MAX_BODY = 140;

/** A Thai or English question at the end of the AI's answer. */
const QUESTION_END = /(\?|？|(ไหม|มั้ย|หรือเปล่า|หรือไม่|ดีไหม|ได้ไหม|ใช่ไหม)\s*(ครับ|คะ|ค่ะ|นะครับ|นะคะ)?\s*[.!…]*)$/;

function lastParagraph(text: string): string {
  const parts = text
    .replace(/\r/g, "")
    .split(/\n{2,}/)
    .map((p) => p.replace(/[*_`#>]+/g, "").replace(/\s+/g, " ").trim())
    .filter(Boolean);
  return parts[parts.length - 1] ?? "";
}

const clip = (s: string): string => (s.length > MAX_BODY ? `${s.slice(0, MAX_BODY - 1)}…` : s);

export function turnNotice(projectName: string, aiText: string, failed: boolean): TurnNotice {
  const title = projectName.trim().slice(0, 60) || "EasyGAS IDE";
  if (failed) return { title, body: "AI ทำไม่สำเร็จ เปิดดูรายละเอียดในแชต" };
  const last = lastParagraph(aiText);
  if (last && QUESTION_END.test(last)) return { title, body: clip(`AI ถาม: ${last}`) };
  return { title, body: "AI ทำเสร็จแล้ว กดเพื่อดูผลและพรีวิว" };
}

export function verifyNotice(projectName: string, ok: boolean | null): TurnNotice {
  const title = projectName.trim().slice(0, 60) || "EasyGAS IDE";
  if (ok === null) return { title, body: "ทดสอบรันจริงจบแล้ว เปิดดูผลในแชต" };
  return { title, body: ok ? "ทดสอบรันจริงผ่าน แอปใช้งานได้" : "ทดสอบรันจริงเจอปัญหา เปิดดูว่าต้องแก้อะไร" };
}
