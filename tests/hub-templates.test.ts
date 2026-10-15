import { test } from "node:test";
import assert from "node:assert/strict";
import { cleanHubDoc, emptyHubDoc, HUB_ICONS, LIMITS } from "../lib/hub/doc.ts";
import { applyHubTemplate, HUB_TEMPLATES, hubHasLinks, placeholderLinks, TEMPLATE_URL, templateSections } from "../lib/hub/templates.ts";

const noImage = () => false;

test("every template is a valid hub once applied, within the limits, with known icons", () => {
  for (const t of HUB_TEMPLATES) {
    for (const s of t.sections) for (const i of s.items) assert.ok((HUB_ICONS as readonly string[]).includes(i.icon), `${t.id}: icon ${i.icon}`);
    const doc = cleanHubDoc(applyHubTemplate(emptyHubDoc("ทดสอบ"), t, "replace"), noImage);
    assert.equal(doc.theme, t.theme);
    assert.equal(doc.layout, t.layout);
    assert.equal(doc.accent, t.accent);
    assert.equal(doc.font, t.font);
    assert.ok(doc.sections.length <= LIMITS.sections);
    const items = doc.sections.flatMap((s) => s.items);
    assert.ok(items.length > 0 && items.length <= LIMITS.items);
    assert.ok(items.every((i) => i.url === TEMPLATE_URL && i.icon.startsWith("i:") && i.deployment === ""));
    assert.equal(placeholderLinks(doc), items.length);
  }
  assert.equal(new Set(HUB_TEMPLATES.map((t) => t.id)).size, HUB_TEMPLATES.length);
});

test("append keeps the hub's own links first, style keeps them untouched, replace drops them; title stays", () => {
  const own = emptyHubDoc("ร้านของฉัน");
  own.sections[0].items.push({ ...templateSections(HUB_TEMPLATES[0])[0].items[0], url: "https://my.app/" });
  assert.ok(hubHasLinks(own));
  const tpl = HUB_TEMPLATES[1];
  const appended = applyHubTemplate(own, tpl, "append");
  assert.equal(appended.title, "ร้านของฉัน");
  assert.equal(appended.sections[0].items[0].url, "https://my.app/");
  assert.equal(appended.sections.length, 1 + tpl.sections.length);
  const styled = applyHubTemplate(own, tpl, "style");
  assert.deepEqual(styled.sections, own.sections);
  assert.equal(styled.theme, tpl.theme);
  const replaced = applyHubTemplate(own, tpl, "replace");
  assert.equal(replaced.sections.length, tpl.sections.length);
  assert.ok(!replaced.sections.flatMap((s) => s.items).some((i) => i.url === "https://my.app/"));
  // fresh ids every time: applying twice never collides
  const a = templateSections(tpl).flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
  const b = templateSections(tpl).flatMap((s) => [s.id, ...s.items.map((i) => i.id)]);
  assert.equal(new Set([...a, ...b]).size, a.length + b.length);
});
