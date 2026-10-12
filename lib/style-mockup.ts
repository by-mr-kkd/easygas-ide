/**
 * The style tab's live mock-up (pure — unit-tested in tests/style-mockup.test.ts). It puts the picked
 * catalog items (lib/style-catalog.ts) together into ONE page without any AI: a fixed frame with slots —
 * navigation, data, buttons, feedback, search, form, Thai formats — each filled by the pick for that slot
 * or a neutral default. Picks that have nothing to draw (LINE, triggers, login …) show as badges.
 *
 * The page is generic on purpose ("รายการที่ 1"): it shows the LOOK. What the system does is the AI's job
 * ("สร้างเดโม่ให้ดูก่อน"). It renders in a sandboxed iframe with scripts off, so no script is emitted.
 */

import type { StyleItem } from "@/lib/style-catalog";

/** Categories drawn as picture cards in the picker; the rest are capabilities shown as tick chips. */
export const VISUAL_CATEGORIES = ["nav", "buttons", "feedback", "theme", "data", "forms", "search", "thai"] as const;

export const isVisualCategory = (category: string) => (VISUAL_CATEGORIES as readonly string[]).includes(category);

export interface MockLook {
  /** main colour, #rrggbb */
  color: string;
  /** a Google Fonts family name from LOOK_FONTS */
  font: string;
  tone: "light" | "dark";
}

/** The demo picker's choices (ChatPanel's start chips use the same lists). */
export const LOOK_COLORS: { id: string; label: string; hex: string }[] = [
  { id: "green", label: "เขียว", hex: "#047857" },
  { id: "blue", label: "น้ำเงิน", hex: "#1d4ed8" },
  { id: "violet", label: "ม่วง", hex: "#6d28d9" },
  { id: "orange", label: "ส้ม", hex: "#c2410c" },
  { id: "pink", label: "ชมพู", hex: "#be185d" },
  { id: "slate", label: "เทาเข้ม", hex: "#1e293b" },
];

/** family → the font id in lib/preferences.ts (the pick is also saved as the project's font) */
export const LOOK_FONTS: { family: string; prefId: string }[] = [
  { family: "Prompt", prefId: "prompt" },
  { family: "Sarabun", prefId: "sarabun" },
  { family: "Kanit", prefId: "kanit" },
  { family: "Noto Sans Thai", prefId: "noto-sans-thai" },
  { family: "IBM Plex Sans Thai", prefId: "ibm-plex-sans-thai" },
];

export const DEFAULT_LOOK: MockLook = { color: "#047857", font: "IBM Plex Sans Thai", tone: "light" };

export interface MockProFeatures {
  /** installed as an app: full screen, no browser bar, an "ติดตั้งแอป" button */
  pwa?: boolean;
  /** in-app notifications: a bell with a count and a banner (no push) */
  notify?: boolean;
}

export interface MockInput {
  picks: string[];
  catalog: StyleItem[];
  look?: Partial<MockLook>;
  device?: "desktop" | "mobile";
  pro?: MockProFeatures;
}

const HEX = /^#[0-9a-f]{6}$/i;

function safeLook(look: Partial<MockLook> | undefined): MockLook {
  const color = look?.color && HEX.test(look.color) ? look.color : DEFAULT_LOOK.color;
  const font = LOOK_FONTS.some((f) => f.family === look?.font) ? (look?.font as string) : DEFAULT_LOOK.font;
  const tone = look?.tone === "dark" ? "dark" : "light";
  return { color, font, tone };
}

/** A stored look (project.look) as the mock-up uses it; null when nothing was picked. */
export function sanitizeLook(input: unknown): MockLook | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Partial<MockLook>;
  if (!o.color && !o.font && !o.tone) return null;
  return safeLook(o);
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c] as string);

/** The slot each visual pick fills; a later pick for the same slot replaces an earlier one. */
const NAV: Record<string, "sidebar" | "top" | "bottom"> = { "nav-sidebar": "sidebar", "nav-topbar": "top", "nav-bottom": "bottom" };

interface Plan {
  nav: "sidebar" | "top" | "bottom";
  table: boolean;
  kpi: boolean;
  rounded: boolean;
  loading: boolean;
  feedback: "modal" | "toast" | null;
  darkToggle: boolean;
  filterChips: boolean;
  dateRange: boolean;
  form: boolean;
  thaiDate: boolean;
  promptpay: boolean;
  phone: boolean;
  /** titles of picks with nothing to draw */
  badges: string[];
}

