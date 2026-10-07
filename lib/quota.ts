/**
 * The quota left on a monthly-plan AI, as the status bar shows it. Codex answers through its own
 * app-server (`account/rateLimits/read`); Claude Code has no such command, so, only when the user
 * switched that on in Settings, the app asks Anthropic the way Claude Code itself does and reads
 * the `anthropic-ratelimit-unified-*` headers. The parsing lives here, pure (tests/quota.test.ts).
 */

export type QuotaEngine = "codex-cli" | "claude-cli";

export interface QuotaWindow {
  /** "5 ชม." / "รายสัปดาห์" / "รายวัน" */
  label: string;
  /** 0–100 */
  usedPercent: number;
  /** epoch seconds, null when unknown */
  resetsAt: number | null;
}

export interface QuotaInfo {
  engine: QuotaEngine;
  /** "max", "pro", "prolite" … as the provider names it; null when it did not say */
  plan: string | null;
  /** shortest window first */
  windows: QuotaWindow[];
  /** epoch ms when this was read */
  fetchedAt: number;
}

const MIN_PER_DAY = 1440;
const MIN_PER_WEEK = 10080;

/** A window's length as a person says it. */
export function windowLabel(minutes: number | null): string {
  if (minutes === null || !Number.isFinite(minutes) || minutes <= 0) return "โควตา";
  if (minutes % MIN_PER_WEEK === 0) return minutes === MIN_PER_WEEK ? "รายสัปดาห์" : `${minutes / MIN_PER_WEEK} สัปดาห์`;
  if (minutes % MIN_PER_DAY === 0) return minutes === MIN_PER_DAY ? "รายวัน" : `${minutes / MIN_PER_DAY} วัน`;
  if (minutes % 60 === 0) return `${minutes / 60} ชม.`;
  return `${minutes} นาที`;
}

const clampPercent = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  return Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : null;
};

const epochSeconds = (v: unknown): number | null => {
  const n = typeof v === "number" ? v : typeof v === "string" ? Number(v) : NaN;
  if (!Number.isFinite(n) || n <= 0) return null;
  // milliseconds slipped in: anything past the year 5000 in seconds
  return n > 1e11 ? Math.round(n / 1000) : Math.round(n);
};

/** The result of Codex's `account/rateLimits/read` → windows across every limit bucket it reports. */
export function parseCodexRateLimits(result: unknown, fetchedAt = Date.now()): QuotaInfo {
  const r = (result && typeof result === "object" ? result : {}) as Record<string, unknown>;
  const byId = r.rateLimitsByLimitId;
  const buckets: unknown[] =
    byId && typeof byId === "object" && Object.keys(byId as object).length > 0
      ? Object.values(byId as Record<string, unknown>)
      : r.rateLimits
        ? [r.rateLimits]
        : [];
  const windows: QuotaWindow[] = [];
  let plan: string | null = null;
  for (const b of buckets) {
    if (!b || typeof b !== "object") continue;
    const bucket = b as Record<string, unknown>;
    if (!plan && typeof bucket.planType === "string" && bucket.planType.trim()) plan = bucket.planType.trim();
    const name = typeof bucket.limitName === "string" && bucket.limitName.trim() ? bucket.limitName.trim() : "";
    for (const role of ["primary", "secondary"]) {
      const w = bucket[role];
      if (!w || typeof w !== "object") continue;
      const win = w as Record<string, unknown>;
      const used = clampPercent(win.usedPercent);
      if (used === null) continue;
      const mins = typeof win.windowDurationMins === "number" ? win.windowDurationMins : null;
      const label = name && buckets.length > 1 ? `${name} ${windowLabel(mins)}` : windowLabel(mins);
      windows.push({ label, usedPercent: used, resetsAt: epochSeconds(win.resetsAt), ...(mins !== null ? { minutes: mins } : {}) } as QuotaWindow & { minutes?: number });
    }
  }
  return { engine: "codex-cli", plan, windows: sortWindows(windows), fetchedAt };
}

