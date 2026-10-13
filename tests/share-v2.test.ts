import { strict as assert } from "node:assert";
import { test } from "node:test";
import { changedPaths, changeSummary, classifyFiles, diffStats, mergeMessage, unifiedDiff, updatePlan } from "../lib/share/merge.ts";
import { hideInstallButtons, hideInstallInHtml, INSTALL_HIDE_STYLE } from "../lib/share/install-hide.ts";
import { composeIssue, issueProblem, reviewProblem } from "../lib/share/report.ts";
import { parseSharePublic } from "../lib/share/payload.ts";
import { parseShareSummaries } from "../lib/share/summary.ts";
import { behindSource, changedIssues, parseIssues, parseProposals, parseReviews, parseShareExtras, parseUpdates, parseVersionFiles } from "../lib/share/v2.ts";

const f = (path: string, content: string) => ({ path, content });

test("classifyFiles: one side changed → that side; both → both; same text → same", () => {
  const base = [f("a.gs", "1"), f("b.gs", "1"), f("c.gs", "1"), f("d.gs", "1"), f("gone.gs", "x"), f("e.gs", "1")];
  const latest = [f("a.gs", "2"), f("b.gs", "1"), f("c.gs", "2"), f("d.gs", "2"), f("new.gs", "n"), f("e.gs", "1")];
  const mine = [f("a.gs", "1"), f("b.gs", "3"), f("c.gs", "3"), f("d.gs", "2"), f("gone.gs", "x"), f("e.gs", "1\r\n".trim()), f(".clasp.json", "{}")];
  const by = Object.fromEntries(classifyFiles(base, latest, mine).map((p) => [p.path, p.cls]));
  assert.deepEqual(by, { "a.gs": "take", "b.gs": "mine", "c.gs": "both", "d.gs": "same", "e.gs": "same", "gone.gs": "take", "new.gs": "take" });
  assert.ok(!(".clasp.json" in by), "the app's own files never take part");
});

test("classifyFiles: line endings do not count as a change", () => {
  const by = classifyFiles([f("a.gs", "x\ny")], [f("a.gs", "x\r\ny")], [f("a.gs", "x\ny")]);
  assert.equal(by[0].cls, "same");
});

test("updatePlan: takes are written or deleted, both go to the AI, mine stay", () => {
  const plans = classifyFiles(
    [f("a.gs", "1"), f("old.gs", "o"), f("c.gs", "1"), f("m.gs", "1")],
    [f("a.gs", "2"), f("c.gs", "2"), f("m.gs", "1"), f("n.gs", "new")],
    [f("a.gs", "1"), f("old.gs", "o"), f("c.gs", "3"), f("m.gs", "mine")],
  );
  const p = updatePlan(plans);
  assert.deepEqual(p.writes, [f("a.gs", "2"), f("n.gs", "new")]);
  assert.deepEqual(p.deletes, ["old.gs"]);
  assert.deepEqual(p.conflicts.map((c) => c.path), ["c.gs"]);
  assert.deepEqual(p.kept, ["m.gs"]);
});

test("unifiedDiff / diffStats: hunks with context, counts", () => {
  const a = ["l1", "l2", "l3", "l4", "l5", "l6", "l7", "l8", "l9", "l10"].join("\n");
  const b = ["l1", "l2", "l3", "L4", "l5", "l6", "l7", "l8", "l9", "l10", "l11"].join("\n");
  const d = unifiedDiff(a, b, 1);
  assert.match(d, /^@@ -3,3 \+3,3 @@\n l3\n-l4\n\+L4\n l5/);
  assert.match(d, /\n@@ -10,1 \+10,2 @@\n l10\n\+l11$/);
  assert.deepEqual(diffStats(a, b), { added: 2, removed: 1 });
  assert.equal(unifiedDiff("same", "same"), "");
  assert.deepEqual(diffStats(null, "a\nb"), { added: 2, removed: 0 });
});

test("changeSummary / changedPaths: what a fork changed against its base", () => {
  const base = [f("Code.gs", "a\nb"), f("Old.gs", "x"), f("appsscript.json", "{}")];
  const mine = [f("Code.gs", "a\nB\nc"), f("New.gs", "y"), f("appsscript.json", "{}")];
  assert.equal(changeSummary(base, mine), ["แก้ Code.gs (+2 −1)", "เพิ่ม New.gs", "ลบ Old.gs"].join("\n"));
  assert.deepEqual(changedPaths(base, mine), ["Code.gs", "New.gs", "Old.gs"]);
});

