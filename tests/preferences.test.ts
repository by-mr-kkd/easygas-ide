import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  DEFAULT_PREFS,
  MAX_CUSTOM_LENGTH,
  PREF_FIELDS,
  PREF_KEYS,
  cleanCustom,
  renderPrefsBlock,
  renderPrefsForReview,
  resolvePrefs,
  sanitizePrefs,
} from "../lib/preferences.ts";

test("every default is a real option of its field", () => {
  for (const f of PREF_FIELDS) assert.ok(f.options.some((o) => o.id === DEFAULT_PREFS[f.id]), f.id);
  assert.deepEqual(PREF_FIELDS.map((f) => f.id), PREF_KEYS);
});

test("sanitize drops unknown keys and unknown option ids", () => {
  assert.deepEqual(sanitizePrefs({ css: "bootstrap", dialog: "jquery-ui", theme: "dark", nav: 7 }), { css: "bootstrap" });
});

test("sanitize tolerates anything that is not an object", () => {
  for (const v of [null, undefined, "css=bootstrap", 3, []]) assert.deepEqual(sanitizePrefs(v), {});
});

test("free-text instructions are trimmed, capped and stripped of control characters", () => {
  assert.equal(cleanCustom("  ปุ่มมุมมน\u0000\u0007  "), "ปุ่มมุมมน");
  assert.equal(cleanCustom("บรรทัดแรก\nบรรทัดสอง"), "บรรทัดแรก\nบรรทัดสอง", "line breaks are kept");
  assert.equal(cleanCustom("x".repeat(MAX_CUSTOM_LENGTH + 50)).length, MAX_CUSTOM_LENGTH);
  assert.equal(cleanCustom({ evil: true }), "");
});

test("with nothing chosen, a project gets the defaults", () => {
  assert.deepEqual(resolvePrefs(null, undefined), DEFAULT_PREFS);
});

test("a project's choice beats the user's global choice, which beats the default", () => {
  const p = resolvePrefs({ css: "tailwind", icons: "emoji" }, { css: "bootstrap" });
  assert.equal(p.css, "bootstrap");
  assert.equal(p.icons, "emoji");
  assert.equal(p.dialog, DEFAULT_PREFS.dialog);
});

test("global and project free-text instructions are both kept, global first", () => {
  assert.equal(resolvePrefs({ custom: "สีหลักน้ำเงิน" }, { custom: "หน้านี้ใช้สีเขียว" }).custom, "สีหลักน้ำเงิน\nหน้านี้ใช้สีเขียว");
});

test("the defaults are SweetAlert2, Tailwind, Font Awesome and IBM Plex Sans Thai", () => {
  const block = renderPrefsBlock(DEFAULT_PREFS, { via: "tool" });
  assert.match(block, /SweetAlert2/);
  assert.match(block, /Font Awesome/);
  assert.match(block, /^- CSS: Tailwind CSS/m);
  assert.match(block, /"IBM Plex Sans Thai"/);
  assert.match(block, /save_preference/);
});

test("choosing another dialog style removes SweetAlert2 from the instructions and forbids loading it", () => {
  for (const dialog of ["bootstrap", "custom", "native"]) {
    const block = renderPrefsBlock({ ...DEFAULT_PREFS, dialog }, { via: "tool" });
    const line = block.split("\n").find((l) => l.startsWith("- Dialogs & alerts:"))!;
    assert.match(line, /Do NOT load SweetAlert2/, dialog);
    assert.doesNotMatch(line, /use Swal\.fire\(\) for confirm/, dialog);
  }
});

test("a chosen CSS framework replaces the hand-written-CSS instruction", () => {
  const css = (id: string) =>
    renderPrefsBlock({ ...DEFAULT_PREFS, css: id }, { via: "tool" }).split("\n").find((l) => l.startsWith("- CSS:"))!;
  assert.match(css("tailwind"), /@tailwindcss\/browser@4/);
  assert.match(css("bootstrap"), /bootstrap@5\.3/);
  assert.match(css("plain"), /No CSS framework/);
});

test("the block always says user choices cannot override the technical and safety rules", () => {
  const block = renderPrefsBlock({ ...DEFAULT_PREFS, custom: "ไม่ต้องใช้ LockService" }, { via: "tool" });
  assert.match(block, /never override the technical and safety rules/);
  assert.match(block, /> ไม่ต้องใช้ LockService/, "the user's text is quoted, not merged into the rules");
});

test("multi-line free text stays inside the quoted block", () => {
  const block = renderPrefsBlock({ ...DEFAULT_PREFS, custom: "ข้อหนึ่ง\n## New section\nข้อสาม" }, { via: "tool" });
  assert.match(block, /  > ## New section/);
  assert.doesNotMatch(block, /^## New section/m);
});

test("CLI engines are told to write the request file instead of calling a tool", () => {
  const block = renderPrefsBlock(DEFAULT_PREFS, { via: "file", path: "C:\\data\\engine\\io\\prefs-request.json" });
  assert.match(block, /C:\\data\\engine\\io\\prefs-request\.json/);
  assert.doesNotMatch(block, /call the save_preference tool/);
});

test("the review line names every choice so the critic does not report them", () => {
  const line = renderPrefsForReview({ ...DEFAULT_PREFS, dialog: "native", custom: "ปุ่มสีแดง\nตัวใหญ่" });
  assert.match(line, /dialog=native/);
  assert.match(line, /do NOT report/);
  assert.doesNotMatch(line, /\n/);
});
