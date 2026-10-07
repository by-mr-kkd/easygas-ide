import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildAuditFixPrompt, toAuditItems } from "../lib/audit-items.ts";

const issue = (severity: "high" | "medium" | "low", problem: string, extra: Record<string, unknown> = {}) => ({
  file: "Code.gs",
  severity,
  problem,
  fix: `แก้ ${problem}`,
  ...extra,
});

test("toAuditItems: most severe first, stable within a severity, numbered in that order", () => {
  const items = toAuditItems([issue("low", "L1"), issue("high", "H1"), issue("medium", "M1"), issue("high", "H2")]);
  assert.deepEqual(
    items.map((i) => [i.id, i.problem]),
    [["a1", "H1"], ["a2", "H2"], ["a3", "M1"], ["a4", "L1"]],
  );
});

test("toAuditItems: the AI's title and benefit are kept; without a title the problem is shortened into one", () => {
  const long = "ปัญหายาวมาก ".repeat(20);
  const [a, b] = toAuditItems([
    issue("high", "x", { title: "เบอร์โทรเลข 0 หาย", benefit: "เบอร์โทรถูกต้อง", line: 12 }),
    issue("medium", long),
  ]);
  assert.equal(a.title, "เบอร์โทรเลข 0 หาย");
  assert.equal(a.benefit, "เบอร์โทรถูกต้อง");
  assert.equal(a.line, 12);
  assert.ok(b.title.length <= 80 && b.title.endsWith("…"));
  assert.equal(b.benefit, "");
  assert.equal("line" in b, false);
});

test("buildAuditFixPrompt: only the picked findings, each with where, problem and fix", () => {
  const items = toAuditItems([issue("high", "H1", { title: "T1", line: 3 }), issue("low", "L1", { title: "T2", fix: "" })]);
  const prompt = buildAuditFixPrompt([items[1]]);
  assert.match(prompt, /เฉพาะ 1 ข้อ/);
  assert.match(prompt, /1\. T2 \(Code\.gs\)/);
  assert.match(prompt, /ปัญหา: L1/);
  assert.doesNotMatch(prompt, /แนวทางแก้/); // an empty fix is left out
  assert.doesNotMatch(prompt, /T1/);
  assert.match(buildAuditFixPrompt([items[0]]), /T1 \(Code\.gs บรรทัด 3\)/);
});