/**
 * Anthropic's `anthropic-ratelimit-unified-{5h,7d}-{utilization,reset}` headers → the two windows.
 * Utilization is 0–1 (or 0–100); reset is epoch seconds, an ISO date, or seconds from now.
 */
export function parseClaudeRateLimitHeaders(headers: Record<string, string | undefined>, now = Date.now()): QuotaInfo | null {
  const get = (k: string) => headers[k] ?? headers[k.toLowerCase()];
  const windows: QuotaWindow[] = [];
  for (const [key, label, minutes] of [
    ["5h", "5 ชม.", 300],
    ["7d", "รายสัปดาห์", MIN_PER_WEEK],
  ] as const) {
    const raw = get(`anthropic-ratelimit-unified-${key}-utilization`);
    if (raw === undefined) continue;
    const n = Number(raw);
    if (!Number.isFinite(n)) continue;
    const used = clampPercent(n >= 0 && n <= 1 ? n * 100 : n);
    if (used === null) continue;
    windows.push({ label, usedPercent: used, resetsAt: parseReset(get(`anthropic-ratelimit-unified-${key}-reset`), now), minutes } as QuotaWindow);
  }
  if (windows.length === 0) return null;
  return { engine: "claude-cli", plan: null, windows: sortWindows(windows), fetchedAt: now };
}

function parseReset(raw: string | undefined, now: number): number | null {
  if (!raw) return null;
  const n = Number(raw);
  if (Number.isFinite(n)) {
    if (n > 1e9) return epochSeconds(n); // an epoch
    return Math.round(now / 1000 + n); // seconds from now
  }
  const t = Date.parse(raw);
  return Number.isFinite(t) ? Math.round(t / 1000) : null;
}

function sortWindows(windows: QuotaWindow[]): QuotaWindow[] {
  const mins = (w: QuotaWindow) => (w as QuotaWindow & { minutes?: number }).minutes ?? Number.MAX_SAFE_INTEGER;
  return [...windows].sort((a, b) => mins(a) - mins(b)).map(({ label, usedPercent, resetsAt }) => ({ label, usedPercent, resetsAt }));
}

const TH_DAYS = ["อา.", "จ.", "อ.", "พ.", "พฤ.", "ศ.", "ส."];

/** "รีเซ็ต 14:05", "รีเซ็ตพรุ่งนี้ 09:00", "รีเซ็ต อ. 12 ต.ค." — in the given time zone (Bangkok by default). */
export function formatReset(resetsAt: number | null, now = Date.now(), timeZone = "Asia/Bangkok"): string {
  if (resetsAt === null) return "";
  const at = new Date(resetsAt * 1000);
  const time = at.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit", timeZone });
  const day = (d: Date) => d.toLocaleDateString("en-CA", { timeZone }); // yyyy-mm-dd in that zone
  const today = day(new Date(now));
  const tomorrow = day(new Date(now + 86_400_000));
  const d = day(at);
  if (d === today) return `รีเซ็ต ${time}`;
  if (d === tomorrow) return `รีเซ็ตพรุ่งนี้ ${time}`;
  const weekday = TH_DAYS[new Date(at.toLocaleString("en-US", { timeZone })).getDay()];
  const date = at.toLocaleDateString("th-TH", { day: "numeric", month: "short", timeZone });
  return `รีเซ็ต ${weekday} ${date}`;
}

/** The one line the status bar shows: "5 ชม. เหลือ 62% · รายสัปดาห์ เหลือ 80%". */
export function quotaSummary(info: QuotaInfo): string {
  return info.windows.map((w) => `${w.label} เหลือ ${100 - w.usedPercent}%`).join(" · ");
}

/** Which window is nearest to running out: drives the status-bar colour. */
export function quotaLevel(info: QuotaInfo): "ok" | "warn" | "danger" {
  const worst = Math.max(0, ...info.windows.map((w) => w.usedPercent));
  return worst >= 95 ? "danger" : worst >= 80 ? "warn" : "ok";
}
