import { readFile, rename } from "node:fs/promises";
import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { getFiles } from "@/lib/files";
import { validateGasFiles } from "@/lib/gas-codegen";
import { writeJsonAtomic } from "@/lib/local/json-store";
import { lessonsPath } from "@/lib/local/paths";
import {
  addUserLesson,
  applyLintHits,
  applyProposal,
  countableLintRules,
  EMPTY_BOOK,
  GENERAL_CARD,
  parseBook,
  removeLesson,
  sanitizeProposal,
  setLessonStatus,
  type Lesson,
  type LessonBook,
  type LintNote,
} from "@/lib/lessons";
import { getActivePack } from "@/lib/rulebook/store";
import type { EgsProject } from "@/types/db";

/**
 * The lesson book on disk (server-only): <data root>/lessons.json — one book for the whole machine,
 * because a lesson is by definition something another project would hit. All changes go through one
 * queue (an agent turn and a Settings click can overlap). The rules live in lib/lessons (pure).
 */

/** The guide tells the AI "at most one proposal per turn"; more are refused. */
const MAX_AI_PROPOSALS_PER_TURN = 1;

interface TurnState {
  /** Files the AI wrote or edited this turn. */
  written: Set<string>;
  lint: LintNote[];
  /** New proposals to show the user when the turn ends. */
  offered: Lesson[];
  aiProposals: number;
}

const g = globalThis as unknown as {
  __egsLessonsWrite?: Promise<unknown>;
  __egsLessonTurns?: Map<string, TurnState>;
};
const turns = (g.__egsLessonTurns ??= new Map<string, TurnState>());

/**
 * Load the book. A missing file is an empty book. An unreadable one (hand-edited into invalid JSON, a
 * torn write) also reads as empty and is flagged — lessons are an extra, so a broken file must never
 * take down a chat turn or the Settings page.
 */
async function load(): Promise<{ book: LessonBook; damaged: boolean }> {
  let text: string;
  try {
    text = await readFile(lessonsPath(), "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return { book: EMPTY_BOOK, damaged: false };
    console.error("[lessons] cannot read the lesson book:", (e as Error).message);
    return { book: EMPTY_BOOK, damaged: true };
  }
  try {
    return { book: parseBook(JSON.parse(text)), damaged: false };
  } catch {
    console.error("[lessons] the lesson book is not valid JSON — ignoring it (it is kept on disk)");
    return { book: EMPTY_BOOK, damaged: true };
  }
}

export async function readLessons(): Promise<LessonBook> {
  return (await load()).book;
}

/** Read-modify-write the book in one queued step. `change` returns the new book (or the same one). */
function mutate<T>(change: (book: LessonBook) => { book: LessonBook; result: T }): Promise<T> {
  const run = (g.__egsLessonsWrite ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const { book: current, damaged } = await load();
      const { book, result } = change(current);
      if (book !== current) {
        // never write over a file we could not read: set it aside so the user's lessons can be recovered
        if (damaged) await rename(lessonsPath(), `${lessonsPath()}.damaged-${Date.now()}`).catch(() => {});
        await writeJsonAtomic(lessonsPath(), book);
      }
      return result;
    });
  g.__egsLessonsWrite = run;
  return run;
}

async function validCards(): Promise<string[]> {
  return [...(await getActivePack()).pack.rules.map((r) => r.id), GENERAL_CARD];
}

function turnOf(projectId: string): TurnState {
  let t = turns.get(projectId);
  if (!t) turns.set(projectId, (t = { written: new Set(), lint: [], offered: [], aiProposals: 0 }));
  return t;
}

// ── bookkeeping during a turn (cheap, in memory; closed by finishTurnLessons) ──

/** The AI wrote or edited this project file during the running turn. */
export function noteWrittenFile(projectId: string, path: string): void {
  turnOf(projectId).written.add(path);
}

/**
 * Lint issues seen during the running turn. `midBuild` = the check ran between tool calls on a project
 * that may still be incomplete. What counts as the AI's own mistake is decided at the end of the turn
 * (lib/lessons countableLintRules).
 */
export function noteLintIssues(
  projectId: string,
  issues: { rule: string; file: string }[],
  opts: { midBuild?: boolean } = {},
): void {
  if (issues.length === 0) return;
  const t = turnOf(projectId);
  for (const i of issues) t.lint.push({ rule: i.rule, file: i.file, midBuild: opts.midBuild === true });
}

/** Lint the project as the turn leaves it (problems the AI did not fix before stopping). */
async function noteFinalLint(project: EgsProject): Promise<void> {
  const files = await getFiles(project.id);
  if (files.length === 0) return;
  const lint = validateGasFiles(
    files.map((f) => ({ name: f.path, content: f.content })),
    { isWebApp: project.kind !== "bound", allowCamera: cameraAllowedFor(project) },
  );
  noteLintIssues(project.id, [...lint.errors, ...lint.warnings]);
}

