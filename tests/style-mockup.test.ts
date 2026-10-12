import { strict as assert } from "node:assert";
import { test } from "node:test";
import { STYLE_CATALOG } from "../lib/style-catalog.ts";
import { composeMockup, demoMessage, isVisualCategory, lookLine, mergeAppBlocks, planMockup, sanitizeLook, stripAppBlocks, stylePromptLines } from "../lib/style-mockup.ts";
import { NO_PRO_FEATURES, proFeatureLines, sanitizeProFeatures } from "../lib/pro-features.ts";
import { pwaFiles, shortName } from "../lib/pages/pwa.ts";
import { buildStaticPage } from "../lib/pages/static-page.ts";
import { FAKE_RUNTIME } from "./_pages-runtime.ts";

test("planMockup: nothing picked = sidebar + table on a desktop, bottom bar on a phone", () => {
  const desk = planMockup([], STYLE_CATALOG, "desktop");
  assert.equal(desk.nav, "sidebar");
  assert.equal(desk.table, true);
  assert.equal(desk.feedback, null);
  assert.deepEqual(desk.badges, []);
  assert.equal(planMockup([], STYLE_CATALOG, "mobile").nav, "bottom");
});

test("planMockup: each pick fills its slot; the last navigation wins; capabilities become badges", () => {
  const p = planMockup(["nav-sidebar", "nav-topbar", "data-kpi", "fb-toast", "thai-date", "notify-line", "auto-trigger"], STYLE_CATALOG);
  assert.equal(p.nav, "top");
  assert.equal(p.kpi, true);
  assert.equal(p.table, false, "KPI alone replaces the default table");
  assert.equal(p.feedback, "toast");
  assert.equal(p.thaiDate, true);
  assert.deepEqual(p.badges, ["แจ้งเตือนเข้า LINE เจ้าของร้าน", "ทำงานอัตโนมัติตามเวลา"]);
});

