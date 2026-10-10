import { strict as assert } from "node:assert";
import { test } from "node:test";
import { enforceBoundManifest, hasDoGet, kindForExisting, manifestHasWebApp, parseBoundCreate, sheetUrl, usesContainer } from "../lib/bound.ts";

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


const WEB_MANIFEST = { path: "appsscript.json", content: JSON.stringify({ webapp: { access: "ANYONE_ANONYMOUS" } }) };

test("a tutorial-style script (active spreadsheet + doGet + web-app manifest) lives in a Sheet", () => {
  const files = [{ path: "Code.gs", content: "function doGet(){ var sh = SpreadsheetApp.getActiveSpreadsheet().getSheetByName('Data'); }" }, WEB_MANIFEST];
  assert.equal(usesContainer(files), true);
  assert.equal(hasDoGet(files), true);
  assert.equal(manifestHasWebApp(files), true);
  assert.equal(kindForExisting(files), "bound");
});

test("a standalone web app (openById, web-app manifest) stays a web app; no manifest section = bound", () => {
  const web = [{ path: "Code.gs", content: "function doGet(){ SpreadsheetApp.openById(ID); }" }, WEB_MANIFEST];
  assert.equal(kindForExisting(web), "webapp");
  assert.equal(kindForExisting([{ path: "Code.gs", content: "function run(){}" }, { path: "appsscript.json", content: "{}" }]), "bound");
});

test("only code files count: a comment in HTML or a doGet mention in JSON does not", () => {
  const files = [{ path: "Index.html", content: "<script>// getActiveSheet()</script>" }, { path: "appsscript.json", content: '{"x":"function doGet("}' }];
  assert.equal(usesContainer(files), false);
  assert.equal(hasDoGet(files), false);
  assert.equal(usesContainer([{ path: "Menu.gs", content: "SpreadsheetApp.getUi().createMenu('x')" }]), true);
});
