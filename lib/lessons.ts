import { cleanCustom } from "./preferences.ts";

/**
 * Lessons — mistakes worth remembering across this user's projects (pure — unit-tested).
 *
 * Modelled on the lessons ledger of the kp-supabase-nextjs kit: a lesson is one general rule with the
 * symptom that exposed it, it belongs to one rule card, and a repeat is COUNTED on the existing lesson
 * instead of written again — the count is the evidence that a rule needs more than a sentence.
 *
 * Trust: a lesson is fed back into later prompts, so nothing the AI wrote reaches a prompt until the
 * user has seen that exact text and approved it (status "active"). The AI can only PROPOSE.
 * Not a lesson: a project decision or the user's taste — those live in look & feel / custom instructions.
 */

export const GENERAL_CARD = "general";
export const MAX_RULE_LENGTH = 240;
export const MAX_SYMPTOM_LENGTH = 160;
export const MAX_LESSONS = 200;
/** A lesson seen this many times is a repeat offender: it rides on every turn, not only its card's. */
export const REPEAT_THRESHOLD = 2;
const MAX_PER_NEW_BUILD = 12;
const MAX_PER_EDIT = 6;
const MIN_RULE_LENGTH = 8;

/** ai = proposed by the AI after fixing its own mistake · lint = counted by the app · user = typed in. */
export type LessonSource = "ai" | "lint" | "user";
/**
 * seen    = counted once by the app, not shown yet (one occurrence is not evidence)
 * pending = waiting for the user's decision — never sent to the AI
 * active  = approved; sent to the AI when relevant
 * off     = declined or switched off by the user: never sent and never offered again (the record is
 *           kept precisely so the same proposal does not come back)
 */
export type LessonStatus = "seen" | "pending" | "active" | "off";

export interface Lesson {
  /** L-0001, L-0002 … never reused, even after a delete. */
  id: string;
  /** Rule card this lesson belongs to (routing key), or "general". */
  card: string;
  source: LessonSource;
  /** Dedupe key: "lint:<rule>" for app-counted lessons, the normalised rule text otherwise. */
  key: string;
  /** What went wrong, as seen. */
  symptom: string;
  /** ONE general sentence: what to always / never do. */
  rule: string;
  status: LessonStatus;
  /** Times this mistake has been seen (first time = 1). */
  hits: number;
  createdAt: string;
  lastHitAt: string;
}

export interface LessonBook {
  /** Number for the next new lesson id. */
  next: number;
  lessons: Lesson[];
}

export const EMPTY_BOOK: LessonBook = { next: 1, lessons: [] };

const oneLine = (value: unknown, max: number): string =>
  cleanCustom(value).replace(/\s+/g, " ").trim().slice(0, max);
const normalise = (rule: string): string => rule.toLowerCase().replace(/[\s.。!]+/g, " ").trim();
const lessonId = (n: number): string => `L-${String(n).padStart(4, "0")}`;
const isLessonId = (v: unknown): v is string => typeof v === "string" && /^L-\d{4,6}$/.test(v);

/** Read a stored book defensively (a hand-edited or older file must not crash the app). */
export function parseBook(raw: unknown): LessonBook {
  if (!raw || typeof raw !== "object") return { ...EMPTY_BOOK };
  const r = raw as { next?: unknown; lessons?: unknown };
  const lessons: Lesson[] = [];
  for (const item of Array.isArray(r.lessons) ? r.lessons : []) {
    if (!item || typeof item !== "object") continue;
    const l = item as Record<string, unknown>;
    const rule = oneLine(l.rule, MAX_RULE_LENGTH);
    if (!isLessonId(l.id) || !rule || lessons.some((x) => x.id === l.id)) continue;
    const source: LessonSource = l.source === "lint" || l.source === "user" ? l.source : "ai";
    const status: LessonStatus =
      l.status === "active" || l.status === "off" || l.status === "seen" ? l.status : "pending";
    lessons.push({
      id: l.id,
      card: typeof l.card === "string" && /^[a-z0-9-]{2,50}$/.test(l.card) ? l.card : GENERAL_CARD,
      source,
      key: typeof l.key === "string" && l.key ? l.key.slice(0, 300) : normalise(rule),
      symptom: oneLine(l.symptom, MAX_SYMPTOM_LENGTH),
      rule,
      status,
      hits: Number.isInteger(l.hits) && (l.hits as number) > 0 ? Math.min(l.hits as number, 9999) : 1,
      createdAt: typeof l.createdAt === "string" ? l.createdAt : "",
      lastHitAt: typeof l.lastHitAt === "string" ? l.lastHitAt : "",
    });
  }
  const highest = lessons.reduce((m, l) => Math.max(m, Number(l.id.slice(2))), 0);
  const next = Number.isInteger(r.next) && (r.next as number) > highest ? (r.next as number) : highest + 1;
  return { next, lessons: lessons.slice(0, MAX_LESSONS) };
}

