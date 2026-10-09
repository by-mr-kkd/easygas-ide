import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseAnnouncement } from "../lib/announcement.ts";

test("parseAnnouncement: a published post, trimmed for a banner", () => {
  const a = parseAnnouncement({ announcement: { id: "p1", title: " เวอร์ชันใหม่ ", excerpt: "ใช้จากมือถือได้แล้ว", url: "https://easygaside.tech/guide/v1-1", publishedAt: "x" } });
  assert.deepEqual(a, { id: "p1", title: "เวอร์ชันใหม่", excerpt: "ใช้จากมือถือได้แล้ว", url: "https://easygaside.tech/guide/v1-1" });
});

test("parseAnnouncement: nothing to show, or a link that leaves the site", () => {
  assert.equal(parseAnnouncement({ announcement: null }), null);
  assert.equal(parseAnnouncement(null), null);
  assert.equal(parseAnnouncement({ announcement: { id: "p", title: "t", url: "https://evil.example/x" } }), null);
  assert.equal(parseAnnouncement({ announcement: { id: "p", title: "t", url: "https://easygaside.tech.evil.example/x" } }), null);
  assert.equal(parseAnnouncement({ announcement: { id: "p", title: "t", url: "javascript:alert(1)" } }), null);
});

test("parseAnnouncement: long words are cut", () => {
  const a = parseAnnouncement({ announcement: { id: "p", title: "ก".repeat(300), excerpt: "ข".repeat(300), url: "https://easygaside.tech/guide/x" } });
  assert.ok(a && a.title.length === 120 && a.title.endsWith("…") && a.excerpt.length === 200);
});
