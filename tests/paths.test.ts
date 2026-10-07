import { strict as assert } from "node:assert";
import { join, resolve } from "node:path";
import { test } from "node:test";
import { assertProjectId, dataRoot, resolveInSrc, srcDir } from "../lib/local/paths.ts";

process.env.EASYGAS_DATA_DIR = resolve("tmp-test-data");
const ID = "0f8c2a3e-1b2c-4d5e-8f90-123456789abc";

test("resolves a plain project file inside src/", () => {
  assert.equal(resolveInSrc(ID, "Code.gs"), join(srcDir(ID), "Code.gs"));
});

test("allows nested folders inside src/", () => {
  assert.equal(resolveInSrc(ID, "lib/util.gs"), join(srcDir(ID), "lib", "util.gs"));
});

test("rejects parent-directory traversal", () => {
  for (const p of ["../project.json", "../../settings.json", "a/../../x.gs", "..\\..\\x.gs"]) {
    assert.throws(() => resolveInSrc(ID, p), /invalid_file_path/, p);
  }
});

test("rejects absolute and drive-letter paths", () => {
  for (const p of ["/etc/passwd", "C:/Windows/win.ini", "c:\\x.gs", "\\\\server\\share\\x.gs"]) {
    assert.throws(() => resolveInSrc(ID, p), /invalid_file_path/, p);
  }
});

test("rejects Windows device names, alternate data streams and trimmed segments", () => {
  for (const p of ["CON.gs", "nul.html", "lib/COM1.gs", "LPT9", "Code.gs:evil", "a<b.gs", "Code.gs.", "lib /x.gs", "lib./x.gs"]) {
    assert.throws(() => resolveInSrc(ID, p), /invalid_file_path/, p);
  }
  assert.equal(resolveInSrc(ID, "console.gs"), join(srcDir(ID), "console.gs"), "only exact device names are reserved");
});

test("rejects empty paths and the src root itself", () => {
  for (const p of ["", "   ", ".", "./"]) assert.throws(() => resolveInSrc(ID, p), /invalid_file_path/, JSON.stringify(p));
});

test("rejects project ids that could escape the projects folder", () => {
  for (const id of ["..", "../x", "a/b", "C:", "short", "UPPER-CASE-ID-123"]) {
    assert.throws(() => assertProjectId(id), /invalid_project_id/, id);
  }
  assert.equal(assertProjectId(ID), ID);
});

test("EASYGAS_DATA_DIR overrides the data root", () => {
  assert.equal(dataRoot(), resolve("tmp-test-data"));
});
