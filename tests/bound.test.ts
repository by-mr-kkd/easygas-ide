import { strict as assert } from "node:assert";
import { test } from "node:test";
import { enforceBoundManifest, parseBoundCreate, sheetUrl } from "../lib/bound.ts";

const SCRIPT = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcdef";
const SHEET = "1ZyXwVuTsRqPoNmLkJiHgFeDcBa9876543210_-zyxwvu";

test("reads the ids from clasp's --json output, even after progress text", () => {
  const out = `Creating script...\nCloning script...\n${JSON.stringify({ scriptId: SCRIPT, parentId: SHEET, files: ["appsscript.json"] }, null, 2)}\n`;
  assert.deepEqual(parseBoundCreate(out), { scriptId: SCRIPT, sheetId: SHEET });
});

test("no ids, no result: a standalone answer (no parentId) or plain text is refused", () => {
  assert.equal(parseBoundCreate(JSON.stringify({ scriptId: SCRIPT })), null);
  assert.equal(parseBoundCreate("Created new script: https://script.google.com/d/x/edit"), null);
  assert.equal(parseBoundCreate(JSON.stringify({ scriptId: "short", parentId: SHEET })), null);
});

test("the Sheet link", () => {
  assert.equal(sheetUrl(SHEET), `https://docs.google.com/spreadsheets/d/${SHEET}/edit`);
});

test("bound manifest: V8, Bangkok when no zone, the AI's settings kept, no web app added", () => {
  const m = JSON.parse(enforceBoundManifest(JSON.stringify({ runtimeVersion: "DEPRECATED_ES5", oauthScopes: ["https://www.googleapis.com/auth/spreadsheets.currentonly"] })));
  assert.equal(m.runtimeVersion, "V8");
  assert.equal(m.timeZone, "Asia/Bangkok");
  assert.deepEqual(m.oauthScopes, ["https://www.googleapis.com/auth/spreadsheets.currentonly"]);
  assert.equal(m.webapp, undefined);
  assert.equal(JSON.parse(enforceBoundManifest(JSON.stringify({ timeZone: "Asia/Tokyo" }))).timeZone, "Asia/Tokyo");
  assert.equal(JSON.parse(enforceBoundManifest(null)).webapp, undefined);
  assert.equal(enforceBoundManifest("{broken"), "{broken");
});