/**
 * The AI proposes a lesson (propose_lesson tool, or the CLI engine's request file). Stored as pending;
 * the user is shown it at the end of the turn. Returns a line for the AI.
 */
export async function proposeLesson(projectId: string, input: unknown): Promise<{ content: string; isError: boolean }> {
  const proposal = sanitizeProposal(input, await validCards());
  if (!proposal) {
    return { isError: true, content: "ไม่ได้เสนอ — ต้องมี rule เป็นประโยคเดียวที่ใช้ได้กับโปรเจกต์อื่น (หรือ repeatOf เป็น id ของบทเรียนเดิม)" };
  }
  const t = turnOf(projectId);
  if (t.aiProposals >= MAX_AI_PROPOSALS_PER_TURN) {
    return { isError: true, content: "รอบนี้เสนอบทเรียนไปแล้ว — เสนอได้รอบละหนึ่งข้อ" };
  }
  const now = new Date().toISOString();
  const outcome = await mutate((book) => {
    const r = applyProposal(book, proposal, now);
    return { book: r?.book ?? book, result: r ? { ...r, counted: r.book !== book } : null };
  });
  if (!outcome) return { isError: true, content: "ไม่ได้เสนอ — ไม่พบบทเรียนที่อ้างถึง หรือสมุดบทเรียนเต็ม" };
  t.aiProposals++; // only a proposal that was accepted uses up the turn's allowance
  if (!outcome.created) {
    return {
      isError: false,
      content: outcome.counted
        ? `นับเป็นการเจอซ้ำของ ${outcome.lesson.id} แล้ว (รวม ${outcome.lesson.hits} ครั้ง)`
        : `มีบทเรียนนี้อยู่แล้ว (${outcome.lesson.id}) — ไม่ต้องเสนอซ้ำ`,
    };
  }
  t.offered.push(outcome.lesson);
  return { isError: false, content: `เสนอบทเรียน ${outcome.lesson.id} แล้ว — ผู้ใช้จะเป็นคนตัดสินว่าจะเก็บไว้หรือไม่ (อย่าบอกว่าบันทึกแล้ว)` };
}

/**
 * Close a turn (EVERY route that runs an agent loop must call this, on success and on failure): count
 * the lint rules that were the AI's own mistakes, and return the lessons to OFFER the user now — the
 * AI's new proposal, plus app-counted ones that just reached the repeat threshold. Never throws.
 * `project` adds a final lint of the files as the turn leaves them.
 */
export async function finishTurnLessons(projectId: string, project?: EgsProject): Promise<Lesson[]> {
  try {
    if (project && turns.get(projectId)?.written.size) await noteFinalLint(project);
  } catch (e) {
    console.error("[lessons] final lint failed (non-fatal):", e);
  }
  const t = turns.get(projectId);
  if (!t) return [];
  turns.delete(projectId);
  try {
    const rules = countableLintRules(t.lint, [...t.written]);
    const now = new Date().toISOString();
    const promoted = rules.length
      ? await mutate((book) => {
          const r = applyLintHits(book, rules, now);
          return { book: r.book, result: r.offered };
        })
      : [];
    return [...t.offered, ...promoted];
  } catch (e) {
    console.error("[lessons] could not close the turn (non-fatal):", e);
    return t.offered;
  }
}

// ── the user's own actions (Settings, and the offer card in chat). false = no such lesson any more ──

function changeStatus(id: string, status: "active" | "off"): Promise<boolean> {
  return mutate((book) => {
    const found = book.lessons.some((l) => l.id === id);
    return { book: found ? setLessonStatus(book, id, status) : book, result: found };
  });
}

/** Keep a lesson: from now on the AI is told about it when it applies. */
export const approveLesson = (id: string): Promise<boolean> => changeStatus(id, "active");

/** Decline or switch off: kept on file (so it is not proposed again) but never sent. */
export const switchLesson = (id: string, on: boolean): Promise<boolean> => changeStatus(id, on ? "active" : "off");

export function deleteLesson(id: string): Promise<boolean> {
  return mutate((book) => {
    const found = book.lessons.some((l) => l.id === id);
    return { book: found ? removeLesson(book, id) : book, result: found };
  });
}

export type AddLessonResult = { ok: true; lesson: Lesson } | { ok: false; reason: "invalid" | "full" };

export async function addOwnLesson(input: unknown): Promise<AddLessonResult> {
  const proposal = sanitizeProposal(input, await validCards());
  if (!proposal || !proposal.rule) return { ok: false, reason: "invalid" };
  const now = new Date().toISOString();
  return mutate<AddLessonResult>((book) => {
    const r = addUserLesson(book, { ...proposal, repeatOf: null }, now);
    return r ? { book: r.book, result: { ok: true, lesson: r.lesson } } : { book, result: { ok: false, reason: "full" } };
  });
}