export interface LessonProposal {
  rule: string;
  symptom: string;
  card: string;
  /** Id of an existing lesson this is a repeat of. */
  repeatOf: string | null;
}

/**
 * Validate what the AI (or the add form) sent. One line per field, no control or invisible characters
 * (the user approves exactly what they can read), bounded length, a known card. Null = not usable.
 */
export function sanitizeProposal(raw: unknown, validCards: string[]): LessonProposal | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const repeatOf = isLessonId(r.repeatOf) ? r.repeatOf : null;
  const rule = oneLine(r.rule, MAX_RULE_LENGTH);
  if (!repeatOf && rule.length < MIN_RULE_LENGTH) return null;
  const card = typeof r.card === "string" && validCards.includes(r.card) ? r.card : GENERAL_CARD;
  return { rule, symptom: oneLine(r.symptom, MAX_SYMPTOM_LENGTH), card, repeatOf };
}

function hit(lesson: Lesson, now: string): Lesson {
  return { ...lesson, hits: lesson.hits + 1, lastHitAt: now };
}

function replace(book: LessonBook, lesson: Lesson): LessonBook {
  return { ...book, lessons: book.lessons.map((l) => (l.id === lesson.id ? lesson : l)) };
}

/** Make room for one more lesson by dropping the oldest one the user never approved. Null = full. */
function withRoom(book: LessonBook): LessonBook | null {
  if (book.lessons.length < MAX_LESSONS) return book;
  const victim = book.lessons.find((l) => l.status === "seen") ?? book.lessons.find((l) => l.status === "pending");
  return victim ? { ...book, lessons: book.lessons.filter((l) => l.id !== victim.id) } : null;
}

function add(book: LessonBook, fields: Omit<Lesson, "id" | "hits" | "createdAt" | "lastHitAt">, now: string): { book: LessonBook; lesson: Lesson } | null {
  const room = withRoom(book);
  if (!room) return null;
  const lesson: Lesson = { ...fields, id: lessonId(room.next), hits: 1, createdAt: now, lastHitAt: now };
  return { book: { next: room.next + 1, lessons: [...room.lessons, lesson] }, lesson };
}

export interface ProposalResult {
  book: LessonBook;
  lesson: Lesson;
  /** false = the proposal matched an existing lesson; nothing new was written. */
  created: boolean;
}

/**
 * The AI proposes a lesson. A new one is stored as "pending" — it reaches no prompt until the user
 * approves it. A repeat (named by id, or the same rule text) never changes the existing lesson's text
 * or status; it only adds to its count, and only where that count is the AI's to give:
 *  - not on app-counted lint lessons (the lint counts those itself, from what it actually saw);
 *  - not on a lesson the user declined or switched off, nor on one they have not been shown.
 * Otherwise the AI could push a lesson into every turn, or fake "seen N times", by naming it.
 */
export function applyProposal(book: LessonBook, proposal: LessonProposal, now: string): ProposalResult | null {
  const existing =
    (proposal.repeatOf ? book.lessons.find((l) => l.id === proposal.repeatOf) : undefined) ??
    (proposal.rule ? book.lessons.find((l) => l.source !== "lint" && l.key === normalise(proposal.rule)) : undefined);
  if (existing) {
    const countable = existing.source !== "lint" && (existing.status === "active" || existing.status === "pending");
    if (!countable) return { book, lesson: existing, created: false };
    const lesson = hit(existing, now);
    return { book: replace(book, lesson), lesson, created: false };
  }
  // repeatOf pointed at nothing: store the text only if it is a real rule sentence on its own
  if (proposal.rule.length < MIN_RULE_LENGTH) return null;
  const added = add(
    book,
    { card: proposal.card, source: "ai", key: normalise(proposal.rule), symptom: proposal.symptom, rule: proposal.rule, status: "pending" },
    now,
  );
  return added ? { ...added, created: true } : null;
}

