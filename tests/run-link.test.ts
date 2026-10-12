import { strict as assert } from "node:assert";
import { test } from "node:test";
import { isPublicWebApp, RUN_ORIGIN, runUrlFor } from "../lib/run-link.ts";

const ID = "AKfycbxgQmlfhHGsiL4eJzGwX9Wmek4GuZ-2TdGWxmO8zPcwgbi2aFrol7REAXQiWkPbIid7";
const EXEC = `https://script.google.com/macros/s/${ID}/exec`;
const PUBLIC = JSON.stringify({ webapp: { executeAs: "USER_DEPLOYING", access: "ANYONE_ANONYMOUS" } });

test("a public app run as its owner gets the run.easygaside.tech link", () => {
  assert.equal(runUrlFor(EXEC, PUBLIC), `${RUN_ORIGIN}/${ID}`);
});

test("apps that need a Google sign-in keep /exec", () => {
  for (const webapp of [{ access: "ANYONE", executeAs: "USER_DEPLOYING" }, { access: "ANYONE_ANONYMOUS", executeAs: "USER_ACCESSING" }, { access: "MYSELF" }]) {
    assert.equal(runUrlFor(EXEC, JSON.stringify({ webapp })), null);
  }
  assert.equal(isPublicWebApp(null), false);
  assert.equal(isPublicWebApp("{not json"), false);
});

test("only the plain /exec form is wrapped", () => {
  assert.equal(runUrlFor(`https://script.google.com/a/macros/school.ac.th/s/${ID}/exec`, PUBLIC), null);
  assert.equal(runUrlFor(`https://script.google.com/macros/s/${ID}/dev`, PUBLIC), null);
  assert.equal(runUrlFor(`https://evil.example/macros/s/${ID}/exec`, PUBLIC), null);
  assert.equal(runUrlFor(null, PUBLIC), null);
});
