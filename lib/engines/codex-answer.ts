/**
 * The Codex engine's answer format (pure — unit-tested in tests/codex-answer.test.ts).
 *
 * Codex runs with no file or shell access (lib/engines/codex-cli.ts): it gets the project files in the
 * message and answers with ONE JSON object in this shape, enforced by `--output-schema`. The app then
 * applies the changes itself through the same checks as the API engines. The schema is "strict": every
 * field is required, so "not used" is an empty string / empty list rather than a missing field.
 */

export interface CodexOp {
  op: "write" | "edit" | "delete";
  path: string;
  content: string;
  old: string;
  new: string;
}

export interface CodexSpec {
  title: string;
  summary: string;
  features: string[];
  dataModel: string[];
  storage: string;
  outputs: string[];
}

export interface CodexAnswer {
  reply: string;
  ops: CodexOp[];
  /** Filled only when proposing a spec for a new build (empty title = none). */
  spec: CodexSpec;
  /** Look & feel the user asked to keep; "" = unchanged. */
  preference: { dialog: string; css: string; icons: string; font: string; nav: string };
  /** A lesson proposal; empty rule and repeatOf = none. */
  lesson: { rule: string; symptom: string; card: string; repeatOf: string };
}

const str = { type: "string" };
const strList = { type: "array", items: str };
const strict = (properties: Record<string, unknown>) => ({
  type: "object",
  additionalProperties: false,
  required: Object.keys(properties),
  properties,
});

/** JSON Schema handed to `codex exec --output-schema`. */
export const CODEX_ANSWER_SCHEMA = strict({
  reply: str,
  ops: {
    type: "array",
    items: strict({ op: { type: "string", enum: ["write", "edit", "delete"] }, path: str, content: str, old: str, new: str }),
  },
  spec: strict({ title: str, summary: str, features: strList, dataModel: strList, storage: str, outputs: strList }),
  preference: strict({ dialog: str, css: str, icons: str, font: str, nav: str }),
  lesson: strict({ rule: str, symptom: str, card: str, repeatOf: str }),
});

const MAX_OPS = 40;
const MAX_FILE_BYTES = 400_000;

const text = (v: unknown, max = MAX_FILE_BYTES): string => (typeof v === "string" ? v.slice(0, max) : "");
const list = (v: unknown): string[] => (Array.isArray(v) ? v.filter((x): x is string => typeof x === "string").map((x) => x.slice(0, 300)).slice(0, 40) : []);
const obj = (v: unknown): Record<string, unknown> => (v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

export class CodexAnswerError extends Error {}

/**
 * Read Codex's final message. The schema is enforced by Codex, but the text still comes from a model:
 * anything malformed is rejected or dropped here rather than trusted. Throws CodexAnswerError when the
 * message is not a usable answer at all.
 */
export function parseCodexAnswer(raw: string): CodexAnswer {
  const trimmed = raw.trim();
  // a schema-bound answer is the JSON object itself; tolerate a stray code fence around it
  const body = trimmed.startsWith("{") ? trimmed : (/\{[\s\S]*\}/.exec(trimmed)?.[0] ?? "");
  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    throw new CodexAnswerError("not_json");
  }
  const a = obj(json);
  if (typeof a.reply !== "string" || !Array.isArray(a.ops)) throw new CodexAnswerError("bad_shape");

  const ops: CodexOp[] = [];
  for (const item of a.ops.slice(0, MAX_OPS)) {
    const o = obj(item);
    if (o.op !== "write" && o.op !== "edit" && o.op !== "delete") continue;
    const path = text(o.path, 200).trim();
    if (!path) continue;
    ops.push({ op: o.op, path, content: text(o.content), old: text(o.old), new: text(o.new) });
  }

  const s = obj(a.spec);
  const p = obj(a.preference);
  const l = obj(a.lesson);
  return {
    reply: text(a.reply, 20_000),
    ops,
    spec: {
      title: text(s.title, 200),
      summary: text(s.summary, 2000),
      features: list(s.features),
      dataModel: list(s.dataModel),
      storage: text(s.storage, 300),
      outputs: list(s.outputs),
    },
    preference: {
      dialog: text(p.dialog, 40),
      css: text(p.css, 40),
      icons: text(p.icons, 40),
      font: text(p.font, 40),
      nav: text(p.nav, 40),
    },
    lesson: { rule: text(l.rule, 400), symptom: text(l.symptom, 300), card: text(l.card, 60), repeatOf: text(l.repeatOf, 20) },
  };
}

