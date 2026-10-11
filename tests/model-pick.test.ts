import { test } from "node:test";
import assert from "node:assert/strict";
import { chatModelIds, orderModels, pickModel, recommendModel } from "../lib/llm/model-pick.ts";

// shaped like Gemini's OpenAI-compatible /models answer in October 2026
const GEMINI = [
  "models/gemini-2.5-flash",
  "models/gemini-2.5-pro",
  "models/gemini-3.5-flash-lite",
  "models/gemini-3.6-flash",
  "models/gemini-3.8-flash",
  "models/gemini-3.8-flash-tts",
  "models/gemini-3.8-live",
  "models/gemini-3.9-flash-preview",
  "models/gemini-embedding-2",
  "models/gemini-3.1-flash-image",
  "models/gemini-nano-banana-2.1",
];

test("chatModelIds drops the models/ prefix, non-chat models and duplicates, newest first", () => {
  const ids = chatModelIds([...GEMINI, "gemini-3.8-flash"]);
  assert.deepEqual(ids, ["gemini-3.9-flash-preview", "gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.5-flash-lite", "gemini-2.5-pro", "gemini-2.5-flash"]);
});

test("recommendModel picks the newest stable flash, never a preview", () => {
  assert.equal(recommendModel("gemini", chatModelIds(GEMINI)), "gemini-3.8-flash");
});

test("recommendModel compares versions as numbers (3.10 is newer than 3.9)", () => {
  assert.equal(recommendModel("gemini", ["gemini-3.9-flash", "gemini-3.10-flash"]), "gemini-3.10-flash");
  assert.equal(recommendModel("zai", ["glm-5.2", "glm-5.10", "glm-4.6"]), "glm-5.10");
});

test("recommendModel falls through the families in order", () => {
  assert.equal(recommendModel("gemini", ["gemini-3.1-pro", "gemini-3.5-flash-lite"]), "gemini-3.1-pro");
  assert.equal(recommendModel("claude", ["claude-opus-5-5", "claude-sonnet-4-6", "claude-sonnet-5-5", "claude-sonnet-4-5-20250929"]), "claude-sonnet-5-5");
  assert.equal(recommendModel("chatgpt", ["gpt-4o", "gpt-5.1", "gpt-5.5", "gpt-5.5-mini"]), "gpt-5.5");
  assert.equal(recommendModel("deepseek", ["deepseek-v4-flash", "deepseek-v4-pro"]), "deepseek-v4-flash");
  assert.equal(recommendModel("deepseek-pro", ["deepseek-v4-flash", "deepseek-v4-pro"]), "deepseek-v4-pro");
  assert.equal(recommendModel("muse", ["muse-spark-1.3", "muse-spark-1.4"]), "muse-spark-1.4");
});

test("recommendModel returns null when no known family is listed", () => {
  assert.equal(recommendModel("gemini", ["learnlm-2.0"]), null);
  assert.equal(recommendModel("zai", []), null);
});

test("pickModel always honours the user's own pick", () => {
  assert.deepEqual(pickModel("gemini", { wanted: "gemini-2.5-flash", builtIn: "gemini-3.8-flash", listed: ["gemini-3.8-flash"] }), { model: "gemini-2.5-flash" });
});

test("pickModel keeps the built-in default while the key can use it, or when there is no list", () => {
  assert.deepEqual(pickModel("gemini", { builtIn: "gemini-3.8-flash", listed: ["gemini-3.9-flash", "gemini-3.8-flash"] }), { model: "gemini-3.8-flash" });
  assert.deepEqual(pickModel("gemini", { builtIn: "gemini-3.8-flash", listed: null }), { model: "gemini-3.8-flash" });
  assert.deepEqual(pickModel("gemini", { builtIn: "gemini-3.8-flash", listed: [] }), { model: "gemini-3.8-flash" });
});

test("pickModel replaces a built-in default the key no longer has", () => {
  assert.deepEqual(pickModel("gemini", { builtIn: "gemini-2.5-flash", listed: ["gemini-3.8-flash", "gemini-3.5-flash-lite"] }), {
    model: "gemini-3.8-flash",
    replaced: "gemini-2.5-flash",
  });
  // nothing recognisable to switch to: keep it (the chat then explains the 404)
  assert.deepEqual(pickModel("gemini", { builtIn: "gemini-2.5-flash", listed: ["learnlm-2.0"] }), { model: "gemini-2.5-flash" });
});

test("orderModels puts the recommendation, then the provider's families, then the rest", () => {
  const ids = chatModelIds(["models/gemma-4-31b-it", "models/gemini-3.8-flash", "models/gemini-3.5-flash-lite", "models/gemini-3.1-pro", "models/gemini-3.6-flash", "models/antigravity-preview-latest"]);
  assert.deepEqual(orderModels("gemini", ids), ["gemini-3.8-flash", "gemini-3.6-flash", "gemini-3.1-pro", "gemini-3.5-flash-lite", "gemma-4-31b-it"]);
});
