import type { SourceFile } from "./dispatcher.ts";
import { assertExecUrl, runShimScriptTag } from "./run-shim.ts";

/**
 * The front page as static files for a host outside GAS (GitHub Pages): the project's HTML composed
 * the way the preview does it (Index.html + inlined include() partials), with `google.script.run`
 * replaced by calls to the deployed web app (`execUrl`).
 *
 * Mirrors components/ide/PreviewPane.tsx (entry page lookup, INCLUDE_RE, nesting depth). Keep the two
 * in step: the preview is what the user saw, this is what gets published.
 */

export const STATIC_INDEX_PATH = "index.html";
export const NOJEKYLL_PATH = ".nojekyll";
const MAX_INCLUDE_DEPTH = 5;

/** Any GAS scriptlet: `<? … ?>`, `<?= … ?>`, `<?!= … ?>`. */
const SCRIPTLET_RE = /<\?[\s\S]*?\?>/g;
// `<?!= include('Stylesheet'); ?>` (GAS allows a trailing ;) and the raw HtmlService forms of the same idiom.
const INCLUDE_RES = [
  /^<\?!?=?\s*include\(\s*['"]([^'"]+)['"]\s*\)\s*;?\s*\?>$/,
  /^<\?!?=?\s*HtmlService\.create(?:HtmlOutput|Template)FromFile\(\s*['"]([^'"]+)['"]\s*\)(?:\.evaluate\(\))?\.getContent\(\)\s*;?\s*\?>$/,
];

export interface ScriptletIssue {
  file: string;
  scriptlet: string;
  reason: "scriptlet" | "missing-include" | "include-too-deep";
}

/** The page needs GAS to render (data scriptlets, unresolved includes) so it cannot be static. */
export class StaticPageScriptletError extends Error {
  readonly code = "STATIC_PAGE_SCRIPTLET";
  readonly issues: ScriptletIssue[];
  constructor(issues: ScriptletIssue[]) {
    const first = issues[0];
    super(
      `หน้าเว็บมีโค้ดที่ต้องให้ Google Apps Script ประมวลผลก่อนแสดง จึงทำเป็นหน้าเว็บภายนอกไม่ได้ ` +
        `(${first.file}: ${first.scriptlet.slice(0, 80)}${issues.length > 1 ? ` และอีก ${issues.length - 1} จุด` : ""})`,
    );
    this.name = "StaticPageScriptletError";
    this.issues = issues;
  }
}

export class NoEntryPageError extends Error {
  readonly code = "NO_ENTRY_PAGE";
  constructor() {
    super("ไม่พบ Index.html (หน้าหลัก) ในโปรเจกต์");
    this.name = "NoEntryPageError";
  }
}

/** Same lookup as the preview: a file whose name without `.html` matches, case-insensitive. */
export function findHtmlFile(files: SourceFile[], baseName: string): SourceFile | undefined {
  const lower = baseName.toLowerCase();
  return files.find((f) => f.path.replace(/\.html$/i, "").toLowerCase() === lower);
}

export function findEntryPage(files: SourceFile[]): SourceFile | undefined {
  return files.find((f) => f.path === "Index.html") ?? findHtmlFile(files, "index");
}

function includeTarget(scriptlet: string): string | null {
  for (const re of INCLUDE_RES) {
    const m = re.exec(scriptlet);
    if (m) return m[1];
  }
  return null;
}

/**
 * Inline include()d partials recursively, collecting everything GAS would have to evaluate instead.
 * Per file (rather than one pass over the whole text, as the preview does) so each issue names its file.
 */
function compose(file: SourceFile, files: SourceFile[], issues: ScriptletIssue[], depth: number): string {
  return file.content.replace(SCRIPTLET_RE, (scriptlet) => {
    const target = includeTarget(scriptlet);
    if (target === null) {
      issues.push({ file: file.path, scriptlet, reason: "scriptlet" });
      return "";
    }
    const partial = findHtmlFile(files, target);
    if (!partial) {
      issues.push({ file: file.path, scriptlet, reason: "missing-include" });
      return "";
    }
    if (depth >= MAX_INCLUDE_DEPTH) {
      issues.push({ file: file.path, scriptlet, reason: "include-too-deep" });
      return "";
    }
    return compose(partial, files, issues, depth + 1);
  });
}

/** The composed entry page (includes inlined), or a StaticPageScriptletError listing what GAS would have to run. */
export function composeEntryPage(files: SourceFile[]): string {
  const entry = findEntryPage(files);
  if (!entry) throw new NoEntryPageError();
  const issues: ScriptletIssue[] = [];
  const html = compose(entry, files, issues, 0);
  if (issues.length) throw new StaticPageScriptletError(issues);
  return html;
}

/** `.setTitle('…')` from doGet: GAS sets the tab title there, the static page needs it in <title>. */
function titleFromServerCode(files: SourceFile[]): string | null {
  for (const f of files) {
    if (!/\.(gs|js)$/i.test(f.path)) continue;
    const m = /\.setTitle\(\s*(['"])((?:(?!\1)[^\\]|\\.)*)\1\s*\)/.exec(f.content);
    if (m) return m[2];
  }
  return null;
}

function escapeHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

/**
 * Put the shim (plus the head tags GAS used to supply) before any other script: right after `<head>`
 * when the head opens before the first script, otherwise at the top of the document (after the doctype).
 */
function injectHead(html: string, head: string): string {
  const firstScript = html.search(/<script\b/i);
  const headOpen = /<head(?:\s[^>]*)?>/i.exec(html);
  if (headOpen && (firstScript < 0 || headOpen.index < firstScript)) {
    const at = headOpen.index + headOpen[0].length;
    return html.slice(0, at) + "\n" + head + html.slice(at);
  }
  const doctype = /^\s*<!doctype[^>]*>/i.exec(html);
  const at = doctype ? doctype[0].length : 0;
  return html.slice(0, at) + "\n" + head + html.slice(at);
}

export function buildStaticPage(files: SourceFile[], opts: { execUrl: string; shim: string }): SourceFile[] {
  assertExecUrl(opts.execUrl);
  let html = composeEntryPage(files);

  // GAS added the doctype, the viewport (addMetaTag) and the title (setTitle) itself; the static page
  // has to carry them. Only what the page does not already declare is added.
  const extras: string[] = [];
  if (!/<meta\s[^>]*charset/i.test(html)) extras.push('<meta charset="utf-8">');
  if (!/<meta\s[^>]*name\s*=\s*["']?viewport/i.test(html)) {
    extras.push('<meta name="viewport" content="width=device-width, initial-scale=1">');
  }
  const title = titleFromServerCode(files);
  if (title && !/<title[\s>]/i.test(html)) extras.push(`<title>${escapeHtml(title)}</title>`);

  if (!/^\s*<!doctype/i.test(html)) html = "<!DOCTYPE html>\n" + html;
  html = injectHead(html, extras.concat(runShimScriptTag(opts.execUrl, opts.shim)).join("\n"));

  return [
    { path: STATIC_INDEX_PATH, content: html },
    { path: NOJEKYLL_PATH, content: "" },
  ];
}
