import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseCodexModels } from "../lib/engines/codex-models.ts";

test("parseCodexModels: listed models in catalog order; hidden ones left out", () => {
  const out = JSON.stringify({
    models: [
      { slug: "gpt-6-sol", display_name: "GPT-6-Sol", visibility: "list", priority: 3 },
      { slug: "gpt-reserve", display_name: "GPT-Reserve", visibility: "hide", priority: 4 },
      { slug: "gpt-6-astra", display_name: "GPT-6-Astra", visibility: "list", priority: 2 },
      { slug: "codex-auto-review", visibility: "hide", priority: 43 },
      { slug: "plain", visibility: "list" },
    ],
  });
  assert.deepEqual(parseCodexModels(out), [
    { id: "gpt-6-astra", label: "GPT-6-Astra" },
    { id: "gpt-6-sol", label: "GPT-6-Sol" },
    { id: "plain", label: "plain" },
  ]);
});

test("parseCodexModels: noise before the JSON is skipped; junk gives an empty list", () => {
  assert.deepEqual(parseCodexModels('warn: x\n{"models":[{"slug":"a","display_name":"A"}]}\n'), [{ id: "a", label: "A" }]);
  assert.deepEqual(parseCodexModels(""), []);
  assert.deepEqual(parseCodexModels("{ nope"), []);
  assert.deepEqual(parseCodexModels('{"models":"x"}'), []);
});
