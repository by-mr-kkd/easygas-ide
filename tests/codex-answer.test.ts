import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  CODEX_ANSWER_SCHEMA,
  CodexAnswerError,
  answerToToolCalls,
  codexDisableFlags,
  parseCodexAnswer,
  parseFeatureList,
  renderProjectFiles,
} from "../lib/engines/codex-answer.ts";

const EMPTY = {
  spec: { title: "", summary: "", features: [], dataModel: [], storage: "", outputs: [] },
  preference: { dialog: "", css: "", icons: "", font: "", nav: "" },
  lesson: { rule: "", symptom: "", card: "", repeatOf: "" },
};
const answer = (over: Record<string, unknown>) => JSON.stringify({ reply: "ok", ops: [], ...EMPTY, ...over });

test("the schema is strict: every property is required and nothing extra is allowed, at every level", () => {
  const check = (s: Record<string, unknown>, at: string) => {
    if (s.type === "object") {
      assert.equal(s.additionalProperties, false, at);
      assert.deepEqual([...(s.required as string[])].sort(), Object.keys(s.properties as object).sort(), at);
      for (const [k, v] of Object.entries(s.properties as Record<string, Record<string, unknown>>)) check(v, `${at}.${k}`);
    }
    if (s.type === "array") check(s.items as Record<string, unknown>, `${at}[]`);
  };
  check(CODEX_ANSWER_SCHEMA as Record<string, unknown>, "answer");
});

test("a write, an edit and a delete become the app's own file tools, in order", () => {
  const a = parseCodexAnswer(
    answer({
      ops: [
        { op: "write", path: "Code.gs", content: "function a(){}", old: "", new: "" },
        { op: "edit", path: "Index.html", content: "", old: "<b>", new: "<strong>" },
        { op: "delete", path: "Old.gs", content: "", old: "", new: "" },
      ],
    }),
  );
  assert.deepEqual(answerToToolCalls(a), [
    { name: "write_file", input: { path: "Code.gs", content: "function a(){}" } },
    { name: "edit_file", input: { path: "Index.html", old_str: "<b>", new_str: "<strong>" } },
    { name: "delete_file", input: { path: "Old.gs" } },
  ]);
});

test("empty spec, preference and lesson mean nothing to do", () => {
  assert.deepEqual(answerToToolCalls(parseCodexAnswer(answer({}))), []);
});

test("a spec, a kept preference and a lesson come after the file changes", () => {
  const a = parseCodexAnswer(
    answer({
      ops: [{ op: "write", path: "Code.gs", content: "x", old: "", new: "" }],
      spec: { ...EMPTY.spec, title: "ระบบจองคิว", summary: "จองคิวร้านตัดผม", features: ["จอง", "ยกเลิก"] },
      preference: { ...EMPTY.preference, css: "bootstrap" },
      lesson: { rule: "ตรวจราคาต้องมากกว่าศูนย์ทั้งสองฝั่ง", symptom: "ราคา 0 ผ่าน", card: "data-integrity", repeatOf: "" },
    }),
  );
  assert.deepEqual(answerToToolCalls(a).map((c) => c.name), ["write_file", "propose_spec", "save_preference", "propose_lesson"]);
  assert.deepEqual(answerToToolCalls(a)[2].input, { css: "bootstrap" }, "only the fields the user changed");
});

test("a lesson repeat by id carries repeatOf", () => {
  const a = parseCodexAnswer(answer({ lesson: { rule: "", symptom: "", card: "", repeatOf: "L-0003" } }));
  assert.deepEqual(answerToToolCalls(a), [{ name: "propose_lesson", input: { rule: "", symptom: "", card: "", repeatOf: "L-0003" } }]);
});

test("unknown operations, missing paths and wrong types are dropped, not trusted", () => {
  const a = parseCodexAnswer(
    answer({
      ops: [
        { op: "run", path: "x", content: "", old: "", new: "" },
        { op: "write", path: "  ", content: "x", old: "", new: "" },
        { op: "write", path: "Code.gs", content: 42, old: "", new: "" },
        "garbage",
      ],
      spec: "not an object",
    }),
  );
  assert.deepEqual(a.ops, [{ op: "write", path: "Code.gs", content: "", old: "", new: "" }]);
  assert.equal(a.spec.title, "");
});

test("a stray code fence around the JSON is tolerated", () => {
  assert.equal(parseCodexAnswer("```json\n" + answer({ reply: "สวัสดี" }) + "\n```").reply, "สวัสดี");
});

test("an answer that is not the JSON object is an error", () => {
  for (const bad of ["", "I added the function.", "{not json", JSON.stringify({ ops: [] }), JSON.stringify({ reply: "x" })]) {
    assert.throws(() => parseCodexAnswer(bad), CodexAnswerError, JSON.stringify(bad));
  }
});

const FEATURES = [
  "agent_message_board                      under development  false",
  "apps                                     stable             true",
  "auth_elicitation                         stable             true",
  "secret_auth_storage                      stable             true",
  "shell_tool                               stable             true",
  "unified_exec                             stable             true",
  "elevated_windows_sandbox                 removed            false",
  "collaboration_modes                      removed            true",
  "brand_new_tool_from_a_future_release     stable             true",
  "",
  "not a feature line",
].join("\n");

test("rows of `codex features list` are read with their stage and state", () => {
  const f = parseFeatureList(FEATURES);
  assert.equal(f.length, 9);
  assert.deepEqual(f[0], { name: "agent_message_board", stage: "under development", enabled: false });
  assert.deepEqual(f[1], { name: "apps", stage: "stable", enabled: true });
});

test("every feature that is on is switched off — including ones the app has never heard of", () => {
  const flags = codexDisableFlags(parseFeatureList(FEATURES))!;
  const off = flags.filter((x) => x !== "--disable");
  assert.deepEqual(off, ["apps", "shell_tool", "unified_exec", "brand_new_tool_from_a_future_release"]);
});

test("sign-in plumbing stays on, and features already off or removed are left alone", () => {
  const off = codexDisableFlags(parseFeatureList(FEATURES))!;
  for (const name of ["auth_elicitation", "secret_auth_storage", "agent_message_board", "elevated_windows_sandbox", "collaboration_modes"]) {
    assert.ok(!off.includes(name), name);
  }
});

test("a Codex without a switch for its command tool is refused", () => {
  assert.equal(codexDisableFlags(parseFeatureList("apps   stable   true\nunified_exec   stable   true")), null);
});

test("the command tool is switched off even if this Codex reports it as already off", () => {
  assert.deepEqual(codexDisableFlags(parseFeatureList("shell_tool   stable   false")), ["--disable", "shell_tool"]);
});

test("project files are given to Codex in full, under clear headers", () => {
  const text = renderProjectFiles([
    { path: "Code.gs", content: "function a(){}" },
    { path: "Index.html", content: "<p>x</p>" },
  ]);
  assert.match(text, /=== Code\.gs ===\nfunction a\(\)\{\}/);
  assert.match(text, /=== Index\.html ===\n<p>x<\/p>/);
  assert.match(renderProjectFiles([]), /no files yet/);
});
