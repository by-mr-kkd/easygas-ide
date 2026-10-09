import { strict as assert } from "node:assert";
import { test } from "node:test";
import { chatHistoryOf } from "../lib/messages-text.ts";

test("chatHistoryOf: text rows, Anthropic and OpenAI rows read as one conversation", () => {
  const rows = [
    { role: "user", content: "ระบบจองคิว" },
    { role: "assistant", content: "เสร็จแล้ว" },
    { role: "user", content: [{ type: "text", text: "เพิ่มปุ่มลบ" }] },
    { role: "assistant", content: [{ type: "text", text: "แก้" }, { type: "tool_use", id: "t1", name: "edit_file", input: {} }] },
    { role: "user", content: [{ type: "tool_result", tool_use_id: "t1", content: "ok" }] },
    { role: "assistant", content: { role: "assistant", content: "เพิ่มให้แล้ว" } },
  ];
  assert.deepEqual(chatHistoryOf(rows), [
    { role: "user", text: "ระบบจองคิว" },
    { role: "assistant", text: "เสร็จแล้ว" },
    { role: "user", text: "เพิ่มปุ่มลบ" },
    { role: "assistant", text: "แก้" },
    { role: "assistant", text: "เพิ่มให้แล้ว" },
  ]);
});

test("chatHistoryOf: the app's image notes are cut from the user's words", () => {
  const rows = [
    { role: "user", content: "ทำตามรูป\n\n[คำบรรยายรูปที่ผู้ใช้แนบ เก็บเป็นข้อความไว้]\nรูปหน้าจอสีฟ้า" },
    { role: "user", content: "ดูรูป\n\n(ผู้ใช้แนบรูปมา แต่ระบบอ่านรูปไม่ได้ตอนนี้ …)" },
  ];
  assert.deepEqual(chatHistoryOf(rows), [
    { role: "user", text: "ทำตามรูป" },
    { role: "user", text: "ดูรูป" },
  ]);
});

test("chatHistoryOf: only the newest entries, in order", () => {
  const rows = Array.from({ length: 10 }, (_, i) => ({ role: i % 2 ? "assistant" : "user", content: `m${i}` }));
  assert.deepEqual(
    chatHistoryOf(rows, 3).map((e) => e.text),
    ["m7", "m8", "m9"],
  );
  assert.deepEqual(chatHistoryOf([]), []);
});
