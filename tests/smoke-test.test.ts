import { test } from "node:test";
import assert from "node:assert/strict";
import { parseSmokePlan, SMOKE_MAX_CALLS, smokeFailureText, smokeSummary } from "../lib/smoke-plan.ts";
import { parseFunctionOutput } from "../lib/gas-verify.ts";

test("the plan keeps safe, callable names with JSON args and drops the rest", () => {
  const text = `ok here: {"calls":[
    {"fn":"getDashboard","args":[],"why":"หน้าแรก"},
    {"fn":"listItems","args":[{"page":1}],"why":"รายการ"},
    {"fn":"deleteItem","args":["x"],"why":"ลบ"},
    {"fn":"sendDailyMail","args":[]},
    {"fn":"getSettings_","args":[]},
    {"fn":"doGet","args":[]},
    {"fn":"getDashboard","args":[1]},
    {"fn":"search","args":"คำค้น"},
    {"fn":"bad name","args":[]}
  ]}`;
  const plan = parseSmokePlan(text);
  assert.deepEqual(
    plan.map((c) => c.fn),
    ["getDashboard", "listItems", "search"],
  );
  assert.deepEqual(plan[2].args, ["คำค้น"]);
  assert.equal(plan[1].why, "รายการ");
});

test("no JSON, bad JSON or an empty list = nothing to call; never more than the cap", () => {
  assert.deepEqual(parseSmokePlan("ไม่มีฟังก์ชันที่ปลอดภัย"), []);
  assert.deepEqual(parseSmokePlan("{calls: [}"), []);
  assert.deepEqual(parseSmokePlan('{"calls":[]}'), []);
  const many = { calls: Array.from({ length: 20 }, (_, i) => ({ fn: `getThing${i}`, args: [] })) };
  assert.equal(parseSmokePlan(JSON.stringify(many)).length, SMOKE_MAX_CALLS);
});

test("the runner's answer parses: result, error with its first stack line, logs; HTML means no runner", () => {
  const ok = parseFunctionOutput('EGS_RESULT: {"rows":3}\nEGS_LOGS: ["[list] start","[list] 3 rows"]');
  assert.equal(ok.ok, true);
  assert.equal(ok.result, '{"rows":3}');
  assert.deepEqual(ok.logs, ["[list] start", "[list] 3 rows"]);
  const bad = parseFunctionOutput("EGS_ERROR: TypeError: Cannot read properties of null (reading 'getRange')\n    at listItems (Code:42:10)\n    at __egsRun_ (Code:9:20)\nEGS_LOGS: [\"[list] start\"]");
  assert.equal(bad.ok, false);
  assert.match(bad.error ?? "", /TypeError.*getRange.*Code:42/);
  assert.deepEqual(bad.logs, ["[list] start"]);
  const html = parseFunctionOutput("<!doctype html><html><body>app</body></html>");
  assert.equal(html.unsupported, true);
});

test("failures read as the repair turn needs them; the summary names every call", () => {
  const outcomes = [
    { call: { fn: "getDashboard", args: [], why: "" }, result: { ok: true, result: "{}", logs: [] } },
    { call: { fn: "listItems", args: [{ page: 1 }], why: "" }, result: { ok: false, error: "TypeError: x", logs: ["a", "b"] } },
  ];
  assert.equal(smokeFailureText(outcomes), "- เรียก listItems({\"page\":1}) → TypeError: x\n  log ก่อนพัง: a · b");
  assert.equal(smokeSummary(outcomes), "ลองเรียก 2 ฟังก์ชัน พัง 1: getDashboard ✓ · listItems ✗");
  assert.equal(smokeSummary([{ call: { fn: "a", args: [], why: "" }, result: { ok: false, unsupported: true, error: "", logs: [] } }]).startsWith("ลองเรียกฟังก์ชันไม่ได้"), true);
});
