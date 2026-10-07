/**
 * New-project brief — the structured answers from the start-up wizard (pure — unit-tested).
 *
 * The wizard asks one topic per round with a recommended option. The answers are stored on the project
 * (not just flattened into a chat message) so the app can pick rule cards from them deterministically
 * (briefFeatureIds → lib/rulebook/select) instead of hoping the model notices a keyword.
 */

export interface BriefOption {
  id: string;
  label: string;
  hint: string;
  recommended?: boolean;
}

export const PURPOSES: BriefOption[] = [
  { id: "form", label: "ฟอร์มเก็บข้อมูล", hint: "ลงทะเบียน แจ้งซ่อม แบบสอบถาม" },
  { id: "booking", label: "จอง / นัดหมาย", hint: "จองคิว ห้องประชุม รถ" },
  { id: "stock", label: "สต็อก / ยืม-คืน", hint: "รับเข้า เบิกออก ครุภัณฑ์" },
  { id: "dashboard", label: "แดชบอร์ด / รายงาน", hint: "สรุปยอดจากข้อมูลใน Sheet" },
  { id: "docs", label: "ออกเอกสาร", hint: "ใบเสร็จ ใบเสนอราคา ใบรับรอง" },
  { id: "other", label: "อย่างอื่น", hint: "อธิบายเองในช่องด้านล่าง" },
];

export const STORAGES: BriefOption[] = [
  { id: "new-sheet", label: "สร้าง Google Sheet ใหม่ให้", hint: "ระบบสร้างและตั้งหัวตารางเอง", recommended: true },
  { id: "existing-sheet", label: "ใช้ Sheet ที่มีอยู่แล้ว", hint: "วางลิงก์ของ Sheet" },
  { id: "none", label: "ไม่ต้องเก็บข้อมูล", hint: "เช่น เครื่องคิดเลข ตัวแปลงข้อมูล" },
];

// "Sign in with Google" is deliberately not offered: every app is deployed to run as its owner and open
// to anyone with the link, where Google does not tell the script who the visitor is.
export const ACCESSES: BriefOption[] = [
  { id: "public", label: "ทุกคนที่มีลิงก์", hint: "เปิดใช้ได้เลย ไม่ต้องล็อกอิน", recommended: true },
  { id: "app-login", label: "ต้องล็อกอินก่อน", hint: "ชื่อผู้ใช้และรหัสผ่านของระบบนี้เอง กำหนดสิทธิ์ได้" },
];

export const FEATURES: BriefOption[] = [
  { id: "pdf", label: "สร้าง PDF", hint: "ใบเสร็จ เอกสาร พิมพ์ได้" },
  { id: "email", label: "ส่งอีเมล", hint: "ยืนยัน แจ้งเตือน" },
  { id: "line", label: "แจ้งเตือน LINE", hint: "ต้องมี LINE Official Account" },
  { id: "schedule", label: "งานตั้งเวลา", hint: "สรุปรายวัน เตือนล่วงหน้า" },
  { id: "upload", label: "อัปโหลดไฟล์ / รูป", hint: "เก็บลง Google Drive" },
  { id: "promptpay", label: "QR พร้อมเพย์", hint: "แสดง QR ให้สแกนจ่าย" },
];

export interface ProjectBrief {
  purpose: string;
  /** Free text: what it does, who uses it, which fields to keep. */
  detail: string;
  storage: string;
  sheetUrl: string;
  access: string;
  features: string[];
}

export const EMPTY_BRIEF: ProjectBrief = { purpose: "", detail: "", storage: "", sheetUrl: "", access: "", features: [] };

const MAX_DETAIL = 1000;
const SHEET_URL = /^https:\/\/docs\.google\.com\/spreadsheets\/d\/[A-Za-z0-9_-]{20,}(?:[/?#][^\s]*)?$/;
const pick = (options: BriefOption[], value: unknown): string =>
  typeof value === "string" && options.some((o) => o.id === value) ? value : "";
const label = (options: BriefOption[], id: string): string => options.find((o) => o.id === id)?.label ?? "";

export function isSheetUrl(value: string): boolean {
  return SHEET_URL.test(value.trim());
}

/** Keep only known option ids and bounded text from untrusted input (a form post or old data). */
export function sanitizeBrief(raw: unknown): ProjectBrief {
  if (!raw || typeof raw !== "object") return { ...EMPTY_BRIEF };
  const r = raw as Record<string, unknown>;
  const storage = pick(STORAGES, r.storage);
  const sheetUrl = typeof r.sheetUrl === "string" && storage === "existing-sheet" && isSheetUrl(r.sheetUrl) ? r.sheetUrl.trim() : "";
  const features = Array.isArray(r.features)
    ? FEATURES.map((f) => f.id).filter((id) => (r.features as unknown[]).includes(id))
    : [];
  return {
    purpose: pick(PURPOSES, r.purpose),
    detail: typeof r.detail === "string" ? r.detail.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, "").trim().slice(0, MAX_DETAIL) : "",
    storage,
    sheetUrl,
    access: pick(ACCESSES, r.access),
    features,
  };
}

export function isEmptyBrief(b: ProjectBrief): boolean {
  return !b.purpose && !b.detail && !b.storage && !b.access && b.features.length === 0;
}

/** Feature ids for rule-card routing: the ticked features plus what the other answers imply. */
export function briefFeatureIds(b: ProjectBrief): string[] {
  const ids = new Set(b.features);
  if (b.storage === "new-sheet" || b.storage === "existing-sheet") ids.add("sheet");
  if (b.access === "app-login") ids.add("login");
  if (b.purpose === "booking" || b.purpose === "stock") ids.add("multiuser");
  if (b.purpose === "dashboard") ids.add("dashboard");
  if (b.purpose === "docs") ids.add("pdf");
  if (b.features.includes("promptpay")) ids.add("money");
  return [...ids];
}

/** The first chat message built from the brief (Thai, plain — the user can read exactly what was sent). */
export function briefToMessage(b: ProjectBrief): string {
  const lines = ["สร้างระบบ Google Apps Script ตามนี้:"];
  if (b.purpose && b.purpose !== "other") lines.push(`- ประเภทงาน: ${label(PURPOSES, b.purpose)}`);
  if (b.detail) lines.push(`- รายละเอียด: ${b.detail}`);
  if (b.storage === "existing-sheet")
    lines.push(b.sheetUrl ? `- เก็บข้อมูลใน Sheet ที่มีอยู่แล้ว: ${b.sheetUrl}` : "- เก็บข้อมูลใน Sheet ที่มีอยู่แล้ว (จะส่งลิงก์ให้)");
  else if (b.storage) lines.push(`- ที่เก็บข้อมูล: ${label(STORAGES, b.storage)}`);
  if (b.access === "app-login") lines.push("- ผู้ใช้: ต้องล็อกอินด้วยชื่อผู้ใช้และรหัสผ่านของระบบนี้เอง");
  else if (b.access === "public") lines.push("- ผู้ใช้: ทุกคนที่มีลิงก์ ไม่ต้องล็อกอิน");
  if (b.features.length) lines.push(`- ต้องมี: ${b.features.map((id) => label(FEATURES, id)).join(", ")}`);
  lines.push("สรุปสเปคให้ยืนยันก่อน แล้วค่อยสร้าง");
  return lines.join("\n");
}
