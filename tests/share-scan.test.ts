import { test } from "node:test";
import assert from "node:assert/strict";
import { detectServices, readScopes, scanShare, scopeLabel } from "../lib/share/scan.ts";
import { parseShareLink } from "../lib/share/link.ts";

const manifest = { name: "appsscript.json", source: JSON.stringify({ timeZone: "Asia/Bangkok", oauthScopes: ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/script.external_request"] }) };

test("refuses a Google API key and names the file and line", () => {
  const files = [manifest, { name: "Code.gs", source: "function a() {}\nconst KEY = 'AIzaSyD-1234567890abcdefghijklmnopqrstuv';\n" }];
  const { blocked } = scanShare(files);
  assert.equal(blocked.length, 1);
  assert.equal(blocked[0].file, "Code.gs");
  assert.equal(blocked[0].line, 2);
  assert.equal(blocked[0].kind, "Google API key");
  assert.ok(!blocked[0].sample.includes("1234567890"), "the sample is masked");
});

test("refuses a token assigned in the code, but not a placeholder", () => {
  const real = scanShare([manifest, { name: "Line.gs", source: "var LINE_TOKEN = 'k3Jd92mfkA02ldkf93JDkfl2039dkfjJF';" }]);
  assert.equal(real.blocked.length, 1);
  const placeholder = scanShare([manifest, { name: "Line.gs", source: "var LINE_TOKEN = 'ใส่ TOKEN ของคุณตรงนี้';\nvar token = 'YOUR_TOKEN_HERE_1234567';" }]);
  assert.equal(placeholder.blocked.length, 0);
  const fromProps = scanShare([manifest, { name: "Line.gs", source: "var LINE_TOKEN = PropertiesService.getScriptProperties().getProperty('LINE_TOKEN');" }]);
  assert.equal(fromProps.blocked.length, 0);
});

test("warns about a spreadsheet id and an email, without refusing", () => {
  const files = [manifest, { name: "Code.gs", source: "const SS = SpreadsheetApp.openById('1aBcDeFgHiJkLmNoPqRsTuVwXyZ0123456789abcdefg');\nMailApp.sendEmail('boss@company.co.th', 'hi', 'x');" }];
  const { blocked, warnings } = scanShare(files);
  assert.equal(blocked.length, 0);
  assert.deepEqual(
    warnings.map((w) => w.kind),
    ["ID ไฟล์ Google (Sheets/Drive/Docs)", "อีเมล"],
  );
});

test("clean code passes with nothing to say", () => {
  const files = [manifest, { name: "Code.gs", source: "function doGet() { return HtmlService.createHtmlOutputFromFile('Index'); }" }, { name: "Index.html", source: "<h1>สวัสดี</h1>" }];
  const r = scanShare(files);
  assert.equal(r.blocked.length, 0);
  assert.equal(r.warnings.length, 0);
});

test("reads scopes and detects services", () => {
  const files = [manifest, { name: "Code.gs", source: "SpreadsheetApp.getActive(); UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push'); MailApp.sendEmail('a@b.co','s','b');" }];
  assert.deepEqual(readScopes(files), ["https://www.googleapis.com/auth/spreadsheets", "https://www.googleapis.com/auth/script.external_request"]);
  assert.deepEqual(detectServices(files), ["Sheets", "Gmail", "LINE"]);
  assert.equal(scopeLabel("https://www.googleapis.com/auth/spreadsheets"), "อ่าน/เขียน Google Sheets");
  assert.equal(scopeLabel("https://www.googleapis.com/auth/unknown.thing"), "unknown.thing");
});

test("parses every form of a share link", () => {
  assert.equal(parseShareLink("https://easygaside.tech/s/k7m2pq9xz3"), "k7m2pq9xz3");
  assert.equal(parseShareLink("https://easygaside.tech/s/k7m2pq9xz3?utm=x"), "k7m2pq9xz3");
  assert.equal(parseShareLink("easygas://clone/k7m2pq9xz3"), "k7m2pq9xz3");
  assert.equal(parseShareLink("  K7M2PQ9XZ3 "), "k7m2pq9xz3");
  assert.equal(parseShareLink("https://easygaside.tech/board/t/abc"), null);
  assert.equal(parseShareLink("hello world"), null);
  assert.equal(parseShareLink(""), null);
});
