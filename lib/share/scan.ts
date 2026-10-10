// Vendored copy of EasyGAS-Site/lib/share-scan.ts — keep the two in step (the website is the final gate).
/**
 * What may not travel inside shared code. Pure functions (no server import) so the same rules run in the
 * desktop app before upload and here on the website as the final gate.
 *
 * Two levels: `block` = a credential (API key, token, private key, password) — the share is refused;
 * `warn` = something personal that still works for the sharer only (a file id, an email, a phone number) —
 * the app asks the sharer to confirm, and the website lists it under the share so a cloner knows.
 */

export type Finding = { level: "block" | "warn"; kind: string; file: string; line: number; sample: string };

export type ShareFile = { name: string; source: string };

const PLACEHOLDER = /your|xxx|<|>|\.\.\.|ใส่|ตรงนี้|example|changeme|ตัวอย่าง|^(.)\1+$/i;

/** Credentials: any one of these refuses the share. */
const BLOCK: { kind: string; re: RegExp }[] = [
  { kind: "Google API key", re: /AIza[0-9A-Za-z_-]{35}/g },
  { kind: "private key", re: /-----BEGIN [A-Z ]*PRIVATE KEY-----/g },
  { kind: "OpenAI / Anthropic key", re: /\bsk-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "GitHub token", re: /\bgh[pousr]_[A-Za-z0-9]{30,}\b/g },
  { kind: "Slack token", re: /\bxox[abpr]-[A-Za-z0-9-]{10,}\b/g },
  { kind: "Slack webhook", re: /hooks\.slack\.com\/services\/[A-Za-z0-9/]+/g },
  { kind: "Discord webhook", re: /discord(?:app)?\.com\/api\/webhooks\/\d+\/[A-Za-z0-9_-]+/g },
  { kind: "Google OAuth client secret", re: /\bGOCSPX-[A-Za-z0-9_-]{20,}\b/g },
  { kind: "JWT", re: /\beyJ[A-Za-z0-9_-]{10,}\.eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g },
];