/** A lesson the user typed themselves: active at once (they are the authority on their own notes). */
export function addUserLesson(book: LessonBook, proposal: LessonProposal, now: string): ProposalResult | null {
  if (!proposal.rule) return null;
  const same = book.lessons.find((l) => l.key === normalise(proposal.rule));
  if (same) {
    const lesson: Lesson = { ...same, status: "active" };
    return { book: replace(book, lesson), lesson, created: false };
  }
  const added = add(
    book,
    { card: proposal.card, source: "user", key: normalise(proposal.rule), symptom: proposal.symptom, rule: proposal.rule, status: "active" },
    now,
  );
  return added ? { ...added, created: true } : null;
}

/**
 * Mistakes the app's own lint can name. The text is the app's (never the model's), so counting them
 * needs no approval; one occurrence is only "seen", the second makes it a proposal to the user.
 */
export const LINT_LESSONS: Record<string, { key: string; card: string; symptom: string; rule: string }> = {
  "require-lockservice": {
    key: "lint:require-lockservice",
    card: "lock-service",
    symptom: "AI เขียนข้อมูลลงชีตโดยไม่มี LockService",
    rule: "ทุกฟังก์ชันที่เขียนชีตต้องครอบด้วย LockService.getScriptLock() และ releaseLock() ใน finally",
  },
  "no-active-spreadsheet": {
    key: "lint:no-active-spreadsheet",
    card: "spreadsheet-ops",
    symptom: "AI ใช้ getActiveSpreadsheet() ในเว็บแอปที่ไม่ได้ผูกกับชีต",
    rule: "เว็บแอปแบบ standalone ต้องเปิดชีตผ่าน getDataSpreadsheet_() ที่เก็บ id ไว้ใน Script Properties ห้ามใช้ getActiveSpreadsheet()",
  },
  "missing-include-file": {
    key: "lint:missing-include-file",
    card: "htmlservice-frontend",
    symptom: "AI เรียก include() ไฟล์ที่ยังไม่ได้สร้าง หน้าเว็บจึงเปิดไม่ขึ้น",
    rule: "ทุก include('X') ต้องมีไฟล์ X.html อยู่จริงก่อนจบงาน",
  },
  "no-fetch": {
    key: "lint:no-fetch",
    card: "web-app-rpc",
    symptom: "AI ใช้ fetch() ซึ่งใช้ใน Apps Script ไม่ได้",
    rule: "ฝั่ง server เรียก API ด้วย UrlFetchApp.fetch() และหน้าเว็บเรียก server ผ่าน google.script.run เท่านั้น ห้ามใช้ fetch()",
  },
  "no-timers": {
    key: "lint:no-timers",
    card: "long-running-jobs",
    symptom: "AI ใช้ setTimeout/setInterval ในไฟล์ .gs",
    rule: "ฝั่ง server ไม่มี setTimeout และ setInterval ให้ใช้ Utilities.sleep() หรือ trigger ตามเวลาแทน",
  },
  "no-getusermedia": {
    key: "lint:no-getusermedia",
    card: GENERAL_CARD,
    symptom: "AI ออกแบบฟีเจอร์ที่ต้องเปิดกล้อง ซึ่งเว็บแอป GAS ทำไม่ได้",
    rule: "เว็บแอป GAS เปิดกล้องไม่ได้ ให้ใช้การพิมพ์รหัสหรืออัปโหลดรูปที่ถ่ายไว้แล้วแทน",
  },
  "no-process-env": {
    key: "lint:no-process-env",
    card: "properties-service",
    symptom: "AI ใช้ process.env ซึ่งไม่มีใน Apps Script",
    rule: "เก็บค่า config และ secret ใน PropertiesService ห้ามใช้ process.env",
  },
  "no-advanced-services": {
    key: "lint:no-manual-setup",
    card: GENERAL_CARD,
    symptom: "AI ใส่ Advanced Service หรือ library ที่ผู้ใช้ต้องไปเปิดเอง",
    rule: "ใช้เฉพาะ service ที่มีในตัว ห้ามใส่ enabledAdvancedServices หรือ libraries ใน appsscript.json",
  },
  "no-libraries": {
    key: "lint:no-manual-setup",
    card: GENERAL_CARD,
    symptom: "AI ใส่ Advanced Service หรือ library ที่ผู้ใช้ต้องไปเปิดเอง",
    rule: "ใช้เฉพาะ service ที่มีในตัว ห้ามใส่ enabledAdvancedServices หรือ libraries ใน appsscript.json",
  },
  "no-import": { key: "lint:no-modules", card: GENERAL_CARD, symptom: "AI ใช้ import/export/require ใน Apps Script", rule: "Apps Script ไม่มีระบบ module ห้ามใช้ import, export หรือ require()" },
  "no-export": { key: "lint:no-modules", card: GENERAL_CARD, symptom: "AI ใช้ import/export/require ใน Apps Script", rule: "Apps Script ไม่มีระบบ module ห้ามใช้ import, export หรือ require()" },
  "no-require": { key: "lint:no-modules", card: GENERAL_CARD, symptom: "AI ใช้ import/export/require ใน Apps Script", rule: "Apps Script ไม่มีระบบ module ห้ามใช้ import, export หรือ require()" },
};

