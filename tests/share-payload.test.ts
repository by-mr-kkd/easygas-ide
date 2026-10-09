import { strict as assert } from "node:assert";
import { test } from "node:test";
import { fromShareFiles, kindOf, parseSharePublic, ShareRefusal, toShareFiles } from "../lib/share/payload.ts";
import { parseShareLink } from "../lib/share/link.ts";
import { scanShare } from "../lib/share/scan.ts";

const manifest = { path: "appsscript.json", content: JSON.stringify({ timeZone: "Asia/Bangkok", webapp: { access: "ANYONE_ANONYMOUS" }, oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"] }) };

test("toShareFiles: project files become the website's shape, private files stay home", () => {
  const files = toShareFiles([manifest, { path: "Code.gs", content: "function doGet() {}\r\n" }, { path: "Index.html", content: "<h1>hi</h1>" }, { path: ".clasp.json", content: "{}" }]);
  assert.deepEqual(
    files.map((f) => f.name),
    ["appsscript.json", "Code.gs", "Index.html"],
  );
  assert.equal(files[1].source, "function doGet() {}\n", "line endings normalised");
});

test("toShareFiles: refuses folders, odd extensions, a missing manifest and no code", () => {
  assert.throws(() => toShareFiles([manifest, { path: "lib/Util.gs", content: "" }]), ShareRefusal);
  assert.throws(() => toShareFiles([manifest, { path: "notes.txt", content: "x" }]), ShareRefusal);
  assert.throws(() => toShareFiles([{ path: "Code.gs", content: "x" }]), /appsscript\.json/);
  assert.throws(() => toShareFiles([manifest, { path: "Index.html", content: "x" }]), /\.gs/);
  assert.throws(() => toShareFiles([]), ShareRefusal);
});

test("fromShareFiles: .js from the website becomes .gs here, bad names are refused", () => {
  const files = fromShareFiles([
    { name: "appsscript.json", source: "{}" },
    { name: "Code.js", source: "x" },
  ]);
  assert.deepEqual(
    files.map((f) => f.path),
    ["appsscript.json", "Code.gs"],
  );
  assert.throws(() => fromShareFiles([{ name: "../evil.gs", source: "x" }, { name: "appsscript.json", source: "{}" }]), ShareRefusal);
  assert.throws(() => fromShareFiles([{ name: "Code.gs", source: "x" }]), /appsscript\.json/);
  assert.throws(() => fromShareFiles("nope"), ShareRefusal);
});

test("kindOf: a web app manifest → webapp, anything else → bound", () => {
  assert.equal(kindOf([manifest]), "webapp");
  assert.equal(kindOf([{ path: "appsscript.json", content: "{}" }]), "bound");
  assert.equal(kindOf([{ path: "appsscript.json", content: "not json" }]), "bound");
});

test("parseSharePublic: the website's answer is checked field by field", () => {
  const share = parseSharePublic({
    share: {
      slug: "k7m2pq9xz3",
      title: "ระบบจอง",
      description: "d",
      author: { name: "ตั้ม", kind: "pro" },
      files: [{ name: "appsscript.json", source: "{}" }, { name: "Code.gs", source: "x" }],
      scopes: ["a", 1, "b"],
      services: ["Sheets"],
      warnings: [{ level: "warn", kind: "อีเมล", file: "Code.gs", line: "3", sample: "a…b" }],
      version: "2",
      parent: "bad slug!",
      cloneCount: 5,
      forks: [{ slug: "abcdef12", title: "f", author: "x", cloneCount: 1 }, { slug: "!!", title: "no" }],
      url: "https://easygaside.tech/s/k7m2pq9xz3",
    },
  });
  assert.equal(share.slug, "k7m2pq9xz3");
  assert.equal(share.author.kind, "pro");
  assert.deepEqual(share.scopes, ["a", "b"]);
  assert.equal(share.warnings[0].line, 3);
  assert.equal(share.version, 2);
  assert.equal(share.parent, null);
  assert.equal(share.forks.length, 1);
  assert.equal(share.url, "https://easygaside.tech/s/k7m2pq9xz3");
  assert.throws(() => parseSharePublic({ share: { slug: "x" } }), ShareRefusal);
  assert.throws(() => parseSharePublic({}), ShareRefusal);
});

test("the vendored scanner and link parser behave like the website's", () => {
  const files = toShareFiles([manifest, { path: "Code.gs", content: "const KEY = 'AIzaSyD-1234567890abcdefghijklmnopqrstuv';" }]);
  assert.equal(scanShare(files).blocked.length, 1);
  assert.equal(parseShareLink("https://easygaside.tech/s/k7m2pq9xz3"), "k7m2pq9xz3");
  assert.equal(parseShareLink("easygas://clone/k7m2pq9xz3"), "k7m2pq9xz3");
  assert.equal(parseShareLink("https://example.com/other"), null);
});
