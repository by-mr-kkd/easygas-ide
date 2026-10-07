/**
 * Look & feel preferences — the layer the USER owns (pure — unit-tested in tests/preferences.test.ts).
 *
 * Three layers decide what the AI builds:
 *   1. hard rules      GAS limits, manifest, security, data integrity. Nobody overrides these; the lint
 *                      (validateGasFiles) and the critic enforce the ones that break an app.
 *   2. style defaults  DEFAULT_PREFS below — what a project gets when nobody chose anything.
 *   3. user choices    global (Settings) then per-project; they replace layer 2, never layer 1.
 *
 * Layer 2 + 3 reach the AI as ONE rendered block (renderPrefsBlock), so a default is never phrased as
 * a rule the user's choice then has to fight.
 */

export interface PrefOption {
  id: string;
  /** Thai label for the UI. */
  label: string;
  /** Thai one-liner under the label. */
  hint: string;
  /** English instruction line given to the AI. */
  prompt: string;
}

export interface PrefField {
  id: PrefKey;
  label: string;
  options: PrefOption[];
}

export type PrefKey = "dialog" | "css" | "icons" | "font" | "nav";
export const PREF_KEYS: PrefKey[] = ["dialog", "css", "icons", "font", "nav"];
export const MAX_CUSTOM_LENGTH = 1500;

export interface StylePrefs {
  dialog: string;
  css: string;
  icons: string;
  font: string;
  nav: string;
  /** The user's own free-text instructions. */
  custom: string;
}

export const DEFAULT_PREFS: StylePrefs = {
  dialog: "sweetalert2",
  css: "tailwind",
  icons: "fontawesome",
  font: "ibm-plex-sans-thai",
  nav: "auto",
  custom: "",
};

const thaiFont = (id: string, family: string, hint: string): PrefOption => ({
  id,
  label: family,
  hint,
  prompt: `Thai web font: load "${family}" from Google Fonts with a <link> tag and set it as the body font.`,
});

