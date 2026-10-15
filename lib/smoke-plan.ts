/**
 * The pure half of the function smoke test (lib/smoke-test.ts runs it): what the AI's plan may contain, how the
 * failures read to the repair turn, the one-line summary. No imports beyond types, so tests run it as is.
 */
import type { FunctionProbeResult } from "./gas-verify.ts";

export interface SmokeCall {
  fn: string;
  args: unknown[];
  why: string;
}

export interface SmokeOutcome {
  call: SmokeCall;
  result: FunctionProbeResult;
}

export const SMOKE_MAX_CALLS = 6;
const IDENT = /^[A-Za-z][A-Za-z0-9]*$/;
/** names that change or send things — never called by a test, whatever the AI says */
const UNSAFE = /delete|remove|clear|reset|wipe|drop|purge|send|mail|notify|line|push|trigger|install|setup|create|insert|append|write|update|save|set[A-Z]|login|unlock|pin|password|pay|order/i;
const RESERVED = /^(doGet|doPost|onOpen|onEdit|onInstall|include|__egs)/;

/** The AI's answer as calls: identifiers only, nothing reserved or unsafe, JSON args, at most SMOKE_MAX_CALLS. */
export function parseSmokePlan(text: string): SmokeCall[] {
  const m = text.match(/\{[\s\S]*\}/);
  if (!m) return [];
  let parsed: unknown;
  try {
    parsed = JSON.parse(m[0]);
  } catch {
    return [];
  }
  const raw = (parsed as { calls?: unknown })?.calls;
  if (!Array.isArray(raw)) return [];
  const out: SmokeCall[] = [];
  const seen = new Set<string>();
  for (const c of raw) {
    if (!c || typeof c !== "object") continue;
    const { fn, args, why } = c as { fn?: unknown; args?: unknown; why?: unknown };
    if (typeof fn !== "string" || !IDENT.test(fn) || RESERVED.test(fn) || UNSAFE.test(fn) || seen.has(fn)) continue;
    const a = Array.isArray(args) ? args : args === undefined ? [] : [args];
    let ok = true;
    try {
      ok = JSON.stringify(a).length <= 2000;
    } catch {
      ok = false;
    }
    if (!ok) continue;
    seen.add(fn);
    out.push({ fn, args: a, why: typeof why === "string" ? why.slice(0, 120) : "" });
    if (out.length >= SMOKE_MAX_CALLS) break;
  }
  return out;
}

/** The failures as the repair turn reads them: function, arguments, error, the logs before it. */
export function smokeFailureText(outcomes: SmokeOutcome[]): string {
  return outcomes
    .filter((o) => !o.result.ok && !o.result.unsupported)
    .map((o) => {
      const logs = o.result.logs.length ? `\n  log ก่อนพัง: ${o.result.logs.slice(-6).join(" · ").slice(0, 300)}` : "";
      return `- เรียก ${o.call.fn}(${JSON.stringify(o.call.args).slice(1, -1)}) → ${o.result.error}${logs}`;
    })
    .join("\n");
}

/** One line for the chat: how many ran, how many failed. */
export function smokeSummary(outcomes: SmokeOutcome[]): string {
  if (!outcomes.length) return "";
  if (outcomes[0].result.unsupported) return "ลองเรียกฟังก์ชันไม่ได้: แอปนี้เผยแพร่ด้วยโค้ดที่ยังไม่มีตัวรันทดสอบ (ให้ AI แก้อะไรสักอย่างแล้วเผยแพร่ใหม่ จะได้ติดมาด้วย)";
  const failed = outcomes.filter((o) => !o.result.ok).length;
  const names = outcomes.map((o) => `${o.call.fn}${o.result.ok ? " ✓" : " ✗"}`).join(" · ");
  return failed ? `ลองเรียก ${outcomes.length} ฟังก์ชัน พัง ${failed}: ${names}` : `ลองเรียก ${outcomes.length} ฟังก์ชัน ผ่านทั้งหมด: ${names}`;
}
