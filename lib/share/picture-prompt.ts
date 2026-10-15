/**
 * "ให้ AI สร้างรูป" (ShareKit): the picture is asked for with a PROMPT the app writes from the user's picks and shows them
 * first — size / use, the language of any text in the picture, the font feel, the picture style, extra wishes — so they
 * read and edit it before it goes to the AI (lib/share/picture.ts). Pure and tested (tests/picture-prompt.test.ts).
 */

export const PICTURE_SIZES = {
  cover: { label: "รูปปกหน้าแชร์ · 16:9", w: 1600, h: 900, shape: "แนวนอน 16:9" },
  photo: { label: "รูปประกอบ · 4:3", w: 1600, h: 1200, shape: "แนวนอน 4:3" },
  square: { label: "จัตุรัส 1:1 · โพสต์โซเชียล", w: 1200, h: 1200, shape: "จัตุรัส 1:1" },
  og: { label: "ภาพ OG · ลิงก์บน Facebook/LINE 1.91:1", w: 1200, h: 630, shape: "แนวนอนกว้าง 1.91:1 (1200×630 สำหรับ Open Graph / พรีวิวลิงก์)" },
  fb: { label: "โพสต์ Facebook · 4:5", w: 1080, h: 1350, shape: "แนวตั้ง 4:5 (โพสต์ Facebook / Instagram)" },
} as const;
export type PictureSize = keyof typeof PICTURE_SIZES;

export const PICTURE_LANGS = {
  th: "ภาษาไทย",
  en: "ภาษาอังกฤษ",
  both: "ไทยและอังกฤษ",
  none: "ไม่มีข้อความในรูป",
} as const;
export type PictureLang = keyof typeof PICTURE_LANGS;

export const PICTURE_FONTS = {
  modern: { label: "ทันสมัย", text: "ฟอนต์ทันสมัยไม่มีเชิง (sans-serif) หนา อ่านง่าย" },
  formal: { label: "เป็นทางการ", text: "ฟอนต์เป็นทางการมีเชิง (serif) ดูน่าเชื่อถือ" },
  fun: { label: "สนุก กลมมน", text: "ฟอนต์กลมมน ดูเป็นมิตรและสนุก" },
  hand: { label: "ลายมือ", text: "ฟอนต์แนวลายมือ ดูอบอุ่น" },
} as const;
export type PictureFont = keyof typeof PICTURE_FONTS;

export const PICTURE_STYLES = {
  flat: { label: "แบนสมัยใหม่", text: "สไตล์แบนสมัยใหม่ (flat design) พื้นหลังไล่สีนุ่ม ๆ รูปทรงเรขาคณิตสะอาดตา" },
  soft3d: { label: "3D นุ่ม", text: "สไตล์ 3D นุ่ม ๆ (clay / soft 3D) สีพาสเทล แสงนวล" },
  photo: { label: "ภาพถ่าย", text: "สไตล์ภาพถ่ายสมจริง แสงธรรมชาติ ดูเป็นธุรกิจ" },
  line: { label: "ลายเส้น", text: "สไตล์ภาพวาดลายเส้น (line art) สองสี เรียบง่าย" },
} as const;
export type PictureStyle = keyof typeof PICTURE_STYLES;

export interface PictureSpec {
  size: PictureSize;
  lang: PictureLang;
  font: PictureFont;
  style: PictureStyle;
  /** free words from the user, already trimmed */
  hint: string;
}

export const DEFAULT_SPEC: PictureSpec = { size: "cover", lang: "th", font: "modern", style: "flat", hint: "" };

export const PROMPT_MAX = 2000;

const isSize = (v: unknown): v is PictureSize => typeof v === "string" && v in PICTURE_SIZES;
const isLang = (v: unknown): v is PictureLang => typeof v === "string" && v in PICTURE_LANGS;
const isFont = (v: unknown): v is PictureFont => typeof v === "string" && v in PICTURE_FONTS;
const isStyle = (v: unknown): v is PictureStyle => typeof v === "string" && v in PICTURE_STYLES;

/** A spec from anything (a form, a request): unknown picks fall back to the default, the hint is clipped. */
export function cleanSpec(input: unknown): PictureSpec {
  const o = (input && typeof input === "object" ? input : {}) as Record<string, unknown>;
  return {
    size: isSize(o.size) ? o.size : DEFAULT_SPEC.size,
    lang: isLang(o.lang) ? o.lang : DEFAULT_SPEC.lang,
    font: isFont(o.font) ? o.font : DEFAULT_SPEC.font,
    style: isStyle(o.style) ? o.style : DEFAULT_SPEC.style,
    hint: typeof o.hint === "string" ? o.hint.replace(/\s+/g, " ").trim().slice(0, 300) : "",
  };
}

const USE: Record<PictureSize, string> = {
  cover: "รูปปกสำหรับหน้าแชร์โค้ด",
  photo: "รูปประกอบสำหรับหน้าแชร์โค้ด",
  square: "รูปสำหรับโพสต์โซเชียล",
  og: "ภาพ Open Graph ที่แสดงตอนแปะลิงก์บน Facebook / LINE",
  fb: "รูปสำหรับโพสต์ Facebook",
};

function textLine(spec: PictureSpec, name: string): string {
  if (spec.lang === "none") return "ข้อความในรูป: ไม่มีข้อความ ตัวอักษร หรือโลโก้ใด ๆ";
  const lang = spec.lang === "th" ? "ภาษาไทย" : spec.lang === "en" ? "ภาษาอังกฤษ" : "ภาษาไทยเป็นหลัก และมีภาษาอังกฤษประกอบ";
  return `ข้อความในรูป: ชื่อระบบ "${name}" ${lang} ตัวใหญ่อ่านง่าย และคำโปรยสั้น ๆ 1 บรรทัด ${PICTURE_FONTS[spec.font].text} สะกดให้ถูกต้องทุกตัวอักษร`;
}

/**
 * The prompt the user reviews. `description` = what the app does (the share's words when there are any); when it is empty
 * the server adds what it reads from the code (see lib/share/picture.ts), and the prompt says so.
 */
export function buildPicturePrompt(name: string, description: string, spec: PictureSpec): string {
  const size = PICTURE_SIZES[spec.size];
  const lines = [
    `สร้าง${USE[spec.size]} ของระบบ "${name}" (ระบบ Google Apps Script)`,
    `ขนาด: ${size.shape} ${size.w}×${size.h} พิกเซล วาดให้เต็มกรอบ`,
    description.trim() ? `ระบบทำอะไร: ${description.trim().slice(0, 600)}` : "ระบบทำอะไร: (ดูจากโค้ดที่แนบมาด้านล่าง)",
    `สไตล์ภาพ: ${PICTURE_STYLES[spec.style].text} สื่อถึงสิ่งที่ระบบทำ เช่น การ์ด ตาราง กราฟ ปฏิทิน แบบฟอร์ม หน้าจอมือถือ`,
    textLine(spec, name),
    "ห้ามมีลายน้ำ ไม่มีใบหน้าคนจริง ไม่มีโลโก้ของแบรนด์อื่น",
  ];
  if (spec.hint) lines.push(`เพิ่มเติม: ${spec.hint}`);
  return lines.join("\n");
}

/** The prompt as the server takes it: a string, trimmed, capped. null when empty. */
export function cleanPrompt(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const s = input.replace(/\r\n?/g, "\n").trim().slice(0, PROMPT_MAX);
  return s || null;
}
