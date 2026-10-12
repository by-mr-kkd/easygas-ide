/**
 * A hub page ("หน้ารวมลิงก์") as one JSON document — pure, tested. Vendored from EasyGAS-Site lib/hub-doc.ts: change
 * both together. The website runs cleanHubDoc on every save (the final gate); the app uses the same rules so the
 * editor shows a problem before anything is sent.
 */

export const HUB_THEMES = [
  { id: "school", label: "โรงเรียน", hint: "ฟ้าสดใส อ่านง่าย" },
  { id: "minimal", label: "มินิมอล", hint: "ขาวสะอาด เรียบ" },
  { id: "pastel", label: "พาสเทล", hint: "นุ่มนวล สีหวาน" },
  { id: "dark", label: "มืด", hint: "พื้นเข้ม สบายตา" },
  { id: "corporate", label: "องค์กร", hint: "น้ำเงินเข้ม ทางการ" },
] as const;
export type HubTheme = (typeof HUB_THEMES)[number]["id"];

export const HUB_LAYOUTS = [
  { id: "buttons", label: "ปุ่มใหญ่", hint: "เรียงลงทีละปุ่ม เหมาะกับมือถือ" },
  { id: "grid", label: "ไอคอน", hint: "ตารางไอคอนแบบหน้าจอมือถือ" },
  { id: "cards", label: "รายการกลุ่ม", hint: "ลิงก์ของแต่ละหมวดอยู่ในกล่องเดียว เป็นระเบียบ" },
] as const;
export type HubLayout = (typeof HUB_LAYOUTS)[number]["id"];

export const HUB_FONTS = [
  { id: "plex", label: "IBM Plex Sans Thai" },
  { id: "sarabun", label: "Sarabun" },
  { id: "prompt", label: "Prompt" },
  { id: "kanit", label: "Kanit" },
  { id: "noto", label: "Noto Sans Thai" },
] as const;
export type HubFont = (typeof HUB_FONTS)[number]["id"];

export const HUB_BADGES = [
  { id: "", label: "ไม่มีป้าย" },
  { id: "new", label: "ใหม่" },
  { id: "hot", label: "แนะนำ" },
  { id: "staff", label: "เฉพาะบุคลากร" },
  { id: "fix", label: "ปิดปรับปรุง" },
] as const;
export type HubBadge = (typeof HUB_BADGES)[number]["id"];

/** The line icons a link may carry (Heroicons outline; each repo maps the id to its component). */
export const HUB_ICONS = [
  "academic-cap", "book-open", "pencil-square", "clipboard-document-list", "clipboard-document-check", "calendar-days",
  "clock", "chart-bar", "presentation-chart-line", "calculator", "banknotes", "credit-card", "receipt-percent",
  "shopping-cart", "shopping-bag", "archive-box", "truck", "building-office", "building-library", "building-storefront",
  "home", "user-group", "users", "user", "identification", "megaphone", "newspaper", "bell", "envelope", "phone",
  "chat-bubble-left-right", "camera", "photo", "video-camera", "musical-note", "document-text", "folder", "inbox",
  "map-pin", "globe-alt", "link", "wrench-screwdriver", "cog-6-tooth", "shield-check", "lock-closed", "star", "heart",
  "trophy", "gift", "ticket", "light-bulb", "beaker", "briefcase", "computer-desktop", "device-phone-mobile",
  "qr-code", "check-badge", "flag", "sparkles", "lifebuoy",
] as const;
export type HubIcon = (typeof HUB_ICONS)[number];
/** The icon id of an "i:<id>" value, or null (an emoji, a picture, or nothing). */
export const iconId = (icon: string): HubIcon | null => (icon.startsWith("i:") && (HUB_ICONS as readonly string[]).includes(icon.slice(2)) ? (icon.slice(2) as HubIcon) : null);

