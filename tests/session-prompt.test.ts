import { strict as assert } from "node:assert";
import { test } from "node:test";
import { planSession, toldAfterFailure } from "../lib/engines/session-prompt.ts";

// A resumed Claude Code session keeps the system prompt it started with, so the app must decide per
// turn whether to resume, start fresh, or resume and send the changed settings in the message.
const NOW = { core: "c2", prefs: "p2" };

test("first turn of a project starts a fresh session", () => {
  assert.deepEqual(planSession(null, null, NOW), { resumeId: null, sendNotice: false });
});

test("nothing changed: resume silently", () => {
  assert.deepEqual(planSession("s1", { core: "c2", prefs: "p2" }, NOW), { resumeId: "s1", sendNotice: false });
});

test("the user changed their style mid-project: resume and send the new settings", () => {
  assert.deepEqual(planSession("s1", { core: "c2", prefs: "p1" }, NOW), { resumeId: "s1", sendNotice: true });
});

test("the rulebook or the app changed: start a fresh session (it gets everything current)", () => {
  assert.deepEqual(planSession("s1", { core: "c1", prefs: "p2" }, NOW), { resumeId: null, sendNotice: false });
  assert.deepEqual(planSession("s1", { core: "c1", prefs: "p1" }, NOW), { resumeId: null, sendNotice: false });
});

test("a stored session with no record of what it was told is not trusted", () => {
  for (const told of [null, undefined]) {
    assert.deepEqual(planSession("s1", told, NOW), { resumeId: null, sendNotice: false });
  }
});

test("after a successful turn the record equals the current prompt, so the next turn resumes silently", () => {
  assert.deepEqual(planSession("s2", NOW, NOW), { resumeId: "s2", sendNotice: false });
});

test("a FRESH session that failed still got the current system prompt", () => {
  const plan = planSession(null, null, NOW);
  assert.deepEqual(toldAfterFailure(plan, null, NOW), NOW);
});

test("a RESUMED session that failed is not assumed to have read the notice — it is sent again", () => {
  const told = { core: "c2", prefs: "p1" };
  const plan = planSession("s1", told, NOW);
  const recorded = toldAfterFailure(plan, told, NOW);
  assert.deepEqual(recorded, told);
  assert.deepEqual(planSession("s1", recorded, NOW), { resumeId: "s1", sendNotice: true });
});
