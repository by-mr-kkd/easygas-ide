import { strict as assert } from "node:assert";
import { test } from "node:test";
import { allowedUses, hostingOfUse, isProjectUse, kindChangeMessage, kindLockReason, kindOfUse, useOf } from "../lib/project-use.ts";

test("useOf: the kind wins over hosting; GitHub only for a standalone script", () => {
  assert.equal(useOf("webapp", null), "google");
  assert.equal(useOf("webapp", "gas"), "google");
  assert.equal(useOf("webapp", "github"), "github");
  assert.equal(useOf("bound", "github"), "sheet");
  assert.equal(useOf(undefined, undefined), "google");
});

test("use → kind + hosting round trip", () => {
  for (const u of ["google", "sheet", "github"] as const) assert.equal(useOf(kindOfUse(u), hostingOfUse(u)), u);
  assert.equal(isProjectUse("sheet"), true);
  assert.equal(isProjectUse("webapp"), false);
});

test("kindLockReason: free until Google holds the script, fixed for imported and cloned code", () => {
  assert.equal(kindLockReason({}), null);
  assert.equal(kindLockReason({ origin: "created" }), null);
  assert.match(kindLockReason({ script_id: "abc" }) ?? "", /เผยแพร่ไปแล้ว/);
  assert.match(kindLockReason({ bound_sheet_id: "s" }) ?? "", /เผยแพร่ไปแล้ว/);
  assert.match(kindLockReason({ origin: "imported" }) ?? "", /Google/);
  assert.match(kindLockReason({ origin: "cloned" }) ?? "", /ลิงก์แชร์/);
});

test("allowedUses: a locked standalone may still switch its front page; a locked sheet project may not", () => {
  assert.deepEqual(allowedUses("google", null), ["google", "sheet", "github"]);
  assert.deepEqual(allowedUses("google", "x"), ["google", "github"]);
  assert.deepEqual(allowedUses("github", "x"), ["google", "github"]);
  assert.deepEqual(allowedUses("sheet", "x"), ["sheet"]);
});

test("kindChangeMessage names the right sheet access", () => {
  assert.match(kindChangeMessage("bound"), /getActiveSpreadsheet\(\)/);
  assert.match(kindChangeMessage("webapp"), /null/);
});
