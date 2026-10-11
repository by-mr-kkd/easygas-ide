import { test } from "node:test";
import assert from "node:assert/strict";
import { editCutNote, fileCutNote, hasHistoryNote, RESULT_CUT_TAIL } from "../lib/history-marks.ts";

test("every note the compaction writes is recognised", () => {
  assert.equal(hasHistoryNote(fileCutNote(24797)), true);
  assert.equal(hasHistoryNote(editCutNote(512)), true);
  assert.equal(hasHistoryNote("partial result" + RESULT_CUT_TAIL), true);
  // a model that pads the note with markup still trips it
  assert.equal(hasHistoryNote(`<!DOCTYPE html>\n${fileCutNote(24797)}\n</html>`), true);
  assert.equal(hasHistoryNote("<โค้ดถูกตัดจากประวัติ (24,797 ตัวอักษร) — เรียก read_project เพื่อดูโค้ดล่าสุด>"), true);
});

test("real code is not mistaken for a note", () => {
  assert.equal(hasHistoryNote('function doGet() {\n  return HtmlService.createHtmlOutputFromFile("Index");\n}'), false);
  assert.equal(hasHistoryNote("<p>ตัดผม 3 ตัวอักษร</p>"), false);
  assert.equal(hasHistoryNote(""), false);
});
