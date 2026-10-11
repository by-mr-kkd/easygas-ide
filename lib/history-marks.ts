/**
 * The notes that stand in for bulky tool payloads when old history is sent back to a model
 * (lib/messages.ts compaction), and the check that keeps a model from writing one of them into a file.
 * A model that skips read_project sometimes copies the note as the file's new content (Gemini 3 did it
 * to a 24,797-character Index.html on 2026-10-11), wiping the real code. Pure, so it is unit-tested.
 */

export const fileCutNote = (chars: number): string => `<โค้ดถูกตัดจากประวัติ (${chars} ตัวอักษร) — เรียก read_project เพื่อดูโค้ดล่าสุด>`;
export const editCutNote = (chars: number): string => `<ตัด ${chars} ตัวอักษร>`;
export const RESULT_CUT_TAIL = " …<ตัดส่วนที่เหลือ>";

const NOTE_RE = /<โค้ดถูกตัดจากประวัติ \(\d[\d,]* ตัวอักษร\)|<ตัด \d[\d,]* ตัวอักษร>|…<ตัดส่วนที่เหลือ>/;

/** The text carries a history note instead of real code. */
export function hasHistoryNote(text: string): boolean {
  return NOTE_RE.test(text);
}

/** What the tool answers instead of writing: the model must fetch the real code first. */
export const HISTORY_NOTE_REFUSAL =
  "ไม่ได้บันทึก: เนื้อหาที่ส่งมามีข้อความแทนโค้ดจากประวัติแชต (เช่น <โค้ดถูกตัดจากประวัติ …>) ไม่ใช่โค้ดจริง " +
  "ไฟล์เดิมยังอยู่ครบ เรียก read_project เพื่ออ่านโค้ดล่าสุดก่อน แล้วค่อย write_file/edit_file ด้วยโค้ดจริงทั้งหมด";
