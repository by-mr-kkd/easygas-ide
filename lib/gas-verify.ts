/**
 * Gate 2 (run-and-repair) — Channel 1: server-side HTTP probe of a deployed GAS web app's /exec URL.
 * The real deploy publishes /exec as ANYONE_ANONYMOUS + executeAs USER_DEPLOYING (lib/deploy.ts), so
 * our server CAN fetch it (unlike /dev, which needs the owner's browser session). We classify the
 * response: a GAS runtime failure renders an HTML error page (often HTTP 200), so we match content
 * signatures rather than trusting the status code. Heuristic by design — it answers "did it blow up
 * when actually run?", which the static lint + rulebook critic structurally cannot.
 */

// Shared with the rulebook self-diagnostics rule (gas-codegen): doGet returns the raw error as
// "EGS_ERROR: <stack>" when this param is present, so the probe gets the exact message + line.
const DIAG_PARAM = "__egsdiag";
const DIAG_TOKEN = "egsverify";
// doGet's diag path returns "EGS_ERROR: <stack>\nEGS_LOGS: <json array>" (gas-codegen self-diag):
// the exact error PLUS the captured Logger.log trace that led up to it.
const SELF_ERROR = /EGS_ERROR:\s*([\s\S]*?)(?:\nEGS_LOGS:|$)/;
const SELF_LOGS = /EGS_LOGS:\s*(\[[\s\S]*\])/;

// Strong signatures that mean a GAS-level failure (avoid generic "error" to limit false positives).
const FAIL_SIGNATURES: { re: RegExp; label: string }[] = [
  { re: /Script function not found:?\s*\w*/i, label: "หาฟังก์ชันเริ่มต้นไม่เจอ (เช่น doGet)" },
  { re: /(TypeError|ReferenceError|SyntaxError|RangeError):[^<\n]{0,200}/i, label: "" },
  { re: /Exception:[^<\n]{0,200}/i, label: "" },
  { re: /We['’]re sorry, a server error occurred[^<\n]{0,160}/i, label: "เกิดข้อผิดพลาดฝั่งสคริปต์" },
];

// NOT a code bug → don't try to repair; the owner just needs to authorize/publish the app once.
const NEEDS_AUTH = /Authorization is required to perform that action/i;
const LOGIN_WALL = /accounts\.google\.com\/(v3\/signin|ServiceLogin|signin)|Sign in[^<]{0,20}Google/i;

function stripToSnippet(html: string, match: string): string {
  // pull a window around the match, strip tags + collapse whitespace, cap length
  const idx = html.indexOf(match);
  const slice = idx >= 0 ? html.slice(idx, idx + 240) : match;
  return slice
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 200);
}

export interface ProbeResult {
  ok: boolean;
  error?: string; // human-readable error when ok=false
  /** true = the owner just needs to authorize/publish the app once — NOT a code bug, don't repair. */
  authRequired?: boolean;
  /** true = infra failure (timeout / network / 4xx like a deleted deployment) — NOT a code bug, so
   *  verify must NOT feed it to the repair loop (cold GAS apps regularly exceed the probe timeout). */
  infraError?: boolean;
}

/** Fetch the live /exec and decide pass/fail. Never throws — network issues return ok:false. */
export async function probeExec(execUrl: string): Promise<ProbeResult> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15_000); // cold GAS apps regularly exceed 12s on first hit
  try {
    // ask the app to self-report its error (rulebook self-diagnostics) → exact message + line
    const url = execUrl + (execUrl.includes("?") ? "&" : "?") + `${DIAG_PARAM}=${DIAG_TOKEN}`;
    const res = await fetch(url, { redirect: "follow", signal: ctrl.signal });
    const finalUrl = res.url || execUrl;
    const text = await res.text();

    // needs-auth cases first — these are NOT code bugs (don't repair, ask the owner to authorize)
    if (NEEDS_AUTH.test(text))
      return { ok: false, authRequired: true, error: "แอปยังไม่ได้รับอนุญาตให้รัน — เจ้าของต้องเปิดแล้วกด Allow ครั้งแรก" };
    if (LOGIN_WALL.test(finalUrl) || LOGIN_WALL.test(text))
      return { ok: false, authRequired: true, error: "แอปยังเปิดให้รันสาธารณะไม่ได้ (อาจยังไม่ได้เผยแพร่ หรือสิทธิ์เข้าถึงไม่ใช่ ANYONE_ANONYMOUS)" };

    // self-reported error from doGet's catch (the precise one) wins; the captured Logger.log trace
    // (EGS_LOGS) rides along so the auto-repair sees WHAT the app did before it crashed.
    if (/EGS_ERROR:/.test(text)) {
      const err = (text.match(SELF_ERROR)?.[1] ?? "").replace(/\s+/g, " ").trim().slice(0, 400);
      let logs = "";
      const lm = text.match(SELF_LOGS);
      if (lm) {
        try {
          const arr = JSON.parse(lm[1]) as unknown[];
          if (Array.isArray(arr) && arr.length)
            logs = " | log: " + arr.slice(-6).map(String).join(" · ").slice(0, 220);
        } catch {
          /* logs not valid json — ignore */
        }
      }
      return { ok: false, error: (err + logs).slice(0, 560) || "แอปรายงานข้อผิดพลาดตอนรัน" };
    }

    // P1-7: any 4xx/5xx that isn't the auth wall (handled above) is an INFRA problem, not a code bug —
    // don't feed it to the repair loop. 404 = the deployment/URL is gone (was silently "ผ่าน" before).
    if (res.status >= 400)
      return {
        ok: false,
        infraError: true,
        error: `เปิดแอปไม่สำเร็จ (HTTP ${res.status}) — อาจถูกลบ deployment / URL ผิด / ยังไม่พร้อม`,
      };
    for (const { re, label } of FAIL_SIGNATURES) {
      const m = text.match(re);
      if (m) {
        const detail = stripToSnippet(text, m[0]);
        return { ok: false, error: label ? `${label}${detail && detail !== m[0] ? ` — ${detail}` : ""}` : detail || m[0] };
      }
    }
    // P1-7 positive-signal check: a real render is non-trivial HTML. A blank/near-empty 200 means doGet
    // returned nothing meaningful — don't call that "ผ่าน".
    const body = text.trim();
    if (body.length < 40 && !/<\w/.test(body))
      return { ok: false, error: "แอปเปิดแล้วได้หน้าว่าง — doGet อาจไม่ได้คืนหน้าเว็บ" };
    // Rendered without a detectable GAS-level error (doGet PATH ONLY — buttons/data are not tested).
    return { ok: true };
  } catch (e) {
    const aborted = e instanceof Error && e.name === "AbortError";
    // P1-8: timeout / network = infra, NOT a code bug (cold GAS apps regularly exceed the timeout on
    // first hit) — flag it so verify retries instead of "repairing" perfectly healthy code.
    return {
      ok: false,
      infraError: true,
      error: aborted ? "เปิดแอปไม่ตอบใน 15 วินาที (อาจค้าง/ช้า/เพิ่งเย็นเครื่อง)" : "เปิดแอปไม่ได้ (เชื่อมต่อล้มเหลว)",
    };
  } finally {
    clearTimeout(timer);
  }
}
