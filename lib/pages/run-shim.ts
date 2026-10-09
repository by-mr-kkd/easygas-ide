/**
 * Browser-side replacement for `google.script.run` used by the page that is hosted outside GAS
 * (GitHub Pages): every server call becomes a POST of `{fn,args}` to the deployed web app, answered
 * by the dispatcher in `EgsRemote.gs`. The AI keeps writing ordinary google.script.run code.
 * The replacement's own source is Pro content from the licence server (see below).
 */

/** Only the plain /exec form (verified cross-origin). Domain-scoped `/a/...` URLs need a Google login. */
export const EXEC_URL_RE = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

export class InvalidExecUrlError extends Error {
  readonly code = "INVALID_EXEC_URL";
  readonly url: string;
  constructor(url: string) {
    super("ลิงก์เว็บแอปไม่ถูกต้อง ต้องเป็นลิงก์ที่ลงท้ายด้วย /exec จาก script.google.com");
    this.name = "InvalidExecUrlError";
    this.url = url;
  }
}

export function assertExecUrl(url: string): void {
  if (!EXEC_URL_RE.test(url)) throw new InvalidExecUrlError(url);
}

/**
 * The shim text itself is Pro content fetched from the licence server (lib/pages/runtime.ts,
 * lib/premium/content.ts) — it is not in this source. This module turns it into the inlined <script>.
 */
import { RUNTIME_URL_PLACEHOLDER } from "./runtime.ts";

/** JS-safe, HTML-safe string literal: no `<` (so no `</script>`), no line terminators, ASCII only. */
function jsStringLiteral(value: string): string {
  return JSON.stringify(value).replace(/[<>]|[^\x20-\x7e]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
}

/** The shim's JavaScript source for the given web app. Pure ASCII, so it is safe in any encoding. */
export function buildRunShim(execUrl: string, shim: string): string {
  assertExecUrl(execUrl);
  if (!shim.includes(RUNTIME_URL_PLACEHOLDER)) throw new Error("run shim source has no exec url placeholder");
  const src = shim.replace(RUNTIME_URL_PLACEHOLDER, jsStringLiteral(execUrl))
    .replace(/[^\x00-\x7f]/g, (c) => "\\u" + c.charCodeAt(0).toString(16).padStart(4, "0"));
  // A "<" in the source could only come from an edit above; a `</script>` or `<!--` would cut the page.
  if (/<\/|<!--/.test(src)) throw new Error("run shim source must not contain </ or <!--");
  return src;
}

/** `<script>` tag ready to inline before the page's own scripts. */
export function runShimScriptTag(execUrl: string, shim: string): string {
  return `<script data-egs-run-shim>\n${buildRunShim(execUrl, shim)}\n</script>`;
}
