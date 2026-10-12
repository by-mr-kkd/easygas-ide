import { test } from "node:test";
import assert from "node:assert/strict";
import { licenseOf, licensesAllowed } from "../lib/share/license.ts";

// vendored from EasyGAS-Site lib/share-license.ts: the same rules on both sides
test("unknown or missing = the old fixed terms (egs)", () => {
  assert.equal(licenseOf(undefined), "egs");
  assert.equal(licenseOf("gpl"), "egs");
  assert.equal(licenseOf("personal"), "personal");
});

test("a fork may be as strict or stricter, never looser", () => {
  assert.deepEqual(licensesAllowed(null), ["egs", "mit", "personal"]);
  assert.deepEqual(licensesAllowed("egs").sort(), ["egs", "personal"]);
  assert.deepEqual(licensesAllowed("personal"), ["personal"]);
});

import { cleanDescription } from "../lib/share/describe-text.ts";
test("the AI's description: no fences, markdown or a lead-in, at most 600 characters", () => {
  assert.equal(cleanDescription("คำอธิบาย: **ระบบ**ลางาน\n```js\nx\n```"), "ระบบลางาน");
  assert.equal(cleanDescription("ก".repeat(900)).length, 600);
});
