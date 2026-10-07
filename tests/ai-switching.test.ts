import { strict as assert } from "node:assert";
import { test } from "node:test";
import { MODEL_ID, cleanModel, sanitizeChoice } from "../lib/ai-choice.ts";
import { missedSince, readEngineSession, sessionPatch } from "../lib/engines/engine-session.ts";
import { historyFormat, renderRecap, rowText, toOpenAiMessages, transcriptOf } from "../lib/messages-text.ts";

// ── the pick that arrives with a message ────────────────────────────────────────────────────────

test("a pick from the request is kept only when it is well formed", () => {
  assert.deepEqual(sanitizeChoice({ engine: "codex-cli" }), { engine: "codex-cli" });
  assert.deepEqual(sanitizeChoice({ engine: "muse-cli", model: "muse-spark-1.3" }), { engine: "muse-cli", model: "muse-spark-1.3" });
  assert.deepEqual(sanitizeChoice({ engine: "api", provider: "chatgpt", model: "gpt-4o" }), { engine: "api", provider: "chatgpt", model: "gpt-4o" });
  // a CLI engine has no provider; an API pick must name one the app knows
  assert.deepEqual(sanitizeChoice({ engine: "claude-cli", provider: "chatgpt" }), { engine: "claude-cli" });
  assert.equal(sanitizeChoice({ engine: "api" }), null);
  assert.equal(sanitizeChoice({ engine: "api", provider: "nope" }), null);
  for (const bad of [null, undefined, "codex-cli", 3, [], { engine: "shell" }, {}]) assert.equal(sanitizeChoice(bad), null, JSON.stringify(bad));
});

test("a model name can never be read as a command-line flag or carry anything but a name", () => {
  for (const ok of ["sonnet", "gpt-4o", "muse-spark-1.3", "claude-sonnet-4-6", "models/gemini-2.5-flash", "org/model:tag", "o3"]) {
    assert.ok(MODEL_ID.test(ok), ok);
  }
  for (const bad of ["--yolo", "-m", "", " ", "a b", "x;calc", "x`y", "$(x)", "a\nb", "ไทย", "x".repeat(101), "../x", "a|b", "a&b", '"x"']) {
    assert.equal(cleanModel(bad), undefined, JSON.stringify(bad));
  }
  // a bad model is dropped, not the whole pick
  assert.deepEqual(sanitizeChoice({ engine: "codex-cli", model: "--dangerously-bypass" }), { engine: "codex-cli" });
  assert.equal(cleanModel("  opus  "), "opus");
});

// ── reading rows written by different engines ──────────────────────────────────────────────────

const TEXT_USER = { role: "user", content: "ทำฟอร์มจองคิว" };
const TEXT_AI = { role: "assistant", content: "ได้ครับ" };
const ANTHROPIC_AI = {
  role: "assistant",
  content: [
    { type: "text", text: "กำลังเขียนไฟล์" },
    { type: "tool_use", id: "t1", name: "write_file", input: { path: "Code.gs", content: "function x(){}" } },
  ],
};
const ANTHROPIC_TOOL_RESULT = { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] };
const OPENAI_AI = { role: "assistant", content: { role: "assistant", content: "เสร็จแล้ว", tool_calls: [{ id: "c1" }] } };
const OPENAI_TOOL = { role: "tool", content: { role: "tool", tool_call_id: "c1", content: "ok" } };
const OPENAI_USER = { role: "user", content: { role: "user", content: "เพิ่มปุ่มลบ" } };

test("the words of a row, whatever engine wrote it; tool traffic has none", () => {
  assert.deepEqual(rowText(TEXT_USER), { role: "user", text: "ทำฟอร์มจองคิว" });
  assert.deepEqual(rowText(ANTHROPIC_AI), { role: "assistant", text: "กำลังเขียนไฟล์" });
  assert.deepEqual(rowText(OPENAI_AI), { role: "assistant", text: "เสร็จแล้ว" });
  assert.deepEqual(rowText(OPENAI_USER), { role: "user", text: "เพิ่มปุ่มลบ" });
  assert.equal(rowText(ANTHROPIC_TOOL_RESULT), null);
  assert.equal(rowText(OPENAI_TOOL), null);
  assert.equal(rowText({ role: "assistant", content: "   " }), null);
  assert.equal(rowText({ role: "system", content: "x" }), null);
  assert.equal(transcriptOf([TEXT_USER, ANTHROPIC_AI, ANTHROPIC_TOOL_RESULT, OPENAI_TOOL, OPENAI_AI]).length, 3);
});

test("a history is tied to an API format only once it holds that format's tool traffic", () => {
  assert.equal(historyFormat([]), "plain");
  assert.equal(historyFormat([TEXT_USER, TEXT_AI]), "plain"); // CLI engines only → any API may continue
  assert.equal(historyFormat([TEXT_USER, ANTHROPIC_AI]), "anthropic");
  assert.equal(historyFormat([TEXT_USER, TEXT_AI, OPENAI_USER, OPENAI_AI]), "openai");
});

