import { strict as assert } from "node:assert";
import { test } from "node:test";
import { buildWebAppManifest, enforceWebAppManifest } from "../lib/manifest.ts";

const parse = (s: string) => JSON.parse(s) as Record<string, any>;

test("a missing manifest gets the standard web-app manifest", () => {
  assert.equal(enforceWebAppManifest(null), buildWebAppManifest());
  const m = parse(enforceWebAppManifest(null));
  assert.equal(m.timeZone, "Asia/Bangkok");
  assert.equal(m.runtimeVersion, "V8");
  assert.deepEqual(m.webapp, { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" });
});

test("forces public access + run-as-owner over whatever the AI wrote", () => {
  const ai = JSON.stringify({
    timeZone: "Asia/Bangkok",
    runtimeVersion: "DEPRECATED_ES5",
    webapp: { access: "MYSELF", executeAs: "USER_ACCESSING" },
    oauthScopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
  const m = parse(enforceWebAppManifest(ai));
  assert.equal(m.runtimeVersion, "V8");
  assert.deepEqual(m.webapp, { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" });
  assert.deepEqual(m.oauthScopes, ["https://www.googleapis.com/auth/spreadsheets"], "keeps the AI's scopes");
});

test("restores the webapp block clasp's default manifest lacks (the /exec 404 from the spike)", () => {
  const claspDefault = JSON.stringify({ timeZone: "America/New_York", dependencies: {}, exceptionLogging: "STACKDRIVER", runtimeVersion: "V8" });
  const m = parse(enforceWebAppManifest(claspDefault));
  assert.deepEqual(m.webapp, { access: "ANYONE_ANONYMOUS", executeAs: "USER_DEPLOYING" });
});

test("leaves a malformed manifest untouched for lint to report", () => {
  assert.equal(enforceWebAppManifest("{ not json"), "{ not json");
});
