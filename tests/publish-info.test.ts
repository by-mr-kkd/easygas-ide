import { strict as assert } from "node:assert";
import { test } from "node:test";
import { publishInfoFrom } from "../lib/publish-info.ts";
import { ImportError, parseScriptId } from "../lib/script-id.ts";

const head = { deploymentConfig: {}, entryPoints: [{ entryPointType: "WEB_APP", webApp: { url: "https://x/dev" } }] };
const web = (v: number, url: string) => ({ deploymentConfig: { versionNumber: v }, entryPoints: [{ entryPointType: "WEB_APP", webApp: { url } }] });
const api = (v: number) => ({ deploymentConfig: { versionNumber: v }, entryPoints: [{ entryPointType: "EXECUTION_API" }] });

test("publishInfoFrom: only the editor's test deployment = not published", () => {
  assert.deepEqual(publishInfoFrom([]), { kind: "none", version: null, url: null });
  assert.deepEqual(publishInfoFrom([head]), { kind: "none", version: null, url: null });
});

test("publishInfoFrom: a web app wins over other kinds; its newest version and /exec url", () => {
  assert.deepEqual(publishInfoFrom([head, web(2, "https://a/exec"), web(5, "https://b/exec"), api(7)]), {
    kind: "webapp",
    version: 5,
    url: "https://b/exec",
  });
  assert.deepEqual(publishInfoFrom([head, api(3)]), { kind: "other", version: 3, url: null });
});

test("parseScriptId: an id that starts with '-' is never accepted (it would read as a clasp option)", () => {
  assert.throws(() => parseScriptId("--rootDir-aaaaaaaaaaaaaaaaaaaaaaaaaaaa"), (e: unknown) => e instanceof ImportError);
});
