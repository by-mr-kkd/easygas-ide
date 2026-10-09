import { strict as assert } from "node:assert";
import { test } from "node:test";
import { turnNotice, verifyNotice } from "../lib/remote/notice.ts";

test("turnNotice: an answer that ends in a question says so, with the question", () => {
  const n = turnNotice("ระบบจองคิว", "แก้ปุ่มแล้วครับ\n\nอยากให้ส่งอีเมลยืนยันด้วยไหมครับ", false);
  assert.deepEqual(n, { title: "ระบบจองคิว", body: "AI ถาม: อยากให้ส่งอีเมลยืนยันด้วยไหมครับ" });
  assert.match(turnNotice("x", "Which sheet should it use?", false).body, /^AI ถาม: /);
  assert.match(turnNotice("x", "ต้องการแบบนี้หรือเปล่าคะ", false).body, /^AI ถาม: /);
});

test("turnNotice: a finished answer, a failure, an empty name", () => {
  assert.equal(turnNotice("ร้าน", "**เสร็จแล้ว** — กดปุ่ม \"เผยแพร่\" มุมขวาบน", false).body, "AI ทำเสร็จแล้ว กดเพื่อดูผลและพรีวิว");
  assert.equal(turnNotice("ร้าน", "อะไรก็ได้?", true).body, "AI ทำไม่สำเร็จ เปิดดูรายละเอียดในแชต");
  assert.equal(turnNotice("  ", "", false).title, "EasyGAS IDE");
});

test("turnNotice: a long question is cut to fit a notification", () => {
  const q = `${"ก".repeat(300)}ไหมครับ`;
  const body = turnNotice("x", q, false).body;
  assert.ok(body.length <= 140);
  assert.ok(body.endsWith("…"));
});

test("verifyNotice", () => {
  assert.equal(verifyNotice("x", true).body, "ทดสอบรันจริงผ่าน แอปใช้งานได้");
  assert.equal(verifyNotice("x", false).body, "ทดสอบรันจริงเจอปัญหา เปิดดูว่าต้องแก้อะไร");
});