test("composeMockup: a full document with no script, the look applied, Thai dates when picked", () => {
  const html = composeMockup({ picks: ["data-table", "thai-date", "fb-sweetalert"], catalog: STYLE_CATALOG, look: { color: "#be185d", font: "Kanit", tone: "dark" } });
  assert.match(html, /^<!doctype html>/);
  assert.doesNotMatch(html, /<script/i, "the iframe runs with scripts off; nothing should need them");
  assert.match(html, /#be185d/);
  assert.match(html, /family=Kanit/);
  assert.match(html, /12 ต\.ค\. 2569/);
  assert.match(html, /บันทึกเรียบร้อย/);
});

test("composeMockup: a bad colour or font falls back; the phone shows the address bar unless installed", () => {
  const html = composeMockup({ picks: [], catalog: STYLE_CATALOG, look: { color: "red;}</style><script>", font: "Comic" }, device: "mobile" });
  assert.doesNotMatch(html, /<\/style><script>/);
  assert.match(html, /#047857/);
  assert.match(html, /script\.google\.com/);
  const app = composeMockup({ picks: [], catalog: STYLE_CATALOG, device: "mobile", pro: { pwa: true, notify: true } });
  assert.doesNotMatch(app, /script\.google\.com/);
  assert.match(app, /มีรายการใหม่/);
});

test("catalog: every category is either drawn or a capability, and badge titles are escaped", () => {
  for (const item of STYLE_CATALOG) assert.equal(typeof isVisualCategory(item.category), "boolean");
  const html = composeMockup({ picks: ["x"], catalog: [{ id: "x", category: "auto", title: "<b>x</b>", when: "", promptSnippet: "", previewHtml: "" }] });
  assert.match(html, /&lt;b&gt;x&lt;\/b&gt;/);
});

test("messages: the demo asks for a screen only and carries the look and the picks", () => {
  const items = STYLE_CATALOG.filter((i) => i.id === "nav-sidebar");
  const msg = demoMessage({ description: "ระบบจองคิว", look: { color: "#047857", font: "Prompt", tone: "light" }, styles: items });
  assert.match(msg, /^ระบบจองคิว/);
  assert.match(msg, /ทำเดโม่หน้าจอ/);
  assert.match(msg, /ยังไม่ต้องต่อ Google Sheet/);
  assert.match(msg, /ฟอนต์ Prompt/);
  assert.match(msg, /เมนูแบบ Sidebar/);
  assert.equal(stylePromptLines([]), "");
  assert.match(lookLine({ color: "#1d4ed8" }), /น้ำเงิน/);
  assert.equal(sanitizeLook(null), null);
  assert.deepEqual(sanitizeLook({ tone: "dark" }), { color: "#047857", font: "IBM Plex Sans Thai", tone: "dark" });
});

test("pro features: only true booleans count; no lines when nothing is picked", () => {
  assert.deepEqual(sanitizeProFeatures({ pwa: "yes", notify: true, extra: 1 }), { pwa: false, notify: true, camera: false, qr: false });
  assert.equal(proFeatureLines(NO_PRO_FEATURES), "");
  const lines = proFeatureLines({ pwa: true, notify: true, camera: false, qr: false });
  assert.match(lines, /ติดตั้งเป็นแอป/);
  assert.match(lines, /ไม่ใช้ push/);
});

test("pwa: manifest, service worker and icon; the worker leaves other origins alone", () => {
  const { files, head } = pwaFiles({ name: "ระบบจองคิวร้านตัดผมของคุณเอ", color: "#be185d" });
  const byPath = Object.fromEntries(files.map((f) => [f.path, f.content]));
  const manifest = JSON.parse(byPath["manifest.webmanifest"]);
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "./");
  assert.equal(manifest.theme_color, "#be185d");
  assert.ok(manifest.short_name.length <= 12);
  assert.match(byPath["sw.js"], /origin !== self\.location\.origin\) return/);
  assert.match(byPath["icon.svg"], /^<svg/);
  assert.ok(head.some((h) => h.includes('rel="manifest"')));
  assert.equal(pwaFiles({ name: "x", color: "javascript:" }).files.length, 4);
  assert.match(pwaFiles({ name: "x", color: "nope" }).head.join(""), /#047857/);
  assert.equal(shortName("แอป"), "แอป");
});

test("buildStaticPage: adds the PWA files and head tags only when asked", () => {
  const files = [{ path: "Index.html", content: "<!DOCTYPE html><html><head><title>t</title></head><body>hi</body></html>" }];
  const opts = { execUrl: "https://script.google.com/macros/s/AKfycbxyz_ABC-123/exec", shim: FAKE_RUNTIME.shim };
  const plain = buildStaticPage(files, opts);
  assert.equal(plain.length, 2);
  assert.doesNotMatch(plain[0].content, /manifest/);
  const pwa = buildStaticPage(files, { ...opts, pwa: { name: "แอปของฉัน" } });
  assert.deepEqual(pwa.map((f) => f.path).sort(), [".nojekyll", "icon.svg", "index.html", "install.js", "manifest.webmanifest", "sw.js"]);
  assert.match(pwa.find((f) => f.path === "index.html")!.content, /<link rel="manifest" href="manifest\.webmanifest">/);
});

test("mergeAppBlocks: a second 'ใส่ในช่องแชท' swaps the style block instead of stacking it", () => {
  const one = STYLE_CATALOG.filter((i) => i.id === "theme-darktoggle");
  const two = STYLE_CATALOG.filter((i) => i.id === "theme-darktoggle" || i.id === "nav-bottom");
  const typed = "ระบบสต็อกสินค้า";
  const first = mergeAppBlocks(typed, stylePromptLines(one));
  const second = mergeAppBlocks(first, stylePromptLines(two));
  assert.equal(second.split("โดยใช้สไตล์และองค์ประกอบเหล่านี้:").length - 1, 1);
  assert.ok(second.startsWith(typed));
  assert.equal((second.match(/^- /gm) ?? []).length, 2);
  // the user's own "- " lines outside a block stay
  const own = "ต้องมี:\n- หน้าแอดมิน";
  assert.ok(mergeAppBlocks(own, stylePromptLines(one)).startsWith(own));
  assert.equal(mergeAppBlocks("", "x"), "x");
});

test("a demo made with the style block already in the box carries it once", () => {
  const styles = STYLE_CATALOG.filter((i) => i.id === "nav-bottom");
  const box = mergeAppBlocks("ระบบสต็อกสินค้า", stylePromptLines(styles));
  const msg = demoMessage({ description: stripAppBlocks(box), styles });
  assert.equal(msg.split("โดยใช้สไตล์และองค์ประกอบเหล่านี้:").length - 1, 1);
  assert.ok(msg.startsWith("ระบบสต็อกสินค้า"));
});

test("the demo brief keeps it small and never waits on the server", () => {
  const msg = demoMessage({ description: "ระบบขอลางาน" });
  assert.match(msg, /ไฟล์เดียว/);
  assert.match(msg, /ห้ามเรียก google\.script\.run/);
  assert.match(msg, /หน้าเข้าสู่ระบบ/);
  assert.match(msg, /ห้ามมีชื่อผู้ใช้\/รหัสผ่านตัวอย่าง/);
});
