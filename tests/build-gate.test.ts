import { test } from "node:test";
import assert from "node:assert/strict";
import { buildAllowed, isGoMessage, isPlanOnly, setPlanOnly } from "../lib/build-gate.ts";

test("typed approvals open the gate", () => {
  for (const t of ["สร้างเลย", "โอเค สร้างเลยครับ", "เขียนเลย", "ลุยเลย", "เริ่มสร้างได้เลย", "ยืนยัน สร้างเลยตาม spec ที่สรุปไว้", "อนุมัติ", "เอาตามนี้", "ตามนี้เลย", "go ahead", "สร้างเลย ไม่ต้องถามแล้ว"]) {
    assert.equal(isGoMessage(t), true, t);
  }
});

test("talk is not an approval", () => {
  for (const t of [
    "อยากได้เป็นระบบบันทึกรายรับรายจ่ายส่วนตัว ประจำวัน มีสรุปรายวันรายเดือน ช่วยออกแบบให้หน่อย",
    "ช่วยสร้างระบบจองคิวให้หน่อย",
    "ใช้บัญชี Google ของพนักงาน",
    "โอเค",
    "ทำเลย์เอาต์แบบเมนูข้าง",
    "ยังไม่ต้องสร้างเลย ขอดูสรุปก่อน",
    "อย่าเพิ่งเขียนนะ",
    "ไม่ต้องทำเลย",
    "don't build it yet",
    "ต้องมีการยืนยันตัวตนก่อนเข้า",
    "",
  ]) {
    assert.equal(isGoMessage(t), false, t);
  }
});

test("a project with code is never gated; an empty one needs a go", () => {
  assert.equal(buildAllowed({ hasCode: true, go: false, message: "เพิ่มหน้าสรุป" }), true);
  assert.equal(buildAllowed({ hasCode: false, go: false, message: "ระบบรายรับรายจ่าย" }), false);
  assert.equal(buildAllowed({ hasCode: false, go: true, message: "ระบบรายรับรายจ่าย" }), true);
  assert.equal(buildAllowed({ hasCode: false, go: false, message: "สร้างเลย" }), true);
});

test("the turn flag is per project", () => {
  setPlanOnly("a", true);
  assert.equal(isPlanOnly("a"), true);
  assert.equal(isPlanOnly("b"), false);
  setPlanOnly("a", false);
  assert.equal(isPlanOnly("a"), false);
});
