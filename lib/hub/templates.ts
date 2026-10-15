/**
 * Ready-made hub templates ("เทมเพลต" tab of the hub editor), pure: a look (theme · layout · accent · font) plus
 * sample sections and links with icons, so someone who cannot picture how to arrange a hub starts from a finished
 * page and only edits names, icons and links. Vendored to EasyGAS-Site lib/hub-templates.ts — change both together.
 *
 * Every sample link carries TEMPLATE_URL until the owner replaces it: the document must stay valid (cleanHubDoc
 * refuses an empty url, and the editor saves by itself), and example.com is the one address that is plainly a
 * placeholder.
 */
import { newId, type HubBadge, type HubDoc, type HubFont, type HubIcon, type HubItem, type HubLayout, type HubSection, type HubTheme } from "./doc.ts";

export const TEMPLATE_URL = "https://example.com/";

export interface HubTemplateItem {
  title: string;
  icon: HubIcon;
  desc?: string;
  badge?: HubBadge;
}
export interface HubTemplateSection {
  title: string;
  items: HubTemplateItem[];
}
export interface HubTemplate {
  id: string;
  label: string;
  hint: string;
  /** who the page is for — the card's second line */
  who: string;
  theme: HubTheme;
  layout: HubLayout;
  accent: string;
  font: HubFont;
  search: boolean;
  sections: HubTemplateSection[];
}

const it = (title: string, icon: HubIcon, desc = "", badge: HubBadge = ""): HubTemplateItem => ({ title, icon, desc, badge });