export const HUB_VISIBILITY = [
  { id: "public", label: "สาธารณะ", hint: "ใครมีลิงก์ก็เปิดได้ และค้นเจอได้" },
  { id: "unlisted", label: "เฉพาะคนมีลิงก์", hint: "เปิดได้ด้วยลิงก์ แต่ไม่ให้เครื่องมือค้นหาเก็บ" },
  { id: "pin", label: "ล็อกด้วย PIN", hint: "ต้องใส่ PIN ก่อนเห็นลิงก์ (Pro)" },
] as const;
export type HubVisibility = (typeof HUB_VISIBILITY)[number]["id"];

export interface HubItem {
  id: string;
  title: string;
  url: string;
  desc: string;
  /** a line icon from HUB_ICONS as "i:<id>" (older pages may hold an emoji), or empty */
  icon: string;
  /** a picture in the hub-images bucket (or empty); wins over `icon` */
  iconUrl: string;
  /** #rrggbb or empty (the theme's colour) */
  color: string;
  badge: HubBadge;
  /** show only from / until (YYYY-MM-DD, Bangkok time; empty = always) — Pro */
  start: string;
  end: string;
  /** when it was added (ISO) — "ใหม่" shows for NEW_DAYS after */
  added: string;
  /** the Apps Script deployment id: the link opens through run.easygaside.tech ("" = open the link as is) */
  deployment: string;
}

export interface HubSection {
  id: string;
  title: string;
  collapsed: boolean;
  items: HubItem[];
}

export interface HubDoc {
  v: 1;
  title: string;
  description: string;
  theme: HubTheme;
  layout: HubLayout;
  /** #rrggbb */
  accent: string;
  font: HubFont;
  cover: string;
  logo: string;
  /** show the search box (it shows by itself past SEARCH_FROM links when on) */
  search: boolean;
  sections: HubSection[];
}

export const LIMITS = { sections: 30, items: 300, title: 80, description: 300, itemTitle: 80, itemDesc: 140, url: 2000, sectionTitle: 60 } as const;
export const NEW_DAYS = 7;
export const SEARCH_FROM = 8;

export class HubDocError extends Error {}

