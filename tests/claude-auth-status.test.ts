import { strict as assert } from "node:assert";
import { test } from "node:test";
import { parseClaudeAuthStatus } from "../lib/engines/claude-auth-status.ts";

test("parseClaudeAuthStatus: signed in = email and plan, nothing else from the JSON", () => {
  const out = JSON.stringify({ loggedIn: true, authMethod: "claude.ai", email: "a@b.com", orgId: "x", subscriptionType: "max" });
  assert.deepEqual(parseClaudeAuthStatus(out), { loggedIn: true, account: "a@b.com · max" });
  assert.deepEqual(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, email: "a@b.com" })), { loggedIn: true, account: "a@b.com" });
  // an API-key login has no email: say how instead
  assert.deepEqual(parseClaudeAuthStatus(JSON.stringify({ loggedIn: true, authMethod: "apiKey" })), { loggedIn: true, account: "apiKey" });
});

test("parseClaudeAuthStatus: logged out, even with noise around the JSON", () => {
  assert.deepEqual(parseClaudeAuthStatus('warning: something\n{ "loggedIn": false, "authMethod": null }\n'), { loggedIn: false, account: null });
});

test("parseClaudeAuthStatus: an old CLI (no auth command) or no output = unknown, not logged out", () => {
  assert.deepEqual(parseClaudeAuthStatus(""), { loggedIn: null, account: null });
  assert.deepEqual(parseClaudeAuthStatus("error: unknown command 'auth'"), { loggedIn: null, account: null });
  assert.deepEqual(parseClaudeAuthStatus("{ not json"), { loggedIn: null, account: null });
  assert.deepEqual(parseClaudeAuthStatus('{"email":"a@b.com"}'), { loggedIn: null, account: null });
});