export const HUB_TEMPLATES: HubTemplate[] = [
  {
    id: "school",
    label: "โรงเรียน",
    hint: "ไอคอนเรียงแบบหน้าจอมือถือ แยกนักเรียน · ผู้ปกครอง · ครู",
    who: "โรงเรียน ศูนย์เด็กเล็ก สถาบันกวดวิชา",
    theme: "school",
    layout: "grid",
    accent: "#0ea5e9",
    font: "prompt",
    search: true,
    sections: [
      { title: "สำหรับนักเรียน", items: [it("ตารางเรียน", "calendar-days", "ดูตารางเรียนรายห้อง"), it("เช็คชื่อ", "clipboard-document-check", "เช็คชื่อเข้าเรียนรายวัน"), it("ผลการเรียน", "academic-cap", "ดูเกรดและคะแนนเก็บ"), it("ห้องสมุด", "book-open", "ค้นและยืมหนังสือ")] },
      { title: "สำหรับผู้ปกครอง", items: [it("แจ้งลา / ขาดเรียน", "pencil-square", "ส่งใบลาออนไลน์"), it("ข่าวประกาศ", "megaphone", "ประกาศจากโรงเรียน", "new"), it("ติดต่อครูประจำชั้น", "phone")] },
      { title: "สำหรับบุคลากร", items: [it("บันทึกการสอน", "document-text", "", "staff"), it("เบิกวัสดุ", "archive-box", "", "staff"), it("ปฏิทินโรงเรียน", "calendar-days", "", "staff")] },
    ],
  },
  {
    id: "shop",
    label: "ร้านค้า / SME",
    hint: "ปุ่มใหญ่กดง่าย สั่งซื้อ · เช็คของ · ติดต่อร้าน",
    who: "ร้านค้าออนไลน์ ร้านขายส่ง ธุรกิจเล็ก",
    theme: "minimal",
    layout: "buttons",
    accent: "#f59e0b",
    font: "kanit",
    search: false,
    sections: [
      { title: "สั่งซื้อและบริการ", items: [it("สั่งสินค้า", "shopping-cart", "กรอกรายการสั่งซื้อ"), it("เช็คสถานะส่งของ", "truck", "ใส่เลขออเดอร์เพื่อติดตาม"), it("แคตตาล็อกสินค้า", "shopping-bag"), it("โปรโมชันเดือนนี้", "receipt-percent", "", "hot")] },
      { title: "ติดต่อร้าน", items: [it("LINE ร้าน", "chat-bubble-left-right"), it("โทรหาร้าน", "phone"), it("แผนที่ร้าน", "map-pin")] },
      { title: "หลังร้าน", items: [it("บันทึกยอดขาย", "banknotes", "", "staff"), it("สต็อกสินค้า", "archive-box", "", "staff")] },
    ],
  },
  {
    id: "clinic",
    label: "คลินิก / ร้านยา",
    hint: "สีนุ่ม อ่านสบาย จองคิว · เช็คคิว · ประวัติ",
    who: "คลินิก ร้านยา สปา ร้านเสริมสวย",
    theme: "pastel",
    layout: "buttons",
    accent: "#ec4899",
    font: "sarabun",
    search: false,
    sections: [
      { title: "ผู้รับบริการ", items: [it("จองคิว", "calendar-days", "เลือกวันและเวลาที่สะดวก"), it("เช็คคิววันนี้", "clock", "ดูว่าถึงคิวหรือยัง"), it("ประวัติการรับบริการ", "document-text"), it("บริการและราคา", "beaker")] },
      { title: "ติดต่อ", items: [it("โทร", "phone"), it("แผนที่", "map-pin"), it("LINE", "chat-bubble-left-right")] },
      { title: "เจ้าหน้าที่", items: [it("บันทึกผู้รับบริการ", "clipboard-document-list", "", "staff"), it("สต็อกยา / ของใช้", "archive-box", "", "staff")] },
    ],
  },
  {
    id: "office",
    label: "หน่วยงาน / อบต.",
    hint: "ทางการ เป็นระเบียบ บริการประชาชนอยู่บนสุด",
    who: "อบต. เทศบาล สำนักงาน หน่วยงานราชการ",
    theme: "corporate",
    layout: "cards",
    accent: "#1d4ed8",
    font: "sarabun",
    search: true,
    sections: [
      { title: "บริการประชาชน", items: [it("ยื่นคำร้องออนไลน์", "pencil-square", "ยื่นได้ทุกวัน ไม่ต้องมาเอง"), it("ตรวจสถานะคำร้อง", "clipboard-document-check"), it("แจ้งเรื่องร้องเรียน", "megaphone"), it("จองห้องประชุม", "calendar-days")] },
      { title: "ข้อมูลข่าวสาร", items: [it("ข่าวประชาสัมพันธ์", "newspaper", "", "new"), it("ปฏิทินกิจกรรม", "calendar-days"), it("เบอร์ติดต่อหน่วยงาน", "phone")] },
      { title: "สำหรับเจ้าหน้าที่", items: [it("ลงเวลาปฏิบัติงาน", "clock", "", "staff"), it("เบิกวัสดุสำนักงาน", "archive-box", "", "staff"), it("ขอใช้รถส่วนกลาง", "truck", "", "staff")] },
    ],
  },
  {
    id: "team",
    label: "ทีมงาน / บริษัท",
    hint: "พื้นเข้ม ไอคอนชัด รวมระบบภายในไว้ที่เดียว",
    who: "บริษัท ทีมงาน หน้ารวมระบบภายใน",
    theme: "dark",
    layout: "grid",
    accent: "#22c55e",
    font: "plex",
    search: true,
    sections: [
      { title: "งานประจำวัน", items: [it("ลงเวลาเข้างาน", "clock"), it("แจ้งลา", "calendar-days"), it("เบิกค่าใช้จ่าย", "banknotes"), it("ขอใบเสนอราคา", "document-text")] },
      { title: "ข้อมูลกลาง", items: [it("ทะเบียนลูกค้า", "user-group"), it("สต็อก", "archive-box"), it("รายงานยอดขาย", "chart-bar"), it("ปฏิทินทีม", "calendar-days")] },
      { title: "ช่วยเหลือ", items: [it("แจ้งปัญหา IT", "wrench-screwdriver"), it("คู่มือการใช้งาน", "book-open")] },
    ],
  },
  {
    id: "creator",
    label: "ฟรีแลนซ์ / ครีเอเตอร์",
    hint: "ขาวสะอาด ผลงาน · ขอใบเสนอราคา · ช่องทางติดตาม",
    who: "ฟรีแลนซ์ ช่างภาพ นักออกแบบ ครีเอเตอร์",
    theme: "minimal",
    layout: "buttons",
    accent: "#8b5cf6",
    font: "prompt",
    search: false,
    sections: [
      { title: "ผลงานและบริการ", items: [it("พอร์ตโฟลิโอ", "photo", "ผลงานล่าสุด"), it("ขอใบเสนอราคา", "document-text", "ตอบกลับภายใน 1 วัน"), it("จองคิวงาน", "calendar-days")] },
      { title: "ติดตามได้ที่", items: [it("Facebook", "globe-alt"), it("YouTube", "video-camera"), it("LINE", "chat-bubble-left-right"), it("อีเมล", "envelope")] },
    ],
  },
  {
    id: "restaurant",
    label: "ร้านอาหาร / คาเฟ่",
    hint: "พื้นเข้ม สีส้ม เมนู · สั่ง · จองโต๊ะ",
    who: "ร้านอาหาร คาเฟ่ ร้านเครื่องดื่ม",
    theme: "dark",
    layout: "buttons",
    accent: "#f97316",
    font: "kanit",
    search: false,
    sections: [
      { title: "สั่งและจอง", items: [it("เมนู", "book-open", "ดูเมนูและราคา"), it("สั่งอาหาร", "shopping-cart", "สั่งกลับบ้าน / เดลิเวอรี"), it("จองโต๊ะ", "calendar-days"), it("โปรวันนี้", "receipt-percent", "", "hot")] },
      { title: "ติดต่อ", items: [it("แผนที่ร้าน", "map-pin"), it("โทรจอง", "phone"), it("รีวิวร้าน", "star")] },
      { title: "พนักงาน", items: [it("เช็คสต็อกวัตถุดิบ", "archive-box", "", "staff"), it("ยอดขายวันนี้", "banknotes", "", "staff")] },
    ],
  },
  {
    id: "community",
    label: "วัด / ชุมชน / สมาคม",
    hint: "อ่านง่าย กิจกรรม · บริจาค · ติดต่อ",
    who: "วัด ชมรม สมาคม กลุ่มชุมชน",
    theme: "school",
    layout: "cards",
    accent: "#16a34a",
    font: "sarabun",
    search: false,
    sections: [
      { title: "กิจกรรม", items: [it("ปฏิทินกิจกรรม", "calendar-days"), it("ลงทะเบียนร่วมงาน", "pencil-square", "", "new"), it("ภาพกิจกรรม", "photo")] },
      { title: "บริจาคและสนับสนุน", items: [it("ร่วมบริจาค", "gift", "โอนผ่านบัญชีหรือสแกน QR"), it("รายงานยอดบริจาค", "chart-bar", "โปร่งใส ดูได้ทุกคน")] },
      { title: "ติดต่อ", items: [it("คณะกรรมการ", "user-group"), it("โทร", "phone"), it("แผนที่", "map-pin")] },
    ],
  },
  {
    id: "event",
    label: "งานอีเวนต์ / สัมมนา",
    hint: "สีหวาน ไอคอนเรียง ลงทะเบียน · กำหนดการ · เช็คอิน",
    who: "งานสัมมนา งานวิ่ง งานบุญ งานประจำปี",
    theme: "pastel",
    layout: "grid",
    accent: "#0ea5e9",
    font: "prompt",
    search: false,
    sections: [
      { title: "ก่อนงาน", items: [it("ลงทะเบียน", "pencil-square", "", "hot"), it("กำหนดการ", "clock"), it("แผนที่สถานที่", "map-pin"), it("ที่พักใกล้งาน", "building-office")] },
      { title: "ในงาน", items: [it("เช็คอิน", "qr-code"), it("แบบประเมิน", "clipboard-document-check"), it("ภาพในงาน", "camera"), it("ติดต่อทีมงาน", "phone")] },
    ],
  },
];

