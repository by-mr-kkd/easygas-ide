/**
 * "ใช้งานผ่านอะไร" — the one question a new project answers (pure — unit-tested in tests/project-use.test.ts).
 * It folds two settings into the three combinations the app supports:
 *
 *   google  standalone script (kind "webapp"), front page on Google          — free
 *   sheet   script inside a Google Sheet (kind "bound"), reads it with getActiveSpreadsheet()
 *   github  standalone script, front page on the user's GitHub Pages          — Pro (lib/pages)
 *
 * The AI must know the kind before its first line (getActiveSpreadsheet vs a sheet opened by id), so it is
 * picked when the project is made. It can still change until Google holds the script; after that, or for a
 * script that came from Google or a share link, the kind is fixed. Front page google ↔ github may change on
 * a standalone script at any time (the publish flow already allows it).
 */

export type ProjectUse = "google" | "sheet" | "github";
export type ProjectKindId = "webapp" | "bound";

export const USE_LIST: { id: ProjectUse; label: string; short: string; pro: boolean; hint: string }[] = [
  {
    id: "google",
    label: "ลิงก์หน้าเว็บของ Google",
    short: "ลิงก์ Google",
    pro: false,
    hint: "สคริปต์แยก ได้ลิงก์ script.google.com ให้คนเปิดใช้ ข้อมูลเก็บลงชีตที่ AI สร้างแล้วเปิดด้วยรหัสชีต",
  },
  {
    id: "sheet",
    label: "ในไฟล์ Google Sheet",
    short: "ในชีต",
    pro: false,
    hint: "โค้ดอยู่ในชีต อ่านเขียนชีตนั้นตรง ๆ (getActiveSpreadsheet) เพิ่มเมนูหรือปุ่มในชีตได้ มีหน้าเว็บด้วยก็ได้",
  },
  {
    id: "github",
    label: "ลิงก์ GitHub Pages · ติดตั้งเป็นแอป",
    short: "GitHub Pages",
    pro: true,
    hint: "สคริปต์แยก หน้าเว็บอยู่บน GitHub ของคุณ ติดตั้งเป็นแอปบนมือถือ แจ้งเตือนในแอป และใช้กล้องได้",
  },
];

export const useOf = (kind: string | null | undefined, hosting: string | null | undefined): ProjectUse =>
  kind === "bound" ? "sheet" : hosting === "github" ? "github" : "google";

export const kindOfUse = (use: ProjectUse): ProjectKindId => (use === "sheet" ? "bound" : "webapp");
export const hostingOfUse = (use: ProjectUse): "gas" | "github" => (use === "github" ? "github" : "gas");

export const isProjectUse = (v: unknown): v is ProjectUse => v === "google" || v === "sheet" || v === "github";

/** Why the KIND (standalone ↔ in a Sheet) can no longer change; null = it still can. */
export function kindLockReason(p: {
  origin?: string | null;
  script_id?: string | null;
  bound_sheet_id?: string | null;
}): string | null {
  if (p.origin === "imported") return "สคริปต์นี้ดึงมาจาก Google ชนิดเป็นไปตามต้นฉบับ";
  if (p.origin === "cloned") return "โปรเจกต์นี้โคลนจากลิงก์แชร์ ชนิดเป็นไปตามต้นฉบับ";
  if (p.script_id || p.bound_sheet_id) return "เผยแพร่ไปแล้ว สคริปต์อยู่บน Google แล้ว ย้ายระหว่างไฟล์แยกกับในชีตไม่ได้";
  return null;
}

/** Which uses can be picked now: the kind may be fixed, and GitHub Pages needs a standalone script. */
export function allowedUses(current: ProjectUse, lock: string | null): ProjectUse[] {
  if (!lock) return ["google", "sheet", "github"];
  return current === "sheet" ? ["sheet"] : ["google", "github"];
}

/** The chat text that asks the AI to rewrite the sheet access after the kind changed on a project with code. */
export function kindChangeMessage(to: ProjectKindId): string {
  return to === "bound"
    ? "เปลี่ยนโปรเจกต์นี้เป็นแบบผูกกับชีตแล้ว (โค้ดอยู่ในไฟล์ Google Sheet) แก้ส่วนที่เปิดชีตทั้งหมดให้ใช้ SpreadsheetApp.getActiveSpreadsheet() แทนการสร้างหรือเปิดชีตด้วยรหัส ส่วนอื่นคงไว้"
    : "เปลี่ยนโปรเจกต์นี้เป็นสคริปต์แยกแล้ว (ไม่ผูกกับชีตไหน) getActiveSpreadsheet() จะเป็น null แก้ส่วนที่เปิดชีตทั้งหมดให้สร้างหรือเปิดชีตเก็บข้อมูลเองแล้วจำรหัสไว้ ส่วนอื่นคงไว้";
}