export function planMockup(picks: string[], catalog: StyleItem[], device: "desktop" | "mobile" = "desktop"): Plan {
  const set = new Set(picks);
  let nav: Plan["nav"] = device === "mobile" ? "bottom" : "sidebar";
  for (const id of picks) if (NAV[id]) nav = NAV[id];
  const kpi = set.has("data-kpi");
  const fb = picks.filter((id) => id === "fb-sweetalert" || id === "fb-toast").pop();
  const badges = picks
    .map((id) => catalog.find((c) => c.id === id))
    .filter((c): c is StyleItem => !!c && !isVisualCategory(c.category))
    .map((c) => c.title);
  return {
    nav,
    // a page always shows its data: the table is the default when nothing else was picked for it
    table: set.has("data-table") || !kpi,
    kpi,
    rounded: set.has("btn-rounded"),
    loading: set.has("btn-loading"),
    feedback: fb === "fb-sweetalert" ? "modal" : fb === "fb-toast" ? "toast" : null,
    darkToggle: set.has("theme-darktoggle"),
    filterChips: set.has("search-filterbar"),
    dateRange: set.has("search-daterange"),
    form: set.has("form-clean"),
    thaiDate: set.has("thai-date"),
    promptpay: set.has("thai-promptpay"),
    phone: set.has("thai-phone"),
    badges,
  };
}

const MENU = ["สรุป", "รายการ", "เพิ่มใหม่", "รายงาน", "ตั้งค่า"];