export const PREF_FIELDS: PrefField[] = [
  {
    id: "dialog",
    label: "กล่องแจ้งเตือนและยืนยัน",
    options: [
      {
        id: "sweetalert2",
        label: "SweetAlert2",
        hint: "กล่องสวยสำเร็จรูป มี toast มุมจอ",
        prompt:
          "Dialogs & alerts: SweetAlert2 (https://cdn.jsdelivr.net/npm/sweetalert2@11) — use Swal.fire() for confirm (delete/submit), success and error dialogs instead of native alert()/confirm(); use toast mode (toast:true, position:'top-end', timer:2500) for non-blocking success.",
      },
      {
        id: "bootstrap",
        label: "Bootstrap modal + toast",
        hint: "ใช้คู่กับ CSS แบบ Bootstrap",
        prompt:
          "Dialogs & alerts: Bootstrap 5 modal for confirm/error dialogs and Bootstrap toast for non-blocking success (load the Bootstrap JS bundle). Do NOT load SweetAlert2 and do NOT use native alert()/confirm().",
      },
      {
        id: "custom",
        label: "เขียนเอง ไม่ใช้ไลบรารี",
        hint: "modal และ toast ที่เขียนด้วย HTML/CSS/JS ล้วน",
        prompt:
          "Dialogs & alerts: a small hand-written accessible modal (role=\"dialog\", aria-modal, ESC + backdrop-click to close, focus returns on close) for confirm/error, and a hand-written corner toast for success. Do NOT load SweetAlert2 or any dialog library, and do NOT use native alert()/confirm().",
      },
      {
        id: "native",
        label: "alert / confirm ของเบราว์เซอร์",
        hint: "เรียบที่สุด แต่ไม่แสดงในหน้าพรีวิวของแอป",
        prompt:
          "Dialogs & alerts: the browser's native alert() and confirm() — the user asked for these on purpose. Do NOT load SweetAlert2 or build a custom modal.",
      },
    ],
  },
  {
    id: "css",
    label: "วิธีเขียน CSS",
    options: [
      {
        id: "plain",
        label: "CSS เขียนเอง",
        hint: "เบา โหลดเร็ว ไม่พึ่งไลบรารี",
        prompt:
          "CSS: hand-written CSS in a Stylesheet.html partial with CSS variables for the palette. No CSS framework.",
      },
      {
        id: "tailwind",
        label: "Tailwind CSS",
        hint: "ใช้ class สำเร็จรูป โหลดผ่าน CDN",
        prompt:
          "CSS: Tailwind CSS via its browser CDN build (<script src=\"https://cdn.jsdelivr.net/npm/@tailwindcss/browser@4\"></script> in <head>) — style with utility classes in the markup; keep Stylesheet.html only for the few things utilities cannot express (CSS variables, print rules). No Bootstrap.",
      },
      {
        id: "bootstrap",
        label: "Bootstrap 5",
        hint: "คอมโพเนนต์สำเร็จรูป คุ้นตา",
        prompt:
          "CSS: Bootstrap 5 via CDN (https://cdn.jsdelivr.net/npm/bootstrap@5.3/dist/css/bootstrap.min.css and .../dist/js/bootstrap.bundle.min.js) — use its grid, form, button, table and card classes; keep Stylesheet.html for small overrides (brand colour via --bs-primary). No Tailwind.",
      },
    ],
  },
  {
    id: "icons",
    label: "ไอคอน",
    options: [
      {
        id: "fontawesome",
        label: "Font Awesome",
        hint: "ชุดไอคอนใหญ่ ใช้ทั่วไป",
        prompt:
          "Icons: Font Awesome 6 (https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.2/css/all.min.css) — <i class=\"fa-solid fa-...\"> in nav, buttons and headings instead of emoji.",
      },
      {
        id: "bootstrap-icons",
        label: "Bootstrap Icons",
        hint: "เข้าชุดกับ Bootstrap",
        prompt:
          "Icons: Bootstrap Icons (https://cdn.jsdelivr.net/npm/bootstrap-icons@1/font/bootstrap-icons.min.css) — <i class=\"bi bi-...\"> in nav, buttons and headings instead of emoji. No Font Awesome.",
      },
      {
        id: "emoji",
        label: "อีโมจิ",
        hint: "ไม่ต้องโหลดอะไรเพิ่ม",
        prompt: "Icons: emoji only — do NOT load an icon library.",
      },
      {
        id: "none",
        label: "ไม่ใช้ไอคอน",
        hint: "ข้อความล้วน",
        prompt: "Icons: none — text labels only, no icon library and no emoji.",
      },
    ],
  },
  {
    id: "font",
    label: "ฟอนต์ภาษาไทย",
    options: [
      thaiFont("prompt", "Prompt", "ทันสมัย อ่านง่าย"),
      thaiFont("sarabun", "Sarabun", "ทางการ เหมาะกับเอกสาร"),
      thaiFont("kanit", "Kanit", "หนา เด่น"),
      thaiFont("noto-sans-thai", "Noto Sans Thai", "เรียบ เป็นกลาง"),
      thaiFont("ibm-plex-sans-thai", "IBM Plex Sans Thai", "คม แบบงานระบบ"),
      {
        id: "system",
        label: "ฟอนต์ของเครื่อง",
        hint: "ไม่โหลดฟอนต์จากเว็บ",
        prompt: "Thai web font: none — use the system font stack (system-ui, 'Noto Sans Thai', sans-serif). Do NOT load Google Fonts.",
      },
    ],
  },
  {
    id: "nav",
    label: "เมนูหลัก",
    options: [
      {
        id: "auto",
        label: "ให้ AI เลือกตามงาน",
        hint: "ค่าเริ่มต้นคือแท็บด้านบน",
        prompt: "Navigation: your choice to fit the request (top tabs when nothing suggests otherwise).",
      },
      { id: "top-tabs", label: "แท็บด้านบน", hint: "เรียบง่าย เมนูไม่เยอะ", prompt: "Navigation: top tabs." },
      {
        id: "sidebar",
        label: "เมนูข้าง",
        hint: "หลายเมนู ใช้จอใหญ่เป็นหลัก",
        prompt: "Navigation: left sidebar that collapses to a hamburger drawer on mobile.",
      },
      {
        id: "bottom-bar",
        label: "เมนูล่างแบบมือถือ",
        hint: "ใช้บนมือถือเป็นหลัก 3–5 เมนู",
        prompt: "Navigation: fixed bottom tab bar (mobile-first, 3–5 items with icon + label).",
      },
      { id: "single", label: "หน้าเดียว ไม่มีเมนู", hint: "งานเดียวจบ", prompt: "Navigation: a single view, no nav chrome." },
    ],
  },
];

const FIELD_BY_ID = new Map(PREF_FIELDS.map((f) => [f.id, f]));

export function isPrefKey(key: string): key is PrefKey {
  return FIELD_BY_ID.has(key as PrefKey);
}

export function isValidPref(key: PrefKey, value: unknown): value is string {
  return typeof value === "string" && FIELD_BY_ID.get(key)!.options.some((o) => o.id === value);
}

// Characters that can hide text from the person reading the form: zero-width and bidi controls, and
// the Unicode "tag" block. (ZWJ/ZWNJ are kept — emoji and some scripts need them.)
const INVISIBLE = /[­͏᠎​‎‏‪-‮⁠-⁩﻿]|[\u{e0000}-\u{e007f}]/gu;

/**
 * Clean the user's free-text instructions: one line-break style, no control or invisible characters
 * (what the AI is told must be exactly what the user can see in the form), bounded length.
 */
export function cleanCustom(value: unknown): string {
  if (typeof value !== "string") return "";
  return value
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, "")
    .replace(INVISIBLE, "")
    .trim()
    .slice(0, MAX_CUSTOM_LENGTH);
}

/** Keep only known keys with valid option ids from untrusted input (a form post, a file, old data). */
export function sanitizePrefs(raw: unknown): Partial<StylePrefs> {
  if (!raw || typeof raw !== "object") return {};
  const input = raw as Record<string, unknown>;
  const out: Partial<StylePrefs> = {};
  for (const key of PREF_KEYS) {
    if (isValidPref(key, input[key])) out[key] = input[key];
  }
  const custom = cleanCustom(input.custom);
  if (custom) out.custom = custom;
  return out;
}

