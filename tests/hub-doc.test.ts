import { strict as assert } from "node:assert";
import { test } from "node:test";
import { cleanHubDoc, cleanSlug, cleanUrl, deploymentOf, emptyHubDoc, HubDocError, isNew, isShown, suggestSlug, usesSchedule } from "../lib/hub/doc.ts";

const IMG = "https://x.supabase.co/storage/v1/object/public/hub-images/a.webp";
const isImage = (u: string) => u === IMG;
const ID = "AKfycbxgQmlfhHGsiL4eJzGwX9Wmek4GuZ-2TdGWxmO8zPcwgbi2aFrol7REAXQiWkPbIid7";

function doc(items: unknown[], extra: Record<string, unknown> = {}) {
  return { ...emptyHubDoc("โรงเรียน"), ...extra, sections: [{ id: "sec1", title: "งาน", items }] };
}

test("links: http(s) only, no credentials, a bare domain gets https", () => {
  assert.equal(cleanUrl("example.com/a"), "https://example.com/a");
  assert.equal(cleanUrl("javascript:alert(1)"), null);
  assert.equal(cleanUrl("https://user:pw@example.com"), null);
  assert.equal(cleanUrl("ftp://example.com"), null);
  assert.equal(cleanUrl("localhost"), null);
});

test("an Apps Script link is recognised in both forms, /dev and domain links are not", () => {
  assert.equal(deploymentOf(`https://script.google.com/macros/s/${ID}/exec`), ID);
  assert.equal(deploymentOf(`https://script.google.com/macros/u/9/s/${ID}/exec?page=a`), ID);
  assert.equal(deploymentOf(`https://script.google.com/macros/s/${ID}/dev`), null);
  assert.equal(deploymentOf(`https://script.google.com/a/macros/school.ac.th/s/${ID}/exec`), null);
});

test("a document is cleaned: foreign pictures dropped, bad colours and emoji markup removed, deployment found", () => {
  const d = cleanHubDoc(
    doc([{ id: "i1", title: " ระบบลา ", url: `https://script.google.com/macros/u/2/s/${ID}/exec`, icon: "<b>", iconUrl: "https://evil/x.png", color: "red" }], { cover: IMG, logo: "https://evil/l.png", theme: "nope" }),
    isImage,
  );
  const it = d.sections[0].items[0];
  assert.equal(it.title, "ระบบลา");
  assert.equal(it.icon, "");
  assert.equal(it.iconUrl, "");
  assert.equal(it.color, "");
  assert.equal(it.deployment, ID);
  assert.equal(d.cover, IMG);
  assert.equal(d.logo, "");
  assert.equal(d.theme, "school");
});

test("a link without a name or a valid address is refused with its place", () => {
  assert.throws(() => cleanHubDoc(doc([{ title: "", url: "https://a.com" }]), isImage), (e: unknown) => e instanceof HubDocError && /ลิงก์ที่ 1/.test(e.message));
  assert.throws(() => cleanHubDoc(doc([{ title: "x", url: "javascript:1" }]), isImage), HubDocError);
  assert.throws(() => cleanHubDoc({ ...doc([]), title: " " }, isImage), HubDocError);
});

test("duplicate ids are renumbered; schedules read in Bangkok time", () => {
  const d = cleanHubDoc(doc([{ id: "same1", title: "a", url: "a.com" }, { id: "same1", title: "b", url: "b.com", start: "2026-10-13", end: "2026-10-20" }]), isImage);
  const [a, b] = d.sections[0].items;
  assert.notEqual(a.id, b.id);
  assert.equal(usesSchedule(d), true);
  // 2026-10-12 18:00 UTC = 2026-10-13 01:00 in Bangkok
  assert.equal(isShown(b, new Date("2026-10-12T18:00:00Z")), true);
  assert.equal(isShown(b, new Date("2026-10-12T16:00:00Z")), false);
  assert.throws(() => cleanHubDoc(doc([{ title: "c", url: "c.com", start: "2026-10-20", end: "2026-10-01" }]), isImage), HubDocError);
});

test("ใหม่ shows for 7 days after adding", () => {
  const d = cleanHubDoc(doc([{ title: "a", url: "a.com", added: "2026-10-01T00:00:00Z" }]), isImage);
  const it = d.sections[0].items[0];
  assert.equal(isNew(it, new Date("2026-10-05T00:00:00Z")), true);
  assert.equal(isNew(it, new Date("2026-10-09T00:00:00Z")), false);
});

test("slugs: cleaned, reserved words and phishing-looking names refused", () => {
  assert.equal(cleanSlug(" My School_2026 "), "my-school-2026");
  for (const bad of ["ab", "admin", "kbank-login", "-abc", "easygas-team", "ร.ร."]) assert.throws(() => cleanSlug(bad), HubDocError, bad);
  assert.match(suggestSlug("โรงเรียนบ้านนา"), /^hub-[a-z0-9]{8}$/);
  assert.match(suggestSlug("Ban Na School"), /^ban-na-school-[a-z0-9]{5}$/);
});
