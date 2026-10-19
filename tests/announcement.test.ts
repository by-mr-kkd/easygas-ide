import { strict as assert } from "node:assert";
import { test } from "node:test";
import { addDismissed, parseAnnouncements, readDismissed } from "../lib/announcement.ts";

test("parseAnnouncements: the site's notice first, then a published post", () => {
  const list = parseAnnouncements({
    notice: { id: "ab12cd34", text: " เข้ากลุ่มใหม่ที่นี่ ", url: "https://www.facebook.com/share/g/1Eqao7z9rD/" },
    announcement: { id: "p1", title: " เวอร์ชันใหม่ ", excerpt: "ใช้จากมือถือได้แล้ว", url: "https://easygaside.tech/guide/v1-1", publishedAt: "x" },
  });
  assert.deepEqual(list, [
    { id: "n:ab12cd34", kind: "notice", title: "เข้ากลุ่มใหม่ที่นี่", excerpt: "", url: "https://www.facebook.com/share/g/1Eqao7z9rD/" },
    { id: "p:p1", kind: "post", title: "เวอร์ชันใหม่", excerpt: "ใช้จากมือถือได้แล้ว", url: "https://easygaside.tech/guide/v1-1" },
  ]);
});

test("parseAnnouncements: an older site (post only) still works", () => {
  const list = parseAnnouncements({ announcement: { id: "p1", title: "t", url: "https://easygaside.tech/guide/x" } });
  assert.equal(list.length, 1);
  assert.equal(list[0].id, "p:p1");
});

test("parseAnnouncements: nothing to show, or links the app will not open", () => {
  assert.deepEqual(parseAnnouncements({ announcement: null, notice: null }), []);
  assert.deepEqual(parseAnnouncements(null), []);
  assert.deepEqual(parseAnnouncements({ announcement: { id: "p", title: "t", url: "https://evil.example/x" } }), []);
  assert.deepEqual(parseAnnouncements({ announcement: { id: "p", title: "t", url: "https://easygaside.tech.evil.example/x" } }), []);
  assert.deepEqual(parseAnnouncements({ announcement: { id: "p", title: "t", url: "javascript:alert(1)" } }), []);
  assert.deepEqual(parseAnnouncements({ notice: { id: "n", text: "t", url: "javascript:alert(1)" } }), []);
  assert.deepEqual(parseAnnouncements({ notice: { id: "n", text: "t", url: "http://example.com" } }), []);
  assert.deepEqual(parseAnnouncements({ notice: { id: "n", text: "  ", url: "https://example.com" } }), []);
  assert.deepEqual(parseAnnouncements({ notice: { id: "bad id,", text: "t", url: "https://example.com" } }), []);
});

test("parseAnnouncements: long words are cut", () => {
  const [a] = parseAnnouncements({ announcement: { id: "p", title: "ก".repeat(300), excerpt: "ข".repeat(300), url: "https://easygaside.tech/guide/x" } });
  assert.ok(a && a.title.length === 120 && a.title.endsWith("…") && a.excerpt.length === 200);
});

test("dismissed ids: kept as a short list, junk dropped, a repeat moves to the end", () => {
  assert.deepEqual(readDismissed(null), []);
  assert.deepEqual(readDismissed("n:aa,junk,p:1"), ["n:aa", "p:1"]);
  assert.equal(addDismissed("n:aa,p:1", "n:aa"), "p:1,n:aa");
  let s = "";
  for (let i = 0; i < 30; i++) s = addDismissed(s, `p:${i}`);
  const ids = readDismissed(s);
  assert.equal(ids.length, 20);
  assert.equal(ids[19], "p:29");
});
