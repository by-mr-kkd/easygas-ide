import { strict as assert } from "node:assert";
import { test } from "node:test";
import { AttachRefusal, buildAttachment } from "../lib/support/code.ts";
import { REDACTED, redactCredentials } from "../lib/share/scan.ts";

test("masks API keys and token assignments, keeps placeholders", () => {
  const src = [
    'const KEY = "AIzaSyA1234567890abcdefghijklmnopqrstuv";',
    'var token = "abcdefghijklmnop1234";',
    'var apiKey = "ใส่คีย์ตรงนี้ของคุณเอง";',
  ].join("\n");
  const r = redactCredentials(src);
  assert.equal(r.count, 2);
  assert.ok(!r.text.includes("AIzaSyA1234567890"));
  assert.ok(!r.text.includes("abcdefghijklmnop1234"));
  assert.ok(r.text.includes("ใส่คีย์ตรงนี้ของคุณเอง"));
  assert.equal(r.text.split(REDACTED).length - 1, 2);
});

test("masks a whole private key block, not only its header", () => {
  const r = redactCredentials("x\n-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBg\n-----END PRIVATE KEY-----\ny");
  assert.equal(r.count, 1);
  assert.equal(r.text, `x\n${REDACTED}\ny`);
});

test("leaves dot files out, sorts, normalises line ends and counts masks", () => {
  const a = buildAttachment(" ระบบจองคิว ", [
    { path: "Index.html", content: "<p>hi</p>\r\n" },
    { path: ".clasp.json", content: '{"scriptId":"x"}' },
    { path: "Code.gs", content: 'var secret = "k9Qw2LmZ7xR4tP8vN3sB";' },
  ]);
  assert.equal(a.project, "ระบบจองคิว");
  assert.deepEqual(a.files.map((f) => f.name), ["Code.gs", "Index.html"]);
  assert.equal(a.files[1].source, "<p>hi</p>\n");
  assert.equal(a.redacted, 1);
});

test("refuses an empty project and oversized code", () => {
  assert.throws(() => buildAttachment("p", [{ path: ".clasp.json", content: "{}" }]), AttachRefusal);
  assert.throws(() => buildAttachment("p", [{ path: "Big.gs", content: "x".repeat(200_001) }]), AttachRefusal);
  const many = Array.from({ length: 4 }, (_, i) => ({ path: `F${i}.gs`, content: "y".repeat(190_000) }));
  assert.throws(() => buildAttachment("p", many), /600 KB/);
});
