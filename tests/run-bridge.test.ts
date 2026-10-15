import { test } from "node:test";
import assert from "node:assert/strict";
import { BRIDGE_MARK, bridgeFiles, bridgeHtml, holdScripts, WAIT_TYPE } from "../lib/run-bridge.ts";
import { RUN_ORIGIN } from "../lib/run-link.ts";

test("classic scripts are held for the shim, in place, attributes kept", () => {
  const html = `<html><head><script src="https://cdn.x/a.js" defer></script><script type="text/javascript">a()</script></head><body><script>b()</script></body></html>`;
  const out = holdScripts(html);
  assert.equal(out, `<html><head><script type="${WAIT_TYPE}" src="https://cdn.x/a.js" defer></script><script type="${WAIT_TYPE}">a()</script></head><body><script type="${WAIT_TYPE}">b()</script></body></html>`);
});

test("non-script types, templates and babel are left alone; modules keep their type on data-egs-type", () => {
  const json = `<script type="application/json" id="d">{"a":1}</script>`;
  const tpl = `<script type="text/x-template">hi</script>`;
  const babel = `<script type="text/babel">x</script>`;
  assert.equal(holdScripts(json + tpl + babel), json + tpl + babel);
  assert.equal(holdScripts(`<script type="module">import a from "./a.js"</script>`), `<script type="${WAIT_TYPE}" data-egs-type="module">import a from "./a.js"</script>`);
});

test("the shim goes right after <head>, talks only to the run origin, and is applied once", () => {
  const html = `<!doctype html><html><head><meta charset="utf-8"><script>init()</script></head><body></body></html>`;
  const out = bridgeHtml(html);
  assert.ok(out.startsWith(`<!doctype html><html><head><script ${BRIDGE_MARK}>`));
  assert.ok(out.includes(JSON.stringify(RUN_ORIGIN)));
  assert.ok(out.includes(`<script type="${WAIT_TYPE}">init()</script>`));
  assert.equal(out.split(BRIDGE_MARK).length - 1, 1);
  assert.equal(bridgeHtml(out), out);
});

test("a partial without <head> gets the shim first; only html files of the push set change", () => {
  const partial = `<script>function x(){}</script>`;
  const out = bridgeHtml(partial);
  assert.ok(out.startsWith(`<script ${BRIDGE_MARK}>`));
  assert.ok(out.endsWith(`<script type="${WAIT_TYPE}">function x(){}</script>`));
  const files = bridgeFiles([{ path: "Code.gs", content: "<script>no</script>" }, { path: "Index.html", content: partial }]);
  assert.equal(files[0].content, "<script>no</script>");
  assert.ok(files[1].content.includes(BRIDGE_MARK));
});

test("the shim's own script tag is never held", () => {
  const out = bridgeHtml(`<head></head>`);
  assert.ok(!out.includes(`type="${WAIT_TYPE}" ${BRIDGE_MARK}`));
  assert.equal(holdScripts(out), out);
});

test("a bridged file drops the source file's stored hash, so the publisher sees the push set change", () => {
  const src = { path: "Index.html", content: "<head></head>", content_hash: "stale-hash-of-the-unbridged-file" };
  const out = bridgeFiles([src]);
  assert.equal(out[0].content_hash, undefined);
  assert.notEqual(out[0].content, src.content);
  // a file the bridge leaves alone keeps its hash (nothing to recompute)
  assert.equal(bridgeFiles([{ path: "Code.gs", content: "x", content_hash: "h" }])[0].content_hash, "h");
});
