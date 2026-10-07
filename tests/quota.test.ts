import { strict as assert } from "node:assert";
import { test } from "node:test";
import { formatReset, parseClaudeRateLimitHeaders, parseCodexRateLimits, quotaLevel, quotaSummary, windowLabel } from "../lib/quota.ts";

test("windowLabel: minutes as a person says them", () => {
  assert.equal(windowLabel(300), "5 ชม.");
  assert.equal(windowLabel(1440), "รายวัน");
  assert.equal(windowLabel(10080), "รายสัปดาห์");
  assert.equal(windowLabel(20160), "2 สัปดาห์");
  assert.equal(windowLabel(90), "90 นาที");
  assert.equal(windowLabel(null), "โควตา");
});

test("parseCodexRateLimits: one bucket with a weekly window (a Plus/Lite plan)", () => {
  const result = {
    rateLimits: { limitId: "codex", limitName: null, primary: { usedPercent: 2, windowDurationMins: 10080, resetsAt: 1791957218 }, secondary: null, planType: "prolite" },
    rateLimitsByLimitId: {
      codex: { limitId: "codex", limitName: null, primary: { usedPercent: 2, windowDurationMins: 10080, resetsAt: 1791957218 }, secondary: null, planType: "prolite" },
    },
  };
  const info = parseCodexRateLimits(result, 5);
  assert.equal(info.engine, "codex-cli");
  assert.equal(info.plan, "prolite");
  assert.deepEqual(info.windows, [{ label: "รายสัปดาห์", usedPercent: 2, resetsAt: 1791957218 }]);
  assert.equal(info.fetchedAt, 5);
});

test("parseCodexRateLimits: two windows come shortest first; two buckets are named; junk is empty", () => {
  const info = parseCodexRateLimits({
    rateLimitsByLimitId: {
      codex: { limitName: "Codex", primary: { usedPercent: 40, windowDurationMins: 10080, resetsAt: 2000 }, secondary: { usedPercent: 70, windowDurationMins: 300, resetsAt: 1000 }, planType: "pro" },
      spark: { limitName: "Spark", primary: { usedPercent: "12.6", windowDurationMins: 1440, resetsAt: "1500" } },
    },
  });
  assert.deepEqual(
    info.windows.map((w) => [w.label, w.usedPercent, w.resetsAt]),
    [
      ["Codex 5 ชม.", 70, 1000],
      ["Spark รายวัน", 13, 1500],
      ["Codex รายสัปดาห์", 40, 2000],
    ],
  );
  assert.deepEqual(parseCodexRateLimits(null).windows, []);
  assert.deepEqual(parseCodexRateLimits({ rateLimits: { primary: { usedPercent: "x" } } }).windows, []);
});

test("parseClaudeRateLimitHeaders: fraction or percent utilisation; epoch, ISO or relative reset", () => {
  const now = 1_700_000_000_000;
  const info = parseClaudeRateLimitHeaders(
    {
      "anthropic-ratelimit-unified-5h-utilization": "0.37",
      "anthropic-ratelimit-unified-5h-reset": "1700003600",
      "anthropic-ratelimit-unified-7d-utilization": "61",
      "anthropic-ratelimit-unified-7d-reset": "3600",
    },
    now,
  )!;
  assert.equal(info.engine, "claude-cli");
  assert.deepEqual(info.windows, [
    { label: "5 ชม.", usedPercent: 37, resetsAt: 1700003600 },
    { label: "รายสัปดาห์", usedPercent: 61, resetsAt: 1700000000 + 3600 },
  ]);
  const iso = parseClaudeRateLimitHeaders({ "anthropic-ratelimit-unified-7d-utilization": "1", "anthropic-ratelimit-unified-7d-reset": "2023-11-15T00:00:00Z" }, now)!;
  assert.deepEqual(iso.windows, [{ label: "รายสัปดาห์", usedPercent: 100, resetsAt: Date.parse("2023-11-15T00:00:00Z") / 1000 }]);
  assert.equal(parseClaudeRateLimitHeaders({ "content-type": "application/json" }), null);
});

test("formatReset: today = time only, tomorrow is said, later = weekday + date (Bangkok)", () => {
  const now = Date.parse("2026-10-08T03:00:00+07:00");
  assert.equal(formatReset(Date.parse("2026-10-08T14:05:00+07:00") / 1000, now), "รีเซ็ต 14:05");
  assert.equal(formatReset(Date.parse("2026-10-09T09:00:00+07:00") / 1000, now), "รีเซ็ตพรุ่งนี้ 09:00");
  assert.match(formatReset(Date.parse("2026-10-13T07:00:00+07:00") / 1000, now), /^รีเซ็ต อ\. 13 ต\.ค\./);
  assert.equal(formatReset(null, now), "");
});

test("quotaSummary / quotaLevel: what is left, and how worried to look", () => {
  const info = { engine: "codex-cli" as const, plan: null, fetchedAt: 0, windows: [{ label: "5 ชม.", usedPercent: 38, resetsAt: null }, { label: "รายสัปดาห์", usedPercent: 81, resetsAt: null }] };
  assert.equal(quotaSummary(info), "5 ชม. เหลือ 62% · รายสัปดาห์ เหลือ 19%");
  assert.equal(quotaLevel(info), "warn");
  assert.equal(quotaLevel({ ...info, windows: [{ label: "x", usedPercent: 96, resetsAt: null }] }), "danger");
  assert.equal(quotaLevel({ ...info, windows: [] }), "ok");
});