export const hubTemplateById = (id: string): HubTemplate | undefined => HUB_TEMPLATES.find((t) => t.id === id);

/** The template's sample sections as real sections (fresh ids, placeholder urls, added now). */
export function templateSections(tpl: HubTemplate, now = new Date()): HubSection[] {
  const added = now.toISOString();
  return tpl.sections.map((s) => ({
    id: newId(),
    title: s.title,
    collapsed: false,
    items: s.items.map(
      (i): HubItem => ({
        id: newId(),
        title: i.title,
        url: TEMPLATE_URL,
        desc: i.desc ?? "",
        icon: `i:${i.icon}`,
        iconUrl: "",
        color: "",
        badge: i.badge ?? "",
        start: "",
        end: "",
        added,
        deployment: "",
      }),
    ),
  }));
}

export type TemplateApply = "replace" | "append" | "style";

/** Does the hub hold any link already (decides whether applying a template needs the owner's choice)? */
export const hubHasLinks = (doc: Pick<HubDoc, "sections">): boolean => doc.sections.some((s) => s.items.length > 0);

/**
 * Apply a template: the look always; the sample sections replace the hub's own, go after them, or stay out
 * (`style`). The hub's title, description, cover and logo are never touched.
 */
export function applyHubTemplate(doc: HubDoc, tpl: HubTemplate, mode: TemplateApply, now = new Date()): HubDoc {
  const look = { theme: tpl.theme, layout: tpl.layout, accent: tpl.accent, font: tpl.font, search: tpl.search };
  if (mode === "style") return { ...doc, ...look };
  const sample = templateSections(tpl, now);
  const own = mode === "append" ? doc.sections.filter((s) => s.items.length > 0) : [];
  return { ...doc, ...look, sections: [...own, ...sample] };
}

/** How many sample links still point at the placeholder (the links tab reminds the owner). */
export const placeholderLinks = (doc: Pick<HubDoc, "sections">): number => doc.sections.reduce((n, s) => n + s.items.filter((i) => i.url === TEMPLATE_URL).length, 0);