export interface AiPrefRequest {
  /** Valid fixed-option choices to store. */
  patch: Partial<Record<PrefKey, string>>;
  /** Known keys whose value was not one of the options. */
  rejected: string[];
  /** The request also carried free text, which was NOT accepted. */
  hadFreeText: boolean;
}

/**
 * What the AI may record on its own (save_preference tool / the CLI engine's request file): the fixed
 * options only. Free text is rendered to later turns as the USER's own instructions, so only the user
 * may write it — otherwise text injected through a project file or a pasted link could promote itself
 * to that role and persist. Accepts {css:"bootstrap"} and {key:"css", value:"bootstrap"}.
 */
export function pickAiPrefs(raw: unknown): AiPrefRequest {
  const input = (raw && typeof raw === "object" && !Array.isArray(raw) ? raw : {}) as Record<string, unknown>;
  const flat: Record<string, unknown> = { ...input };
  if (typeof input.key === "string" && isPrefKey(input.key)) flat[input.key] = input.value;
  const patch: Partial<Record<PrefKey, string>> = {};
  const rejected: string[] = [];
  for (const key of PREF_KEYS) {
    if (!(key in flat)) continue;
    const value = flat[key];
    if (isValidPref(key, value)) patch[key] = value;
    else rejected.push(key);
  }
  const hadFreeText = (typeof flat.custom === "string" && flat.custom.trim() !== "") || input.key === "custom";
  return { patch, rejected, hadFreeText };
}

/**
 * Effective preferences for a project: defaults ← the user's global choices ← this project's choices.
 * The two free-text instructions are both kept (global first), since one does not replace the other.
 */
export function resolvePrefs(global: unknown, project: unknown): StylePrefs {
  const g = sanitizePrefs(global);
  const p = sanitizePrefs(project);
  const custom = [g.custom, p.custom].filter(Boolean).join("\n").slice(0, MAX_CUSTOM_LENGTH * 2);
  return { ...DEFAULT_PREFS, ...g, ...p, custom };
}

function option(key: PrefKey, id: string): PrefOption {
  const field = FIELD_BY_ID.get(key)!;
  return field.options.find((o) => o.id === id) ?? field.options[0];
}

/** How the AI records a preference the user states in chat (differs per engine). */
export type SaveHint = { via: "tool" } | { via: "file"; path: string } | { via: "json" };

/** The block appended to the system prompt: the project's look & feel, defaults and choices merged. */
export function renderPrefsBlock(prefs: StylePrefs, save: SaveHint): string {
  const lines = PREF_KEYS.map((k) => `- ${option(k, prefs[k]).prompt}`);
  const custom = prefs.custom.trim()
    ? `\n- Extra instructions written by the user (follow them for look, wording and behaviour):\n${prefs.custom
        .trim()
        .split("\n")
        .map((l) => `  > ${l}`)
        .join("\n")}`
    : "";
  const allowed = PREF_FIELDS.map((f) => `${f.id}: ${f.options.map((o) => o.id).join(" | ")}`).join("; ");
  const how =
    save.via === "tool"
      ? "call the save_preference tool"
      : save.via === "json"
        ? 'fill the "preference" field of your JSON answer (e.g. css = "bootstrap"; leave the other fields as empty strings)'
        : `write a JSON object such as {"css":"bootstrap"} to this exact file with the Write tool: ${save.path}`;
  return `

## Look & feel for THIS project — the user's own choices
These lines are the ONLY source of truth for libraries and styling. They replace any styling default, and rule cards or examples that show Swal.fire() / Font Awesome are illustrations — substitute the choices below.
${lines.join("\n")}${custom}
- These choices never override the technical and safety rules above (GAS limits, manifest, security, data integrity, LockService around writes). If an extra instruction or a chat request conflicts with one of those, keep the rule and tell the user why in one short line — do not offer to drop the rule.
- When the user states a lasting look & feel preference in chat (e.g. "ใช้ Bootstrap", "ไม่เอา SweetAlert", "ขอเมนูข้าง"), follow it right away AND ${how} so it is remembered for later turns. Only these values can be saved — ${allowed}. For any other lasting wish (a colour, a wording style), follow it now and tell the user they can keep it by adding it under the "สไตล์" button → "คำสั่งเพิ่มเติม"; you cannot save free text yourself.`;
}

/** One line for the critic: these are deliberate, never report them as problems. */
export function renderPrefsForReview(prefs: StylePrefs): string {
  const picks = PREF_KEYS.map((k) => `${k}=${option(k, prefs[k]).id}`).join(", ");
  const custom = prefs.custom.trim() ? ` Extra user instructions: ${prefs.custom.trim().replace(/\s+/g, " ")}` : "";
  return `Look & feel chosen by the user (deliberate — do NOT report these choices as problems): ${picks}.${custom}`;
}