const HEX = /^#[0-9a-f]{6}$/i;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[A-Za-z0-9_-]{4,40}$/;
const DEPLOYMENT = /^AKfyc[A-Za-z0-9_-]{20,160}$/;
/** "i:<icon id>" or one emoji (with modifiers / joiners); never markup */
const ICON = /^[^\s<>"'&]{1,40}$/u;

const str = (v: unknown, max: number): string => (typeof v === "string" ? v.replace(/[\u0000-\u001f\u007f]/g, " ").trim().slice(0, max) : "");
const oneOf = <T extends string>(v: unknown, list: readonly { id: T }[], dflt: T): T => (list.some((x) => x.id === v) ? (v as T) : dflt);

/** A link people may be sent to: http(s) only, no user:password@, no spaces. Returns the cleaned URL or null. */
export function cleanUrl(raw: unknown): string | null {
  const s = str(raw, LIMITS.url);
  if (!s) return null;
  let u: URL;
  try {
    u = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`);
  } catch {
    return null;
  }
  if (u.protocol !== "https:" && u.protocol !== "http:") return null;
  if (u.username || u.password || !u.hostname.includes(".")) return null;
  return u.toString();
}

/**
 * The deployment id of an Apps Script web app link, whichever form was pasted — /macros/s/<id>/exec or the
 * /macros/u/<n>/s/<id>/exec a multi-account Chrome turns it into. Null for anything else (/dev, /a/<domain>/…).
 */
export function deploymentOf(url: string): string | null {
  const m = /^https:\/\/script\.google\.com\/macros\/(?:u\/\d+\/)?s\/(AKfyc[A-Za-z0-9_-]{20,160})\/exec(?:[?#].*)?$/.exec(url);
  return m ? m[1] : null;
}

export function newId(): string {
  const a = new Uint8Array(9);
  crypto.getRandomValues(a);
  return Array.from(a, (b) => "abcdefghijklmnopqrstuvwxyz0123456789"[b % 36]).join("");
}

export function emptyHubDoc(title = "หน้ารวมลิงก์ของฉัน"): HubDoc {
  return {
    v: 1,
    title,
    description: "",
    theme: "school",
    layout: "buttons",
    accent: "#0ea5e9",
    font: "plex",
    cover: "",
    logo: "",
    search: true,
    sections: [{ id: newId(), title: "ลิงก์ทั้งหมด", collapsed: false, items: [] }],
  };
}

/**
 * Validate a document from the editor. `isImage` says whether a URL is one of our own uploaded pictures (other
 * picture URLs are dropped). Throws HubDocError with a Thai line the editor can show.
 */
export function cleanHubDoc(input: unknown, isImage: (url: string) => boolean): HubDoc {
  if (!input || typeof input !== "object") throw new HubDocError("ข้อมูลหน้าไม่ถูกต้อง");
  const d = input as Record<string, unknown>;
  const title = str(d.title, LIMITS.title);
  if (!title) throw new HubDocError("ตั้งชื่อหน้าก่อน");
  const rawSections = Array.isArray(d.sections) ? d.sections : [];
  if (rawSections.length > LIMITS.sections) throw new HubDocError(`มีได้ไม่เกิน ${LIMITS.sections} หมวด`);
  let count = 0;
  const seen = new Set<string>();
  const sections: HubSection[] = rawSections.map((rs, si) => {
    const s = (rs ?? {}) as Record<string, unknown>;
    const items = (Array.isArray(s.items) ? s.items : []).map((ri, ii): HubItem => {
      const r = (ri ?? {}) as Record<string, unknown>;
      const itemTitle = str(r.title, LIMITS.itemTitle);
      const url = cleanUrl(r.url);
      const where = `หมวดที่ ${si + 1} ลิงก์ที่ ${ii + 1}`;
      if (!itemTitle) throw new HubDocError(`${where}: ใส่ชื่อลิงก์ก่อน`);
      if (!url) throw new HubDocError(`${where} (${itemTitle}): ลิงก์ต้องขึ้นต้นด้วย https:// หรือ http://`);
      let id = typeof r.id === "string" && ID.test(r.id) ? r.id : newId();
      if (seen.has(id)) id = newId();
      seen.add(id);
      const icon = str(r.icon, 40);
      const iconUrl = typeof r.iconUrl === "string" && isImage(r.iconUrl) ? r.iconUrl : "";
      const color = typeof r.color === "string" && HEX.test(r.color) ? r.color.toLowerCase() : "";
      const start = typeof r.start === "string" && DAY.test(r.start) ? r.start : "";
      const end = typeof r.end === "string" && DAY.test(r.end) ? r.end : "";
      if (start && end && end < start) throw new HubDocError(`${where} (${itemTitle}): วันสิ้นสุดต้องไม่ก่อนวันเริ่ม`);
      const added = typeof r.added === "string" && !Number.isNaN(Date.parse(r.added)) ? new Date(r.added).toISOString() : new Date().toISOString();
      const fromUrl = deploymentOf(url);
      // a pasted Apps Script link opens through run.easygaside.tech unless the editor switched that off ("" sent):
      // an app that needs a Google sign-in cannot open in that frame
      const deployment = typeof r.deployment === "string" ? (DEPLOYMENT.test(r.deployment) ? r.deployment : "") : fromUrl ?? "";
      count++;
      return {
        id,
        title: itemTitle,
        url,
        desc: str(r.desc, LIMITS.itemDesc),
        icon: ICON.test(icon) ? icon : "",
        iconUrl,
        color,
        badge: oneOf(r.badge, HUB_BADGES, ""),
        start,
        end,
        added,
        deployment,
      };
    });
    let id = typeof s.id === "string" && ID.test(s.id) ? s.id : newId();
    if (seen.has(id)) id = newId();
    seen.add(id);
    return { id, title: str(s.title, LIMITS.sectionTitle), collapsed: s.collapsed === true, items };
  });
  if (count > LIMITS.items) throw new HubDocError(`มีลิงก์ได้ไม่เกิน ${LIMITS.items} ลิงก์`);
  return {
    v: 1,
    title,
    description: str(d.description, LIMITS.description),
    theme: oneOf(d.theme, HUB_THEMES, "school"),
    layout: oneOf(d.layout, HUB_LAYOUTS, "buttons"),
    accent: typeof d.accent === "string" && HEX.test(d.accent) ? d.accent.toLowerCase() : "#0ea5e9",
    font: oneOf(d.font, HUB_FONTS, "plex"),
    cover: typeof d.cover === "string" && isImage(d.cover) ? d.cover : "",
    logo: typeof d.logo === "string" && isImage(d.logo) ? d.logo : "",
    search: d.search !== false,
    sections: sections.length ? sections : [{ id: newId(), title: "ลิงก์ทั้งหมด", collapsed: false, items: [] }],
  };
}

