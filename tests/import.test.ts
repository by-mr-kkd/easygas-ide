import { strict as assert } from "node:assert";
import { test } from "node:test";
import { ImportError, parseScriptId } from "../lib/script-id.ts";

const ID = "1AbCdEfGhIjKlMnOpQrStUvWxYz0123456789-_abcdEFGHijklMNOP";

test("parseScriptId: a bare id, and the editor URLs Google uses", () => {
  assert.equal(parseScriptId(ID), ID);
  assert.equal(parseScriptId(`  ${ID}  `), ID);
  assert.equal(parseScriptId(`https://script.google.com/d/${ID}/edit`), ID);
  assert.equal(parseScriptId(`https://script.google.com/home/projects/${ID}/edit`), ID);
  assert.equal(parseScriptId(`https://script.google.com/u/1/home/projects/${ID}/settings`), ID);
});

test("parseScriptId: a web-app /exec link is a deployment, not the script", () => {
  for (const s of [`https://script.google.com/macros/s/AKfycbw3TyJTbnydFaSMzeQ1HGZOvDaFu0sGF87YYTvJwx8/exec`, "AKfycbw3TyJTbnydFaSMzeQ1HGZOvDaFu0sGF87YYTvJwx8"]) {
    assert.throws(() => parseScriptId(s), (e: unknown) => e instanceof ImportError && e.code === "DEPLOYMENT_URL");
  }
});

test("parseScriptId: junk is refused", () => {
  for (const s of ["", "abc", "https://docs.google.com/spreadsheets/d/x/edit", "../../etc/passwd", `${ID}/../x`]) {
    assert.throws(() => parseScriptId(s), (e: unknown) => e instanceof ImportError);
  }
});