test("mergeMessage: one message with both diffs per file, the source's version span", () => {
  const plans = classifyFiles([f("c.gs", "a\nb")], [f("c.gs", "a\nB")], [f("c.gs", "a\nb\nmine")]);
  const msg = mergeMessage({ kind: "update", title: "ระบบจอง", from: 2, to: 4, conflicts: updatePlan(plans).conflicts });
  assert.match(msg, /^รับอัปเดตจากต้นฉบับ "ระบบจอง" \(v2 → v4\)/);
  assert.match(msg, /### c\.gs/);
  assert.match(msg, /-b\n\+B/);
  assert.match(msg, /\+mine/);
  const deleted = classifyFiles([f("c.gs", "a")], [], [f("c.gs", "b")]);
  assert.match(mergeMessage({ kind: "proposal", title: "x", from: null, to: 3, conflicts: updatePlan(deleted).conflicts }), /ทางแยกลบไฟล์นี้/);
});

test("hideInstallButtons: only html with the attribute, after <head>, once", () => {
  const page = '<!DOCTYPE html><html><head><base target="_top"></head><body><button data-egs-install>ติดตั้ง</button></body></html>';
  const out = hideInstallInHtml(page);
  assert.ok(out.startsWith(`<!DOCTYPE html><html><head>${INSTALL_HIDE_STYLE}<base`));
  assert.equal(hideInstallInHtml(out), out, "idempotent");
  assert.equal(hideInstallInHtml("<div data-egs-installed></div>"), "<div data-egs-installed></div>");
  assert.ok(hideInstallInHtml("<div data-egs-install></div>").startsWith(INSTALL_HIDE_STYLE), "a partial gets it first");
  const files = [f("Code.gs", "// data-egs-install"), f("Index.html", page), f("Other.html", "<p>hi</p>")];
  const pushed = hideInstallButtons(files);
  assert.equal(pushed[0], files[0]);
  assert.notEqual(pushed[1].content, page);
  assert.equal(pushed[2], files[2]);
  assert.equal(files[1].content, page, "the project's own files are untouched");
});

test("composeIssue / issueProblem: what is sent, credentials refused", () => {
  const p = composeIssue({ title: "  บันทึกไม่ได้ ", what: "กดบันทึกแล้วขึ้น error", steps: "1. เปิดฟอร์ม", error: "TypeError: x" }, 3, ["Code.gs"]);
  assert.equal(p.title, "บันทึกไม่ได้");
  assert.equal(p.body, "เกิดอะไรขึ้น:\nกดบันทึกแล้วขึ้น error\n\nทำอะไรก่อนเจอ:\n1. เปิดฟอร์ม");
  assert.deepEqual(p.details, { changedFiles: ["Code.gs"], errors: "TypeError: x" });
  assert.equal(p.version, 3);
  assert.equal(issueProblem(p), null);
  assert.match(issueProblem({ ...p, title: "x" }) ?? "", /หัวข้อ/);
  const leak = composeIssue({ title: "พัง", what: "token ของฉัน", steps: "", error: "key=AIza" + "A".repeat(35) }, 1, []);
  assert.match(issueProblem(leak) ?? "", /Google API key/);
  assert.equal(reviewProblem(5, "ดีมาก"), null);
  assert.ok(reviewProblem(0, "x"));
});

test("parseShareExtras: an older website gives neutral values; a new one is read field by field", () => {
  const old = parseShareExtras({ slug: "abcdef12", hosting: "github" });
  assert.equal(old.v2, false);
  assert.equal(old.proOnly, true, "an older website: every GitHub share is Pro-only");
  assert.deepEqual(old.support, { mode: "self", note: "" });
  assert.equal(old.me, null);
  const v2 = parseShareExtras({
    hosting: "github",
    camera: false,
    proOnly: false,
    support: { mode: "best_effort", note: "ตอบใน 3 วัน" },
    rating: { avg: 4.26, count: 7 },
    followers: 3,
    issues: { open: 2, fixed: 5 },
    versions: [{ version: 2, notes: "แก้บัค", fixes: [1, "x", 3], createdAt: "2026-10-01" }, { version: 3, notes: "", fixes: [] }],
    parent: { slug: "parent01", version: 2, title: "ต้นฉบับ" },
    changes: "- เพิ่มหน้า",
    me: { cloned: 2, published: true, following: true, review: { stars: 9, body: "ok", version: 2 }, owner: false },
  });
  assert.equal(v2.v2, true);
  assert.equal(v2.proOnly, false);
  assert.equal(v2.support.mode, "best_effort");
  assert.deepEqual(v2.rating, { avg: 4.3, count: 7 });
  assert.deepEqual(v2.versions.map((v) => v.version), [3, 2]);
  assert.deepEqual(v2.versions[1].fixes, [1, 3]);
  assert.deepEqual(v2.parentInfo, { slug: "parent01", version: 2, title: "ต้นฉบับ" });
  assert.equal(v2.me?.review?.stars, 5);
});

test("parseSharePublic: parent slug + parentShare object; extras attached", () => {
  const share = {
    slug: "abcdef12",
    title: "t",
    files: [{ name: "appsscript.json", source: "{}" }, { name: "Code.gs", source: "x" }],
    parent: "parent01",
    parentShare: { slug: "parent01", version: 1, title: "p" },
    forks: [{ slug: "fork0001", title: "f", author: "a", cloneCount: 1, changes: "เพิ่มปุ่ม" }],
  };
  const p = parseSharePublic({ share });
  assert.equal(p.parent, "parent01");
  assert.equal(p.forks[0].changes, "เพิ่มปุ่ม");
  assert.equal(p.extra.parentInfo?.version, 1);
  assert.equal(parseSharePublic({ share: { ...share, parent: "parent02" } }).parent, "parent02");
});

test("parseShareSummaries: proOnly from the website when it says so", () => {
  const [a, b] = parseShareSummaries({ shares: [{ slug: "abcdef12", hosting: "github", proOnly: false }, { slug: "abcdef13", hosting: "github" }] });
  assert.equal(a.proOnly, false);
  assert.equal(b.proOnly, true);
});

test("parsers: updates, versions, reviews, issues, proposals survive junk", () => {
  const u = parseUpdates({
    updates: [{ slug: "abcdef12", title: "t", latest: 4, versions: [{ version: 3, notes: "a", fixes: [{ number: 2, title: "บัค" }, { number: "x" }] }, { version: 4 }] }, { slug: "BAD" }],
    myIssues: [{ slug: "abcdef12", number: 2, title: "บัค", status: "fixed", fixedIn: 3 }, { slug: "abcdef12" }],
  });
  assert.equal(u.updates.length, 1);
  assert.deepEqual(u.updates[0].versions.map((v) => v.version), [4, 3]);
  assert.deepEqual(u.updates[0].versions[1].fixes, [{ number: 2, title: "บัค" }]);
  assert.equal(u.myIssues.length, 1);
  assert.deepEqual(parseUpdates(null), { updates: [], myIssues: [] });
  assert.equal(parseVersionFiles({ version: 2, files: [] }), null);
  assert.equal(parseVersionFiles({ version: 2, files: [{ name: "a.gs", source: "x" }] })?.files.length, 1);
  assert.equal(parseReviews({ reviews: [{ stars: 4, verifiedUse: true }] }).reviews[0].verifiedUse, true);
  assert.equal(parseIssues({ issues: [{ number: 1, status: "weird", details: { changedFiles: ["a", 1] } }] })[0].status, "open");
  assert.deepEqual(parseIssues({ issues: [{ number: 1, details: { changedFiles: ["a", 1] } }] })[0].details.changedFiles, ["a"]);
  assert.equal(parseProposals({ proposals: [{ id: "0f8e7d6c-1111", forkSlug: "fork0001", status: "merged" }, { id: "x", forkSlug: "fork0001" }] }).length, 1);
});

test("behindSource / changedIssues: home screen notices", () => {
  const behind = behindSource(
    [
      { id: "p1", slug: "abcdef12", version: 2 },
      { id: "p2", slug: "abcdef12", version: 4 },
      { id: "p3", slug: "zzzzzz99", version: 1 },
    ],
    [{ slug: "abcdef12", title: "", latest: 4, versions: [] }],
  );
  assert.deepEqual(behind, { p1: 4 });
  const issues = [
    { slug: "abcdef12", number: 1, title: "", status: "fixed" as const, fixedIn: 3, ownerNote: "", updatedAt: "" },
    { slug: "abcdef12", number: 2, title: "", status: "open" as const, fixedIn: null, ownerNote: "", updatedAt: "" },
    { slug: "abcdef12", number: 3, title: "", status: "looking" as const, fixedIn: null, ownerNote: "", updatedAt: "" },
  ];
  assert.deepEqual(
    changedIssues(issues, { "abcdef12#1": "fixed", "abcdef12#3": "open" }).map((i) => i.number),
    [3],
  );
  assert.deepEqual(changedIssues(issues, {}).map((i) => i.number), [1, 3]);
});