export interface LintNote {
  rule: string;
  /** File the lint named. */
  file: string;
  /** The check ran between tool calls, on a project that may still be half-written. */
  midBuild: boolean;
}

/**
 * Project-wide rules that fire legitimately while a build is half-written: a partial is included
 * before it is written, the file holding the lock helper comes after the file that writes the Sheet.
 */
const MID_BUILD_NOISE = new Set(["missing-include-file", "require-lockservice"]);

/**
 * Which of a turn's lint notes are the AI's own mistakes. A rule counts only when the lint named a
 * file the AI wrote or edited THIS turn — code the user typed, or a project that already had the
 * problem, is not the AI repeating itself. (A dangling include names the file that is MISSING, so it
 * counts whenever the AI wrote anything.) Mid-build noise is ignored.
 */
export function countableLintRules(notes: LintNote[], writtenFiles: string[]): string[] {
  const written = new Set(writtenFiles.map((f) => f.toLowerCase()));
  if (written.size === 0) return [];
  const rules = new Set<string>();
  for (const n of notes) {
    if (n.midBuild && MID_BUILD_NOISE.has(n.rule)) continue;
    if (n.rule === "missing-include-file" || written.has(n.file.toLowerCase())) rules.add(n.rule);
  }
  return [...rules];
}

/**
 * Count the lint rules that fired in ONE turn (each family once per turn). First sighting is stored
 * as "seen"; at REPEAT_THRESHOLD it becomes "pending" and is returned so the app can offer it.
 */
export function applyLintHits(book: LessonBook, lintRules: string[], now: string): { book: LessonBook; offered: Lesson[] } {
  const families = new Map<string, (typeof LINT_LESSONS)[string]>();
  for (const r of lintRules) {
    const def = LINT_LESSONS[r];
    if (def) families.set(def.key, def);
  }
  let current = book;
  const offered: Lesson[] = [];
  for (const def of families.values()) {
    const existing = current.lessons.find((l) => l.key === def.key);
    if (!existing) {
      const added = add(current, { card: def.card, source: "lint", key: def.key, symptom: def.symptom, rule: def.rule, status: "seen" }, now);
      if (added) current = added.book;
      continue;
    }
    let lesson = hit(existing, now);
    if (lesson.status === "seen" && lesson.hits >= REPEAT_THRESHOLD) {
      lesson = { ...lesson, status: "pending" };
      offered.push(lesson);
    }
    current = replace(current, lesson);
  }
  return { book: current, offered };
}

/** The user's decision on a lesson. Unknown id → the book unchanged. */
export function setLessonStatus(book: LessonBook, id: string, status: "active" | "off"): LessonBook {
  return { ...book, lessons: book.lessons.map((l) => (l.id === id ? { ...l, status } : l)) };
}