/** Does the document use a Pro-only part? (the website refuses it from a free account) */
export function usesSchedule(doc: HubDoc): boolean {
  return doc.sections.some((s) => s.items.some((i) => i.start || i.end));
}

/** Today in Bangkok as YYYY-MM-DD (schedules are dates, read in Thai time). */
export function bangkokDay(now: Date): string {
  return new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);
}

/** Visible to visitors right now (schedule). */
export function isShown(item: HubItem, now: Date): boolean {
  const day = bangkokDay(now);
  return (!item.start || item.start <= day) && (!item.end || day <= item.end);
}

/** The automatic "ใหม่" mark. */
export function isNew(item: HubItem, now: Date): boolean {
  return item.badge === "new" || now.getTime() - Date.parse(item.added) < NEW_DAYS * 86_400_000;
}

// ---- slugs --------------------------------------------------------------------------------------------------

export const SLUG = /^[a-z0-9][a-z0-9-]{1,38}[a-z0-9]$/;
const RESERVED_SLUGS = new Set([
  "admin", "api", "app", "hub", "hubs", "new", "edit", "login", "logout", "settings", "help", "support", "about", "pro",
  "download", "board", "news", "run", "go", "s", "r", "official", "team", "staff", "www", "mail", "root", "system",
]);
const RESERVED_SLUG_WORDS = /admin|easygas|mrkkd|mr-kkd|official|support|login|verify|bank|paypal|truemoney|promptpay|scb|kbank|ktb|bbl|gsb/;

/** A slug as typed → its clean form, or a HubDocError naming the rule. */
export function cleanSlug(raw: unknown): string {
  const s = String(raw ?? "").trim().toLowerCase().replace(/[\s_]+/g, "-").replace(/-+/g, "-");
  if (!SLUG.test(s)) throw new HubDocError("ชื่อลิงก์ใช้ a-z, 0-9 และขีด (-) ยาว 3–40 ตัว ขึ้นต้นและลงท้ายด้วยตัวอักษรหรือตัวเลข");
  if (RESERVED_SLUGS.has(s) || RESERVED_SLUG_WORDS.test(s)) throw new HubDocError("ชื่อนี้สงวนไว้ ลองชื่ออื่น");
  return s;
}

/** A slug from a title when the user has not picked one (Latin letters only; Thai titles get a random one). */
export function suggestSlug(title: string): string {
  const base = title.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 30);
  const tail = newId().slice(0, 5);
  return base.length >= 3 ? `${base}-${tail}` : `hub-${tail}${newId().slice(0, 3)}`;
}

// ---- PIN ------------------------------------------------------------------------------------------------------

export const PIN = /^\d{4,8}$/;
