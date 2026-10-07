import { strict as assert } from "node:assert";
import { test } from "node:test";
import { decideSync, sameFiles } from "../lib/sync-status.ts";

const f = (path: string, content: string) => ({ path, content });
const MANIFEST = f("appsscript.json", '{"timeZone":"Asia/Bangkok","runtimeVersion":"V8"}');
const base = [MANIFEST, f("Code.gs", "function a() {}\n")];

test("sameFiles: Google's re-formatted manifest and CRLF/trailing space do not count as a change", () => {
  const google = [
    f("appsscript.json", '{\n  "runtimeVersion": "V8",\n  "timeZone": "Asia/Bangkok"\n}'),
    f("Code.gs", "function a() {}\r\n\r\n"),
  ];
  assert.equal(sameFiles(base, google), true);
  assert.equal(sameFiles(base, [MANIFEST, f("Code.gs", "function b() {}")]), false);
  assert.equal(sameFiles(base, [MANIFEST]), false); // a file was deleted
  assert.equal(sameFiles(base, [MANIFEST, f("Other.gs", "function a() {}\n")]), false); // renamed
});

test("decideSync with a baseline (imported script): which side moved", () => {
  const edited = [MANIFEST, f("Code.gs", "function a() { return 1; }")];
  const googleEdit = [MANIFEST, f("Code.gs", "function a() { return 2; }")];
  const run = (local: typeof base, remote: typeof base) =>
    decideSync({ local, remote, baseline: base, localChangedSinceDeploy: false });
  assert.equal(run(base, base), "same");
  assert.equal(run(base, googleEdit), "google_newer");
  assert.equal(run(edited, base), "local_newer");
  assert.equal(run(edited, googleEdit), "both");
  assert.equal(run(edited, edited), "same"); // the same edit on both sides
});

test("decideSync without a baseline (made in the app): the last publish tells the sides apart", () => {
  const other = [MANIFEST, f("Code.gs", "function z() {}")];
  assert.equal(decideSync({ local: base, remote: base, baseline: null, localChangedSinceDeploy: true }), "same");
  assert.equal(decideSync({ local: base, remote: other, baseline: null, localChangedSinceDeploy: true }), "local_newer");
  assert.equal(decideSync({ local: base, remote: other, baseline: null, localChangedSinceDeploy: false }), "google_newer");
});