/** A full HTML document for the iframe. */
export function composeMockup(input: MockInput): string {
  const device = input.device === "mobile" ? "mobile" : "desktop";
  const look = safeLook(input.look);
  const plan = planMockup(input.picks, input.catalog, device);
  const pro = input.pro ?? {};
  const dark = look.tone === "dark";
  const c = {
    bg: dark ? "#0f172a" : "#f8fafc",
    card: dark ? "#1e293b" : "#ffffff",
    line: dark ? "#334155" : "#e2e8f0",
    fg: dark ? "#e2e8f0" : "#0f172a",
    muted: dark ? "#94a3b8" : "#64748b",
    navBg: dark ? "#020617" : "#0f172a",
    accent: look.color,
  };
  const radius = plan.rounded ? 999 : 8;
  const date = (d: number) => (plan.thaiDate ? `${d} ต.ค. 2569` : `${String(d).padStart(2, "0")}/10/2026`);

  const btn = (label: string, primary = true, extra = "") =>
    `<span class="btn" style="border-radius:${radius}px;${primary ? `background:${c.accent};color:#fff;border-color:${c.accent}` : ""};${extra}">${label}</span>`;

  const bell = pro.notify
    ? `<span class="bell" title="แจ้งเตือนในแอป">🔔<b>1</b></span>`
    : "";
  const darkBtn = plan.darkToggle ? `<span class="pill">${dark ? "☀" : "☾"}</span>` : "";
  const installBtn = pro.pwa && device === "desktop" ? `<span class="pill" style="color:${c.accent};border-color:${c.accent}">⤓ ติดตั้งแอป</span>` : "";

  const kpi = plan.kpi
    ? `<div class="kpis">${[
        ["ทั้งหมด", "128"],
        ["วันนี้", "12"],
        ["รอดำเนินการ", "5"],
      ]
        .map(([k, v]) => `<div class="kpi"><div class="muted">${k}</div><div class="num" style="color:${c.accent}">${v}</div></div>`)
        .join("")}</div>`
    : "";

  const filters =
    plan.filterChips || plan.dateRange
      ? `<div class="row wrap">${plan.filterChips ? ["ทั้งหมด", "รอ", "เสร็จ"].map((t, i) => `<span class="chip" style="${i === 0 ? `background:${c.accent};color:#fff;border-color:${c.accent}` : ""}">${t}</span>`).join("") : ""}${
          plan.dateRange ? `<span class="chip">📅 ${date(1)} – ${date(12)}</span>` : ""
        }</div>`
      : "";

  const rows: [string, number, "done" | "wait"][] = [
    ["รายการที่ 1", 12, "done"],
    ["รายการที่ 2", 11, "wait"],
    ["รายการที่ 3", 10, "done"],
  ];
  const status = (s: "done" | "wait") =>
    s === "done" ? `<span class="tag" style="background:#dcfce7;color:#166534">เสร็จ</span>` : `<span class="tag" style="background:#fef3c7;color:#92400e">รอ</span>`;

  const table = plan.table
    ? device === "mobile"
      ? `<div class="list">${rows
          .map(([n, d, s]) => `<div class="li"><div><div class="b">${n}</div><div class="muted">${date(d)}${plan.phone ? " · 081-234-5678" : ""}</div></div>${status(s)}</div>`)
          .join("")}</div>`
      : `<div class="card tbl"><table><thead><tr><th>ชื่อ ↕</th><th>วันที่ ↓</th>${plan.phone ? "<th>เบอร์โทร</th>" : ""}<th>สถานะ</th><th></th></tr></thead><tbody>${rows
          .map(([n, d, s]) => `<tr><td>${n}</td><td>${date(d)}</td>${plan.phone ? "<td>081-234-5678</td>" : ""}<td>${status(s)}</td><td class="r" style="color:${c.accent}">แก้ไข</td></tr>`)
          .join("")}</tbody></table></div>`
    : "";

  const form = plan.form
    ? `<div class="card form"><div class="b">เพิ่มรายการ</div><label>ชื่อ<span class="in"></span></label><label>วันที่<span class="in">${date(12)}</span></label>${
        plan.phone ? `<label>เบอร์โทร<span class="in">0812345678</span></label>` : ""
      }<div class="row">${btn(plan.loading ? `<span class="spin"></span>กำลังบันทึก…` : "บันทึก", true, plan.loading ? "opacity:.7" : "")}${btn("ยกเลิก", false)}</div></div>`
    : "";

  const promptpay = plan.promptpay
    ? `<div class="card pp"><div class="qr"></div><div><div class="b">ชำระผ่านพร้อมเพย์</div><div class="muted">ยอด 350.00 บาท</div></div></div>`
    : "";

  const feedback =
    plan.feedback === "modal"
      ? `<div class="modal"><div class="ok" style="color:${c.accent}">✓</div><div class="b">บันทึกเรียบร้อย</div><div class="muted">ข้อมูลถูกบันทึกแล้ว</div>${btn("ตกลง")}</div>`
      : plan.feedback === "toast"
        ? `<div class="toast"><span style="color:${c.accent}">✓</span> บันทึกเรียบร้อย</div>`
        : "";

  const banner = pro.notify
    ? `<div class="banner"><span class="bi">🔔</span><div><div class="b">มีรายการใหม่</div><div class="muted">รายการที่ 4 · เมื่อสักครู่</div></div></div>`
    : "";

  const badges = plan.badges.length
    ? `<div class="badges"><span class="muted">ฟีเจอร์ที่เลือก (ไม่มีภาพ):</span>${plan.badges.map((b) => `<span class="badge">${esc(b)}</span>`).join("")}</div>`
    : "";

  const addBtn = btn(plan.loading && !plan.form ? `<span class="spin"></span>กำลังบันทึก…` : "+ เพิ่ม", true, plan.loading && !plan.form ? "opacity:.7" : "");
  const toolbar = `<div class="row"><div class="h">รายการ</div><span class="grow"></span>${plan.table ? `<span class="search">🔍 ค้นหา…</span>` : ""}${addBtn}</div>`;

  const content = `<div class="content">${banner}${toolbar}${filters}${kpi}<div class="${plan.form && device === "desktop" ? "split" : "stack"}"><div class="stack">${table}${promptpay}</div>${form}</div>${badges}</div>`;

  const brand = `<span class="brand"><span class="logo" style="background:${c.accent}"></span>ชื่อระบบ</span>`;
  let body: string;
  if (plan.nav === "sidebar" && device === "desktop") {
    body = `<div class="app side"><nav class="nav">${brand}${MENU.map((m, i) => `<div class="ni${i === 1 ? " on" : ""}" ${i === 1 ? `style="background:${c.accent}"` : ""}>${m}</div>`).join("")}</nav><div class="main"><div class="top"><span class="grow"></span>${installBtn}${darkBtn}${bell}</div>${content}</div></div>`;
  } else if (plan.nav === "bottom" || device === "mobile") {
    const header = `<div class="top bar" style="background:${c.accent};color:#fff">${plan.nav === "sidebar" ? "☰ " : ""}<span class="b">ชื่อระบบ</span><span class="grow"></span>${darkBtn}${bell}</div>`;
    const tabs =
      plan.nav === "bottom"
        ? `<div class="tabs">${["หน้าหลัก", "รายการ", "เพิ่ม", "ฉัน"].map((t, i) => `<div style="${i === 1 ? `color:${c.accent};font-weight:700` : ""}"><div class="dot" style="background:${i === 1 ? c.accent : c.muted}"></div>${t}</div>`).join("")}</div>`
        : plan.nav === "top"
          ? ""
          : "";
    const topTabs = plan.nav === "top" ? `<div class="ttabs">${MENU.slice(0, 4).map((m, i) => `<span style="${i === 1 ? `border-color:${c.accent};color:${c.fg};font-weight:700` : ""}">${m}</span>`).join("")}</div>` : "";
    body = `<div class="app col">${header}${topTabs}<div class="main">${content}</div>${tabs}</div>`;
  } else {
    body = `<div class="app col"><div class="top bar">${brand}<div class="ttabs inline">${MENU.slice(0, 4).map((m, i) => `<span style="${i === 1 ? `border-color:${c.accent};color:${c.fg};font-weight:700` : ""}">${m}</span>`).join("")}</div><span class="grow"></span>${installBtn}${darkBtn}${bell}</div><div class="main">${content}</div></div>`;
  }

  // a phone in a browser has the address bar; installed as an app it opens full screen
  if (device === "mobile") {
    const urlBar = pro.pwa ? "" : `<div class="url">🔒 script.google.com/macros/s/…/exec</div>`;
    body = `<div class="phone"><div class="screen">${urlBar}${body}</div></div>`;
  }

  const fontHref = `https://fonts.googleapis.com/css2?family=${encodeURIComponent(look.font).replace(/%20/g, "+")}:wght@400;600;700&display=swap`;
  const css = `*{box-sizing:border-box}html,body{margin:0;height:100%}body{font-family:'${look.font}',system-ui,sans-serif;background:${device === "mobile" ? "#e5e9f0" : c.bg};color:${c.fg};font-size:13px}
.app{display:flex;min-height:100%;background:${c.bg}}.side{flex-direction:row}.col{flex-direction:column}
.nav{width:170px;flex-shrink:0;background:${c.navBg};color:#cbd5e1;padding:14px 10px;display:flex;flex-direction:column;gap:3px}
.brand{display:flex;align-items:center;gap:8px;font-weight:700;color:inherit;margin-bottom:10px}.logo{width:18px;height:18px;border-radius:5px;display:inline-block}
.nav .brand{color:#fff}.ni{padding:8px 10px;border-radius:8px}.ni.on{color:#fff}
.main{flex:1;min-width:0;display:flex;flex-direction:column}
.top{display:flex;align-items:center;gap:8px;padding:10px 16px;min-height:44px}.bar{border-bottom:1px solid ${c.line};background:${c.card}}
.content{padding:14px 16px;display:flex;flex-direction:column;gap:12px}
.row{display:flex;align-items:center;gap:8px}.wrap{flex-wrap:wrap}.grow{flex:1}.h{font-size:16px;font-weight:700}.b{font-weight:700}.muted{color:${c.muted};font-size:12px}.r{text-align:right;font-weight:600}
.btn{display:inline-flex;align-items:center;gap:6px;height:32px;padding:0 14px;border:1px solid ${c.line};background:${c.card};color:${c.fg};font-weight:600;font-size:12.5px;white-space:nowrap}
.pill{display:inline-flex;align-items:center;height:28px;padding:0 10px;border:1px solid ${c.line};border-radius:999px;font-size:12px;background:${c.card}}
.bar .pill{background:transparent;color:inherit;border-color:currentColor}
.search{display:inline-flex;align-items:center;height:32px;padding:0 10px;border:1px solid ${c.line};border-radius:8px;background:${c.card};color:${c.muted};width:180px}
.chip{display:inline-flex;align-items:center;height:26px;padding:0 10px;border:1px solid ${c.line};border-radius:999px;background:${c.card};font-size:12px}
.card{background:${c.card};border:1px solid ${c.line};border-radius:12px}
.tbl{overflow:hidden}table{width:100%;border-collapse:collapse}th{text-align:left;font-weight:600;color:${c.muted};padding:9px 12px;border-bottom:1px solid ${c.line};font-size:12px}td{padding:9px 12px;border-bottom:1px solid ${c.line}}tr:last-child td{border-bottom:0}
.tag{display:inline-block;padding:2px 8px;border-radius:999px;font-size:11px;font-weight:600}
.kpis{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:10px}.kpi{background:${c.card};border:1px solid ${c.line};border-radius:12px;padding:10px 12px}.num{font-size:22px;font-weight:700}
.stack{display:flex;flex-direction:column;gap:12px;min-width:0;flex:1}.split{display:grid;grid-template-columns:minmax(0,1fr) 230px;gap:12px;align-items:start}
.form{padding:12px;display:flex;flex-direction:column;gap:8px}.form label{display:flex;flex-direction:column;gap:4px;font-size:12px;color:${c.muted}}.in{display:block;height:30px;border:1px solid ${c.line};border-radius:8px;padding:6px 8px;color:${c.fg};background:${c.bg}}
.pp{display:flex;align-items:center;gap:12px;padding:12px}.qr{width:52px;height:52px;border-radius:6px;background:repeating-conic-gradient(${c.fg} 0 25%,transparent 0 50%) 0 0/10px 10px;border:4px solid #fff;outline:1px solid ${c.line}}
.spin{width:11px;height:11px;border:2px solid #fff;border-right-color:transparent;border-radius:50%;display:inline-block}
.modal{position:fixed;right:22px;bottom:22px;width:210px;background:${c.card};border:1px solid ${c.line};border-radius:14px;box-shadow:0 18px 40px rgba(15,23,42,.25);padding:16px;text-align:center;display:flex;flex-direction:column;align-items:center;gap:6px}.ok{font-size:26px;font-weight:700}
.toast{position:fixed;right:16px;top:${device === "mobile" ? 64 : 14}px;background:${c.card};border:1px solid ${c.line};border-radius:10px;box-shadow:0 10px 24px rgba(15,23,42,.2);padding:9px 12px;font-weight:600}
.bell{position:relative;font-size:15px}.bell b{position:absolute;top:-6px;right:-8px;min-width:15px;height:15px;border-radius:8px;background:#dc2626;color:#fff;font-size:9.5px;display:grid;place-items:center}
.banner{display:flex;gap:10px;align-items:center;padding:9px 12px;border-radius:12px;background:${c.card};border:1px solid #fcd34d;box-shadow:0 8px 20px rgba(15,23,42,.12)}.bi{width:28px;height:28px;border-radius:8px;background:#fef3c7;display:grid;place-items:center}
.badges{display:flex;flex-wrap:wrap;align-items:center;gap:6px}.badge{font-size:11px;padding:2px 9px;border-radius:999px;background:${dark ? "#1e3a8a" : "#e2edfc"};color:${dark ? "#bfdbfe" : "#1b5fc1"}}
.ttabs{display:flex;gap:16px;padding:0 16px;border-bottom:1px solid ${c.line};background:${c.card}}.ttabs span{padding:10px 0;border-bottom:2px solid transparent;color:${c.muted}}.ttabs.inline{border:0;padding:0 0 0 24px;background:none}
.tabs{display:flex;justify-content:space-around;border-top:1px solid ${c.line};background:${c.card};padding:8px 0;font-size:11px;color:${c.muted};text-align:center;margin-top:auto}.dot{width:16px;height:16px;border-radius:5px;margin:0 auto 3px;opacity:.85}
.list{display:flex;flex-direction:column;gap:8px}.li{display:flex;align-items:center;justify-content:space-between;background:${c.card};border:1px solid ${c.line};border-radius:12px;padding:10px 12px}
.phone{width:330px;height:640px;margin:16px auto;border-radius:38px;background:#0f172a;padding:10px}.screen{height:100%;border-radius:30px;overflow:hidden;display:flex;flex-direction:column;background:${c.bg};position:relative}.screen>.app{flex:1;min-height:0}
.url{font-size:11px;color:#475569;background:#f1f5f9;border-bottom:1px solid #e2e8f0;padding:8px 14px;text-align:center}
.phone .split{grid-template-columns:1fr}.phone .kpis{grid-template-columns:repeat(3,minmax(0,1fr))}.phone .num{font-size:17px}.phone .search{display:none}.phone .modal{position:absolute}.phone .toast{position:absolute}`;

  return `<!doctype html><html lang="th"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="${fontHref}"><style>${css}</style></head><body>${body}${feedback}</body></html>`;
}

