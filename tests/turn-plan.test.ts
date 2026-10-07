import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { briefFeatureIds, EMPTY_BRIEF } from "../lib/brief.ts";
import { parsePack } from "../lib/rulebook/format.ts";
import { planTurnContext } from "../lib/rulebook/select.ts";
import type { TurnPlanInput } from "../lib/rulebook/select.ts";
import { RULEBOOK_DIR } from "../scripts/rulebook-build.mjs";

// Which rule cards a turn gets, and how — against the REAL bundled pack.
const pack = parsePack(JSON.parse(readFileSync(join(RULEBOOK_DIR, "pack.json"), "utf8")));
const base: TurnPlanInput = {
  pack,
  kind: "webapp",
  userMessage: "",
  projectText: "",
  features: [],
  hasFiles: false,
  specConfirmed: false,
  allowInline: true,
  access: { via: "tool" },
  inlineBudgetBytes: 56_000,
};
const plan = (over: Partial<TurnPlanInput>) => planTurnContext({ ...base, ...over });

test("first turn of a new project only names the cards — the spec is not confirmed yet", () => {
  const p = plan({ userMessage: "อยากได้ระบบออกใบเสร็จ PDF" });
  assert.ok(p.sources.includes("pdf-generation"));
  assert.match(p.text, /^\[EasyGAS: rule cards matched to this request/);
  assert.doesNotMatch(p.text, /=== rule card:/);
});

test("the build turn after a confirmed spec carries the cards' full text (API engines)", () => {
  const p = plan({ userMessage: "ยืนยัน สร้างเลย", projectText: "ระบบออกใบเสร็จ สร้าง PDF", specConfirmed: true });
  assert.match(p.text, /=== rule card: pdf-generation ===/);
  assert.ok(Buffer.byteLength(p.text, "utf8") < 80_000, "bounded by the inline budget");
});

test("a bare 'สร้างเลย' still gets the right cards from the wizard brief", () => {
  const features = briefFeatureIds({ ...EMPTY_BRIEF, storage: "new-sheet", access: "app-login", features: ["line"] });
  const p = plan({ userMessage: "ยืนยัน สร้างเลย", features, specConfirmed: true });
  for (const id of ["spreadsheet-ops", "security", "urlfetch-external-api"]) assert.ok(p.sources.includes(id), id);
});

test("CLI engines are never given inlined text — they open the files", () => {
  const p = plan({
    userMessage: "ยืนยัน สร้างเลย",
    projectText: "สร้าง PDF",
    specConfirmed: true,
    allowInline: false,
    access: { via: "files", dir: "C:\\data\\engine\\rules" },
  });
  assert.doesNotMatch(p.text, /=== rule card:/);
  assert.match(p.text, /C:\\data\\engine\\rules/);
});

test("once a build exists, only the new request decides — the old spec does not re-match", () => {
  const edit = plan({ userMessage: "เปลี่ยนสีปุ่มเป็นสีน้ำเงิน", projectText: "สร้าง PDF ส่งอีเมล LINE", features: ["pdf", "email"], hasFiles: true, specConfirmed: true });
  assert.deepEqual(edit, { text: "", sources: [] });
});

test("Thai keywords do not fire inside unrelated words", () => {
  // "เงิน" inside "น้ำเงิน" (blue), "รูป" inside "รูปแบบ" (format), "พิมพ์" = to type, "คืน" inside "กลางคืน"
  const cases: [string, string][] = [
    ["เปลี่ยนสีปุ่มเป็นสีน้ำเงิน", "data-integrity"],
    ["ปรับรูปแบบหัวข้อให้ใหญ่ขึ้น", "drive-ops"],
    ["ให้พิมพ์ชื่อลูกค้าในช่องค้นหาได้", "pdf-generation"],
    ["เพิ่มโหมดกลางคืน", "lock-service"],
    ["ให้คำนวณยอดเยี่ยมอัตโนมัติ", "triggers"],
  ];
  for (const [message, card] of cases) {
    assert.ok(!plan({ userMessage: message, hasFiles: true }).sources.includes(card), `${message} → ${card}`);
  }
});

test("money and payment wording still reaches the data-integrity card", () => {
  for (const message of ["บันทึกยอดเงินที่รับมา", "เพิ่มหน้าชำระค่าสินค้า", "สรุปยอดขายรายเดือน"]) {
    assert.ok(plan({ userMessage: message, hasFiles: true }).sources.includes("data-integrity"), message);
  }
});

test("an edit that names a topic gets that card by name, not inlined", () => {
  const p = plan({ userMessage: "เพิ่มส่งอีเมลยืนยันหลังบันทึก", hasFiles: true, specConfirmed: true });
  assert.ok(p.sources.includes("email-notifications"));
  assert.doesNotMatch(p.text, /=== rule card:/);
});

test("a new build always starts from the web-app baseline cards", () => {
  const p = plan({ userMessage: "ทำเครื่องคิดเลข VAT" });
  assert.deepEqual(p.sources.slice(0, 2), ["web-app-rpc", "htmlservice-frontend"]);
});

test("a sheet-bound script gets the menu card and no web-app cards", () => {
  const p = plan({ kind: "bound", userMessage: "ทำเมนูสรุปยอดในชีต" });
  assert.ok(p.sources.includes("onopen-menu"));
  assert.ok(!p.sources.includes("web-app-rpc"));
});