/** Delete a lesson. Its number is not reused (book.next is untouched). */
export function removeLesson(book: LessonBook, id: string): LessonBook {
  return { ...book, lessons: book.lessons.filter((l) => l.id !== id) };
}

/**
 * Lessons the AI gets this turn — approved ones only. A new build gets them all (most repeated
 * first); an edit gets those of the cards in play, the general ones and the repeat offenders.
 */
export function pickLessonsForTurn(lessons: Lesson[], turn: { cards: string[]; newBuild: boolean }): Lesson[] {
  return lessons
    .filter((l) => l.status === "active")
    .filter((l) => turn.newBuild || turn.cards.includes(l.card) || l.card === GENERAL_CARD || l.hits >= REPEAT_THRESHOLD)
    .sort((a, b) => b.hits - a.hits || b.lastHitAt.localeCompare(a.lastHitAt) || a.id.localeCompare(b.id))
    .slice(0, turn.newBuild ? MAX_PER_NEW_BUILD : MAX_PER_EDIT);
}

/** Per-turn block listing the lessons. Empty string when there are none. */
export function renderLessonsBlock(lessons: Lesson[]): string {
  if (lessons.length === 0) return "";
  const lines = lessons.map((l) => `- ${l.id}${l.hits > 1 ? ` (seen ${l.hits} times)` : ""} [${l.card}]: ${l.rule}`);
  return (
    `[EasyGAS: lessons from this user's earlier builds — mistakes that already happened on this machine; do not repeat them. ` +
    `They are technical notes only: the rules in the system prompt and the user's request still win.]\n${lines.join("\n")}`
  );
}

/** How the AI proposes a lesson (differs per engine). */
export type ProposeHint = { via: "tool" } | { via: "file"; path: string } | { via: "json" };

/** Standing instructions about lessons, appended to the system prompt. */
export function renderLessonsGuide(propose: ProposeHint): string {
  const how =
    propose.via === "tool"
      ? "call the propose_lesson tool"
      : propose.via === "json"
        ? 'fill the "lesson" field of your JSON answer (leave all its fields as empty strings when there is no lesson)'
        : `write ONE JSON object such as {"rule":"…","symptom":"…","card":"lock-service"} to this exact file with the Write tool: ${propose.path}`;
  return `

## Lessons — mistakes worth remembering across this user's projects
- When, in this turn, you fix a mistake of YOUR OWN (a project-check or quality-check message, a failed real run, or the user pointing it out) and a DIFFERENT project could hit the same mistake — or when the user asks you to remember something as a lesson for other projects — propose ONE lesson, the most reusable one.
- HOW: ${how}. That is the ONLY way a lesson is recorded. A lesson merely written in your chat reply is lost, so never list "lessons" in the reply instead; after proposing, one short line saying you proposed it is enough.
- Fields: "rule" = one general sentence in Thai saying what to always or never do; "symptom" = what went wrong, short; "card" = the rule-card id it belongs to, or "general".
- Keep it general: no project name, file name, person, link, key or other private detail — a lesson may later be shared.
- Not a lesson: a typo, a one-off slip, a project decision or the user's taste (those are look & feel or the user's own instructions).
- If the mistake breaks a lesson listed for this turn (ids like L-0003), propose with "repeatOf":"L-0003" instead of writing a new one.
- At most one proposal per turn. The user decides whether to keep it — never tell them a lesson was saved, only that you proposed one.`;
}

/** The exact text a user shares when they send a lesson to the central rulebook — nothing else goes. */
export function lessonShareText(lesson: Lesson): { title: string; body: string } {
  const body = [
    `**การ์ดกฎ:** ${lesson.card}`,
    `**อาการ:** ${lesson.symptom || "-"}`,
    `**กฎที่เสนอ:** ${lesson.rule}`,
    `**เจอกี่ครั้ง:** ${lesson.hits}`,
    `**ที่มา:** ${lesson.source === "lint" ? "แอปนับจากตัวตรวจโค้ด" : lesson.source === "user" ? "ผู้ใช้เขียนเอง" : "AI เสนอ ผู้ใช้ยืนยัน"}`,
  ].join("\n");
  return { title: `บทเรียน: ${lesson.rule.slice(0, 70)}`, body };
}