export const STYLE_HEADING = "โดยใช้สไตล์และองค์ประกอบเหล่านี้:";
export const PRO_HEADING = "ความสามารถเสริม (Pro):";

/** The chat text for the picks (the style picker's old buildPrompt, now in the IDE). */
export function stylePromptLines(items: StyleItem[]): string {
  if (items.length === 0) return "";
  return `${STYLE_HEADING}\n${items.map((i) => `- ${i.promptSnippet}`).join("\n")}`;
}

/**
 * "ใส่ในช่องแชท" again: the picks are the whole list each time, so the blocks the app wrote before (a heading
 * line + its "- " lines) are taken out of the box first, then the new ones go under what the user typed.
 */
export function mergeAppBlocks(current: string, blocks: string): string {
  const text = stripAppBlocks(current, [STYLE_HEADING, PRO_HEADING]);
  return text ? `${text}\n\n${blocks}` : blocks;
}

/** The text without the app's own blocks under these headings (a heading line + its "- " lines). */
export function stripAppBlocks(current: string, headings: string[] = [STYLE_HEADING]): string {
  const kept: string[] = [];
  let inBlock = false;
  for (const line of current.split(/\r?\n/)) {
    if (headings.includes(line.trim())) {
      inBlock = true;
      continue;
    }
    if (inBlock && /^\s*-\s/.test(line)) continue;
    inBlock = false;
    kept.push(line);
  }
  return kept.join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

/** The look picked in the demo chips, as one line of the chat message. */
export function lookLine(look: Partial<MockLook>): string {
  const l = safeLook(look);
  const color = LOOK_COLORS.find((c) => c.hex.toLowerCase() === l.color.toLowerCase());
  return `สีหลัก ${color ? `${color.label} ` : ""}${l.color} · ฟอนต์ ${l.font} · โทน${l.tone === "dark" ? "มืด" : "สว่าง"}`;
}

/**
 * The demo's brief. Kept small on purpose (a demo is to look at, then throw away or build on):
 *  - one page file, a few screens, a handful of sample rows — fewer tokens for the AI to write;
 *  - NO google.script.run: the preview stubs it and never calls back (components/ide/PreviewPane.tsx), so a
 *    login or a list that waits on the server would hang there. A login screen lets anyone in instead.
 */
export const DEMO_RULES = [
  "ทำเดโม่หน้าจอให้ดูก่อน (ให้ดูหน้าตาอย่างเดียว เขียนให้สั้นที่สุด):",
  "- เขียนเฉพาะหน้าเว็บในไฟล์ Index.html ไฟล์เดียว (CSS/JS อยู่ในไฟล์นั้น) ส่วน Code.gs มีแค่ doGet ที่เปิดหน้านี้",
  "- ห้ามเรียก google.script.run ในเดโม่ เพราะพรีวิวไม่มีเซิร์ฟเวอร์ จะค้างรอคำตอบ ให้ใช้ข้อมูลตัวอย่างในตัวแปร JS แทน",
  "- ถ้ามีหน้าเข้าสู่ระบบ: ทำแค่หน้าตาฟอร์ม กดเข้าสู่ระบบแล้วเข้าได้เลย ห้ามมีชื่อผู้ใช้/รหัสผ่านตัวอย่างหรือการเทียบรหัสในโค้ด และมีปุ่มเลือกบทบาท (เช่น ผู้ใช้ / แอดมิน) ให้เข้าไปดูหน้าของแต่ละบทบาทได้",
  "- สไตล์ที่เลือกเรื่องความปลอดภัยหรือการเข้าสู่ระบบ (เก็บรหัสแบบปลอดภัย session token ฯลฯ) ให้ทำแค่หน้าตาในเดโม่ ของจริงทำตอนสร้างระบบจริง",
  "- ทำเฉพาะหน้าหลัก ไม่เกิน 3–4 หน้า สลับหน้าด้วย JS ในหน้าเดียว ข้อมูลตัวอย่างหน้าละ 3–5 แถว",
  "- ปุ่มบันทึก/ลบ ให้เปลี่ยนข้อมูลในหน้าและแจ้งผลเหมือนทำได้จริง (ไม่ต้องเก็บถาวร)",
  "- ยังไม่ต้องต่อ Google Sheet ส่งอีเมล หรือเขียนฝั่งเซิร์ฟเวอร์ ไม่ต้องใส่คอมเมนต์ยาว",
].join("\n");

/**
 * "สร้างเดโม่ให้ดูก่อน": the screen only, sample data in the page, nothing wired to Sheets or mail yet —
 * quick to make and cheap to change one's mind about.
 */
export function demoMessage(opts: { description?: string; look?: Partial<MockLook> | null; styles?: StyleItem[]; aiDesigns?: boolean; fromImage?: boolean }): string {
  const parts: string[] = [];
  if (opts.description?.trim()) parts.push(opts.description.trim());
  parts.push(DEMO_RULES);
  if (opts.fromImage) parts.push("ทำหน้าตาให้ใกล้กับรูปที่แนบมา");
  if (opts.look) parts.push(`หน้าตา: ${lookLine(opts.look)}`);
  if (opts.styles && opts.styles.length) parts.push(stylePromptLines(opts.styles));
  if (opts.aiDesigns) parts.push("เลือกสี ฟอนต์ และการจัดวางให้เหมาะกับงานนี้เองได้เลย");
  return parts.join("\n\n");
}

/** After a demo: build the real thing from it. */
/** The style tab's "ให้ AI ปรับตามนี้" on a project that already has code: restyle, keep what it does. */
export const RESTYLE_LEAD =
  "ปรับหน้าตาของระบบที่มีอยู่ให้ใช้สไตล์และองค์ประกอบที่เลือกด้านล่าง ไม่ต้องเปลี่ยนการทำงานหรือข้อมูลเดิม ถ้าข้อไหนต้องเพิ่มฟังก์ชันใหม่ บอกก่อนว่าจะเพิ่มอะไร";

export const BUILD_FROM_DEMO =
  "ใช้หน้าตาแบบเดโม่นี้ สร้างระบบจริงได้เลย: เปลี่ยนข้อมูลตัวอย่างเป็นข้อมูลจริงจาก Google Sheet และเขียนฝั่งเซิร์ฟเวอร์ให้ครบ ถ้ามีหน้าเข้าสู่ระบบ ให้ตรวจสิทธิ์จริงที่เซิร์ฟเวอร์ และเอาปุ่มเลือกบทบาท/ปุ่มดูตัวอย่างของเดโม่ออกให้หมด ส่วนที่ยังไม่ได้ตกลงกันให้ใช้ค่าที่แนะนำ";

/** "เริ่มสร้างเลย" after some talk: stop asking, build. */
export const BUILD_NOW = "สร้างระบบจริงได้เลยตามที่คุยกันไว้ ส่วนที่ยังไม่ได้ตอบให้ใช้ค่าที่แนะนำ";

/** "ตัวอย่างระบบ": one click puts the text in the chat box; the label is what fits on a chip. */
export const START_EXAMPLES: { label: string; text: string }[] = [
  { label: "จองคิวร้านตัดผม", text: "ระบบจองคิวร้านตัดผม ลูกค้ากรอกฟอร์มเลือกวันและเวลา แล้วได้รับอีเมลยืนยันอัตโนมัติ" },
  { label: "สต็อกสินค้า", text: "ระบบสต็อกสินค้า บันทึกของเข้าและของออก แล้วแจ้งเตือนเมื่อสินค้าใกล้หมด" },
  { label: "ขอลางาน", text: "ระบบขอลางาน พนักงานกรอกฟอร์ม หัวหน้ากดอนุมัติ และดูวันลาคงเหลือของแต่ละคนได้" },
  { label: "สรุปยอดขายรายวัน", text: "หน้าสรุปยอดขายรายวันจาก Google Sheet มีกราฟและยอดรวมแยกตามสินค้า" },
  { label: "ส่งอีเมลตามรายชื่อ", text: "ส่งอีเมลอัตโนมัติถึงลูกค้าทุกคนในรายชื่อจาก Google Sheet โดยใส่ชื่อของแต่ละคนในเนื้อหา" },
  { label: "ใบเสนอราคา PDF", text: "ออกใบเสนอราคาเป็น PDF จากแม่แบบ โดยกรอกข้อมูลลูกค้าและรายการสินค้าในฟอร์ม" },
];