/** `token = "…"`-style assignments with a long literal that is not a placeholder. */
const ASSIGN = /\b(token|secret|password|passwd|pwd|api[_-]?key|apikey|access[_-]?key|client[_-]?secret|channel[_-]?access[_-]?token|line[_-]?token|notify[_-]?token)\b\s*[:=]\s*['"`]([^'"`\n]{16,})['"`]/gi;

/** Personal but harmless to the reader: warned, not refused. */
const WARN: { kind: string; re: RegExp }[] = [
  // Drive / Sheets / Docs / Forms file ids as string literals (a cloner would write into the sharer's file)
  { kind: "ID ไฟล์ Google (Sheets/Drive/Docs)", re: /['"`](1[A-Za-z0-9_-]{30,70})['"`]/g },
  { kind: "Script ID / Deployment ID", re: /['"`](AKfycb[A-Za-z0-9_-]{20,})['"`]/g },
  { kind: "อีเมล", re: /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}\b/g },
  { kind: "เบอร์โทร", re: /(?<![\d-])0[689]\d-?\d{3}-?\d{4}(?!\d)/g },
  { kind: "LINE user / group id", re: /['"`]([UCR][0-9a-f]{32})['"`]/g },
];

const mask = (s: string): string => (s.length <= 8 ? "•".repeat(s.length) : `${s.slice(0, 4)}…${s.slice(-3)}`);

const lineOf = (text: string, index: number): number => {
  let n = 1;
  for (let i = 0; i < index; i++) if (text.charCodeAt(i) === 10) n++;
  return n;
};

function scanOne(file: ShareFile): Finding[] {
  const out: Finding[] = [];
  const text = file.source;
  const push = (level: Finding["level"], kind: string, index: number, sample: string) =>
    out.push({ level, kind, file: file.name, line: lineOf(text, index), sample: mask(sample) });

  for (const { kind, re } of BLOCK) for (const m of text.matchAll(re)) push("block", kind, m.index, m[0]);
  for (const m of text.matchAll(ASSIGN)) {
    const value = m[2].trim();
    if (PLACEHOLDER.test(value) || /\s/.test(value)) continue;
    push("block", `ค่า ${m[1]} ฝังในโค้ด`, m.index, value);
  }
  // appsscript.json carries no personal data by design; ids inside it are a Library/AddOn reference
  if (file.name === "appsscript.json") return out;
  for (const { kind, re } of WARN) {
    for (const m of text.matchAll(re)) {
      const value = m[1] ?? m[0];
      if (kind === "อีเมล" && /@(example\.com|gmail\.com)$/i.test(value) && /^(you|user|someone|name|email|test)@/i.test(value)) continue;
      push("warn", kind, m.index, value);
    }
  }
  return out;
}

/** Every finding, blocking ones first; the same place is reported once. */
export function scanShare(files: ShareFile[]): { blocked: Finding[]; warnings: Finding[] } {
  const seen = new Set<string>();
  const all = files.flatMap(scanOne).filter((f) => {
    const key = `${f.file}:${f.line}:${f.kind}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  return { blocked: all.filter((f) => f.level === "block"), warnings: all.filter((f) => f.level === "warn") };
}

// ---------- what the code is about ----------

const SERVICES: { tag: string; re: RegExp }[] = [
  { tag: "Sheets", re: /\bSpreadsheetApp\b/ },
  { tag: "Gmail", re: /\b(GmailApp|MailApp)\b/ },
  { tag: "Drive", re: /\bDriveApp\b/ },
  { tag: "Docs", re: /\bDocumentApp\b/ },
  { tag: "Slides", re: /\bSlidesApp\b/ },
  { tag: "Forms", re: /\bFormApp\b/ },
  { tag: "Calendar", re: /\bCalendarApp\b/ },
  { tag: "LINE", re: /api\.line\.me|notify-api\.line\.me|\bLINE_/i },
  { tag: "PDF", re: /getAs\(\s*['"`]application\/pdf|MimeType\.PDF/ },
  { tag: "Trigger", re: /\bScriptApp\.newTrigger\b/ },
  { tag: "กล้อง", re: /getUserMedia|capture=["']?(camera|environment)/ },
];

export function detectServices(files: ShareFile[]): string[] {
  const text = files.map((f) => f.source).join("\n");
  return SERVICES.filter((s) => s.re.test(text)).map((s) => s.tag);
}

/** oauthScopes from appsscript.json, when it parses. */
export function readScopes(files: ShareFile[]): string[] {
  const manifest = files.find((f) => f.name === "appsscript.json");
  if (!manifest) return [];
  try {
    const j = JSON.parse(manifest.source) as { oauthScopes?: unknown };
    return Array.isArray(j.oauthScopes) ? j.oauthScopes.filter((s): s is string => typeof s === "string").slice(0, 30) : [];
  } catch {
    return [];
  }
}

/** Thai gloss for a scope, for the card under a share. */
export function scopeLabel(scope: string): string {
  const s = scope.replace(/^https:\/\/www\.googleapis\.com\/auth\//, "");
  const MAP: Record<string, string> = {
    spreadsheets: "อ่าน/เขียน Google Sheets",
    "spreadsheets.currentonly": "ชีตที่ผูกอยู่เท่านั้น",
    "drive.file": "ไฟล์ที่แอปสร้างเองใน Drive",
    drive: "ทั้ง Google Drive",
    "drive.readonly": "อ่าน Google Drive",
    "gmail.send": "ส่งอีเมลในนามคุณ",
    "gmail.readonly": "อ่านอีเมล",
    gmail: "ทั้ง Gmail",
    "script.send_mail": "ส่งอีเมลในนามคุณ",
    "script.external_request": "เรียกเว็บภายนอก (เช่น LINE)",
    "script.scriptapp": "ตั้ง trigger ให้ตัวเอง",
    "script.container.ui": "เมนูในชีต/เอกสาร",
    "userinfo.email": "รู้อีเมลของผู้ใช้",
    documents: "Google Docs",
    presentations: "Google Slides",
    forms: "Google Forms",
    calendar: "Google Calendar",
    "calendar.readonly": "อ่าน Google Calendar",
  };
  return MAP[s] ?? s;
}

// ---------- app only: Fast Track code attachments ----------

export const REDACTED = "«ซ่อนคีย์ไว้»";
const PRIVATE_KEY_BLOCK = /-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?(?:-----END [A-Z ]*PRIVATE KEY-----|$)/g;

/**
 * The same credentials scanShare refuses, masked in place instead (code attached to a support question goes
 * to the owner only, and the asker often does not know how to take a key out). Returns how many were masked.
 */
export function redactCredentials(text: string): { text: string; count: number } {
  let count = 0;
  const hide = () => {
    count++;
    return REDACTED;
  };
  let out = text.replace(PRIVATE_KEY_BLOCK, hide);
  for (const { re } of BLOCK) out = out.replace(re, hide);
  out = out.replace(ASSIGN, (whole: string, _name: string, value: string) => {
    const v = value.trim();
    if (PLACEHOLDER.test(v) || /\s/.test(v) || v === REDACTED) return whole;
    count++;
    return whole.replace(value, REDACTED);
  });
  return { text: out, count };
}