test("an OpenAI-format loop can replay turns a CLI engine wrote in between its own", () => {
  assert.deepEqual(toOpenAiMessages([OPENAI_USER, OPENAI_AI, OPENAI_TOOL, TEXT_USER, TEXT_AI]), [
    OPENAI_USER.content,
    OPENAI_AI.content,
    OPENAI_TOOL.content,
    { role: "user", content: "ทำฟอร์มจองคิว" },
    { role: "assistant", content: "ได้ครับ" },
  ]);
  // never a bare string or an Anthropic block list — either would be rejected by the API
  for (const m of toOpenAiMessages([TEXT_USER, ANTHROPIC_AI, { role: "assistant", content: "" }, { role: "weird", content: "x" }])) {
    assert.equal(typeof (m as { role: unknown }).role, "string");
  }
  assert.equal(toOpenAiMessages([ANTHROPIC_AI, ANTHROPIC_TOOL_RESULT]).length, 0);
});

// ── one session per engine ─────────────────────────────────────────────────────────────────────

const TOLD = { core: "c1", prefs: "p1" };

test("each engine reads and writes its own session; the others are left alone", () => {
  let project: Parameters<typeof readEngineSession>[0] = {};
  project = { ...project, ...sessionPatch(project, "codex-cli", { id: "codex-1", told: TOLD, seen: 2 }) };
  project = { ...project, ...sessionPatch(project, "muse-cli", { id: "muse-1", told: TOLD }) };
  assert.deepEqual(readEngineSession(project, "codex-cli"), { id: "codex-1", told: TOLD, seen: 2 });
  assert.deepEqual(readEngineSession(project, "muse-cli"), { id: "muse-1", told: TOLD, seen: null });
  assert.deepEqual(readEngineSession(project, "claude-cli"), { id: null, told: null, seen: null });
  // a partial write (only "caught up to row 6") keeps the id and the fingerprints
  project = { ...project, ...sessionPatch(project, "codex-cli", { seen: 6 }) };
  assert.deepEqual(readEngineSession(project, "codex-cli"), { id: "codex-1", told: TOLD, seen: 6 });
});

test("a record from before per-engine sessions is read once, then retired", () => {
  const old = { engine_session_id: "legacy-1", engine_prompt: TOLD };
  // whose it was is unknown, so every engine sees it — the fingerprint check decides who may resume
  assert.deepEqual(readEngineSession(old, "claude-cli"), { id: "legacy-1", told: TOLD, seen: null });
  const next = { ...old, ...sessionPatch(old, "claude-cli", { id: "claude-2", told: TOLD, seen: 4 }) };
  assert.equal(next.engine_session_id, null);
  assert.equal(next.engine_prompt, null);
  assert.deepEqual(readEngineSession(next, "claude-cli"), { id: "claude-2", told: TOLD, seen: 4 });
  assert.deepEqual(readEngineSession(next, "codex-cli"), { id: null, told: null, seen: null });
});

test("what a session missed: everything when new, the tail when resumed, nothing when unrecorded", () => {
  const rows = ["a", "b", "c", "d"];
  assert.deepEqual(missedSince(rows, { id: null, told: null, seen: null }, false), rows);
  assert.deepEqual(missedSince(rows, { id: "s", told: TOLD, seen: 2 }, true), ["c", "d"]);
  assert.deepEqual(missedSince(rows, { id: "s", told: TOLD, seen: 4 }, true), []);
  assert.deepEqual(missedSince(rows, { id: "s", told: TOLD, seen: 99 }, true), []);
  assert.deepEqual(missedSince(rows, { id: "s", told: TOLD, seen: null }, true), []);
});

test("the recap quotes the missed turns, newest kept when it is too long, and is empty when nothing was missed", () => {
  assert.equal(renderRecap([]), "");
  const recap = renderRecap([
    { role: "user", text: "เพิ่มช่องค้นหา" },
    { role: "assistant", text: "เพิ่มแล้วครับ" },
  ]);
  assert.match(recap, /^\[EasyGAS: /);
  assert.ok(recap.includes("User: เพิ่มช่องค้นหา") && recap.includes("AI: เพิ่มแล้วครับ"));
  assert.ok(recap.indexOf("User:") < recap.indexOf("AI:"), "in order");

  const many = Array.from({ length: 40 }, (_, i) => ({ role: i % 2 ? ("assistant" as const) : ("user" as const), text: `turn ${i} ${"x".repeat(3000)}` }));
  const long = renderRecap(many);
  assert.ok(long.length < 12_000, `bounded (${long.length})`);
  assert.ok(long.includes("turn 39"), "the newest turn is kept");
  assert.ok(!long.includes("turn 0 "), "the oldest is dropped");
  assert.match(long, /older turns left out/);
});
