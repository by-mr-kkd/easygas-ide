import { test } from "node:test";
import assert from "node:assert/strict";
import { emptyHubDoc } from "../lib/hub/doc.ts";
import { addProjectItem } from "../lib/hub/add-project.ts";

const P = { name: "ระบบลา", url: "https://run.easygaside.tech/AKfycbx123", deployment: "AKfycbx123" };

test("addProjectItem: the link goes into the first section, once", () => {
  const doc = emptyHubDoc("ฮับโรงเรียน");
  const a = addProjectItem(doc, P, new Date("2026-10-13T00:00:00Z"));
  assert.equal(a.already, false);
  const item = a.doc.sections[0].items[0];
  assert.equal(item.title, "ระบบลา");
  assert.equal(item.url, P.url);
  assert.equal(item.deployment, "AKfycbx123");
  assert.equal(item.added, "2026-10-13T00:00:00.000Z");
  assert.equal(doc.sections[0].items.length, 0, "the input doc is not changed");
  // the same address again (a trailing slash too) → already there, nothing added
  const b = addProjectItem(a.doc, { ...P, url: P.url + "/" });
  assert.equal(b.already, true);
  assert.equal(b.doc.sections[0].items.length, 1);
});

test("addProjectItem: a doc without sections gets one", () => {
  const doc = { ...emptyHubDoc(), sections: [] };
  const r = addProjectItem(doc, P);
  assert.equal(r.doc.sections.length, 1);
  assert.equal(r.doc.sections[0].items.length, 1);
});