/** The tool calls an answer amounts to, in the order they are applied (files first, then the rest). */
export function answerToToolCalls(a: CodexAnswer): { name: string; input: Record<string, unknown> }[] {
  const calls: { name: string; input: Record<string, unknown> }[] = a.ops.map((o) =>
    o.op === "write"
      ? { name: "write_file", input: { path: o.path, content: o.content } }
      : o.op === "edit"
        ? { name: "edit_file", input: { path: o.path, old_str: o.old, new_str: o.new } }
        : { name: "delete_file", input: { path: o.path } },
  );
  if (a.spec.title.trim()) calls.push({ name: "propose_spec", input: { ...a.spec } });
  const pref = Object.fromEntries(Object.entries(a.preference).filter(([, v]) => v.trim() !== ""));
  if (Object.keys(pref).length > 0) calls.push({ name: "save_preference", input: pref });
  if (a.lesson.rule.trim() || a.lesson.repeatOf.trim()) {
    const lesson: Record<string, unknown> = { rule: a.lesson.rule, symptom: a.lesson.symptom, card: a.lesson.card };
    if (a.lesson.repeatOf.trim()) lesson.repeatOf = a.lesson.repeatOf.trim();
    calls.push({ name: "propose_lesson", input: lesson });
  }
  return calls;
}

/**
 * Codex features that may stay ON: internal plumbing with no reach outside the conversation (sign-in,
 * request compression, context compaction, model speed, proxy and retry behaviour). EVERY other feature
 * the installed Codex reports as on is switched off for each run — an allowlist, so a tool added by a
 * future Codex release is off by default instead of silently available.
 */
export const CODEX_KEEP_ON = new Set([
  "auth_elicitation",
  "secret_auth_storage",
  "enable_request_compression",
  "compaction_image_budget",
  "guardian_reuse_parent_compaction",
  "content_item_kinds",
  "fast_mode",
  "system_proxy_fallback",
  "respect_system_proxy",
  "unbounded_connection_retries",
]);
/** Without a way to switch the command tool off, the engine does not run at all. */
export const CODEX_REQUIRED_OFF = ["shell_tool"];

export interface CodexFeature {
  name: string;
  stage: string;
  enabled: boolean;
}

/** Rows of `codex features list` ("name  stage  true|false"; the stage may be two words). */
export function parseFeatureList(output: string): CodexFeature[] {
  const out: CodexFeature[] = [];
  for (const line of output.split(/\r?\n/)) {
    const m = /^([a-z0-9_.]+)\s+(\S.*?)\s+(true|false)\s*$/.exec(line.trim());
    if (m) out.push({ name: m[1], stage: m[2], enabled: m[3] === "true" });
  }
  return out;
}

/**
 * `--disable` arguments for this Codex version, or null when it cannot be run safely. Only names the
 * installed Codex lists are passed (an unknown name stops Codex from starting); features it reports as
 * removed are left alone.
 */
export function codexDisableFlags(features: CodexFeature[]): string[] | null {
  const names = new Set(features.map((f) => f.name));
  if (!CODEX_REQUIRED_OFF.every((f) => names.has(f))) return null;
  return features
    .filter((f) => (f.enabled || CODEX_REQUIRED_OFF.includes(f.name)) && !CODEX_KEEP_ON.has(f.name) && f.stage !== "removed")
    .flatMap((f) => ["--disable", f.name]);
}

/** The project's current files as they go into the message (Codex cannot read the disk). */
export function renderProjectFiles(files: { path: string; content: string }[]): string {
  if (files.length === 0) return "[EasyGAS: the project has no files yet]";
  return `[EasyGAS: the project's files as they are right now — the only copy you can see]\n${files
    .map((f) => `=== ${f.path} ===\n${f.content}`)
    .join("\n\n")}`;
}
