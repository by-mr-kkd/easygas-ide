import { test } from "node:test";
import assert from "node:assert/strict";
import { buildPicturePrompt, cleanPrompt, cleanSpec, DEFAULT_SPEC, PICTURE_SIZES, PROMPT_MAX } from "../lib/share/picture-prompt.ts";

test("the prompt names the use, the size, what the app does, the style and the text language", () => {
  const p = buildPicturePrompt("บันทึกรายจ่าย", "จดรายรับรายจ่าย ล็อกด้วย PIN", { ...DEFAULT_SPEC, size: "og", lang: "both", font: "fun", style: "soft3d", hint: "โทนฟ้า" });
  assert.match(p, /ภาพ Open Graph/);
  assert.match(p, /1200×630/);
  assert.match(p, /ระบบทำอะไร: จดรายรับรายจ่าย ล็อกด้วย PIN/);
  assert.match(p, /3D นุ่ม/);
  assert.match(p, /ภาษาไทยเป็นหลัก และมีภาษาอังกฤษประกอบ/);
  assert.match(p, /กลมมน/);
  assert.match(p, /เพิ่มเติม: โทนฟ้า/);
});

test("no text means no text; no description says the code will be read", () => {
  const p = buildPicturePrompt("x", "", { ...DEFAULT_SPEC, lang: "none" });
  assert.match(p, /ไม่มีข้อความ ตัวอักษร หรือโลโก้ใด ๆ/);
  assert.doesNotMatch(p, /ฟอนต์/);
  assert.match(p, /ดูจากโค้ดที่แนบมา/);
});

test("unknown picks fall back, the hint is clipped, every size has a label and a box", () => {
  const s = cleanSpec({ size: "huge", lang: "fr", font: 1, style: null, hint: "  a   b ".padEnd(400, "x") });
  assert.deepEqual({ size: s.size, lang: s.lang, font: s.font, style: s.style }, { size: "cover", lang: "th", font: "modern", style: "flat" });
  assert.equal(s.hint.length, 300);
  for (const v of Object.values(PICTURE_SIZES)) assert.ok(v.label && v.w > 0 && v.h > 0);
});

test("the prompt the server takes is trimmed and capped", () => {
  assert.equal(cleanPrompt("  "), null);
  assert.equal(cleanPrompt(42), null);
  assert.equal(cleanPrompt("x".repeat(PROMPT_MAX + 50))?.length, PROMPT_MAX);
  assert.equal(cleanPrompt("a\r\nb"), "a\nb");
});
