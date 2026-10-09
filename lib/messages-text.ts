/**
 * Reading stored chat rows as plain conversation (pure — unit-tested in tests/messages-text.test.ts).
 *
 * messages.jsonl holds rows written by different engines in different shapes:
 *   - text rows      { role, content: "…" }                        the CLI engines
 *   - Anthropic rows { role, content: [ {type:"text"|"tool_use"|"tool_result", …} ] }
 *   - OpenAI rows    { role, content: { role, content, tool_calls?, tool_call_id? } }   (the whole message)
 * The API loops replay their own shape verbatim. Everything else — a CLI that was not there for some
 * turns, an API loop reading turns a CLI wrote — needs the words only.
 */

export interface StoredRow {
  role: string;
  content: unknown;
}

export interface TranscriptEntry {
  role: "user" | "assistant";
  text: string;
}

const isOpenAiMessage = (c: unknown): c is { role: string; content?: unknown; tool_calls?: unknown } =>
  !!c && typeof c === "object" && !Array.isArray(c) && typeof (c as { role?: unknown }).role === "string";

/** Text of one content value: a string, or the text blocks of an Anthropic block list. */
function plainText(content: unknown): string {
  if (typeof content === "string") return content;
  if (!Array.isArray(content)) return "";
  return content
    .map((b) => (b && typeof b === "object" && (b as { type?: unknown }).type === "text" ? String((b as { text?: unknown }).text ?? "") : ""))
    .filter(Boolean)
    .join("\n");
}

/** What was said in a row, or null when it carries no words (tool traffic, system messages). */
export function rowText(row: StoredRow): TranscriptEntry | null {
  const inner = isOpenAiMessage(row.content) ? row.content : null;
  const role = inner ? inner.role : row.role;
  if (role !== "user" && role !== "assistant") return null;
  const text = plainText(inner ? inner.content : row.content).trim();
  return text ? { role, text } : null;
}

export const transcriptOf = (rows: StoredRow[]): TranscriptEntry[] => rows.map(rowText).filter((e): e is TranscriptEntry => e !== null);

/**
 * Which API wire format the history is tied to. Rows with tool traffic can only be replayed by the
 * family that wrote them; a history of text rows alone can be continued by anyone.
 */
export function historyFormat(rows: StoredRow[]): "plain" | "anthropic" | "openai" {
  for (const r of rows) {
    if (isOpenAiMessage(r.content)) return "openai";
    if (Array.isArray(r.content)) return "anthropic";
  }
  return "plain";
}

/**
 * Rows as OpenAI chat messages: OpenAI rows verbatim, text rows (written by a CLI engine) converted.
 * Anthropic block rows cannot be replayed here and are skipped — historyFormat() keeps a project with
 * those on the Anthropic side.
 */
export function toOpenAiMessages(rows: StoredRow[]): unknown[] {
  const out: unknown[] = [];
  for (const r of rows) {
    if (isOpenAiMessage(r.content)) out.push(r.content);
    else if (typeof r.content === "string" && r.content.trim() && (r.role === "user" || r.role === "assistant")) {
      out.push({ role: r.role, content: r.content });
    }
  }
  return out;
}

const RECAP_TURNS = 12;
const RECAP_CHARS_PER_TURN = 1200;
const RECAP_CHARS_TOTAL = 9000;

/**
 * The part of the conversation a CLI session was not there for, to put at the top of its next
 * message: turns another AI handled since it last answered, or — for a brand-new session — the recent
 * conversation. Newest turns win when it does not all fit. "" when there is nothing to tell.
 */
export function renderRecap(missed: TranscriptEntry[]): string {
  const recent = missed.slice(-RECAP_TURNS);
  const lines: string[] = [];
  let used = 0;
  for (let i = recent.length - 1; i >= 0; i--) {
    const e = recent[i];
    const text = e.text.length > RECAP_CHARS_PER_TURN ? `${e.text.slice(0, RECAP_CHARS_PER_TURN)} …` : e.text;
    if (used + text.length > RECAP_CHARS_TOTAL && lines.length > 0) break;
    used += text.length;
    lines.unshift(`${e.role === "user" ? "User" : "AI"}: ${text}`);
  }
  if (lines.length === 0) return "";
  const skipped = missed.length - lines.length;
  return [
    "[EasyGAS: this conversation has turns you have not seen — another AI answered them, or this is a new session. " +
      "They are quoted below as background only; do not redo them. The project's files are the current state." +
      (skipped > 0 ? ` (${skipped} older turns left out.)` : "") +
      "]",
    ...lines,
    "[End of the earlier turns.]",
  ].join("\n");
}

/** How many entries the chat shows after a reload (older ones stay in the file and in the AI's context). */
export const CHAT_HISTORY_LIMIT = 60;

/** Notes the app appends to a user's message for the AI (vision proxy), cut from what the chat shows. */
const APP_NOTES = ["\n\n[คำบรรยายรูปที่ผู้ใช้แนบ", "\n\n(ผู้ใช้แนบรูปมา แต่ระบบอ่านรูปไม่ได้"];

/**
 * The conversation as the chat pane shows it when the page opens (another device, a reload): words
 * only, the app's own notes cut off, the newest `limit` entries.
 */
export function chatHistoryOf(rows: StoredRow[], limit = CHAT_HISTORY_LIMIT): TranscriptEntry[] {
  const out: TranscriptEntry[] = [];
  for (const e of transcriptOf(rows)) {
    let text = e.text;
    if (e.role === "user") {
      for (const note of APP_NOTES) {
        const at = text.indexOf(note);
        if (at >= 0) text = text.slice(0, at);
      }
      text = text.trim();
    }
    if (text) out.push({ role: e.role, text });
  }
  return out.slice(-limit);
}
