/**
 * Inlines the partials an Apps Script HTML page pulls in server-side, so the simulated preview shows
 * the real stylesheet and script. Two spellings are common in the wild and both are handled:
 *
 *   <?!= include('Stylesheet'); ?>                                       the usual helper
 *   <?!= HtmlService.createHtmlOutputFromFile('Stylesheet').getContent(); ?>   inline, no helper
 *   <?!= HtmlService.createTemplateFromFile('Nav').evaluate().getContent(); ?>
 *
 * Anything else between `<? … ?>` is server-side templating that cannot run here and is dropped.
 * Pure (unit-tested in tests/preview-includes.test.ts).
 */

export type PreviewFiles = Record<string, { content: string }>;

const NAME = `\\(\\s*['"]([^'"]+)['"]\\s*\\)`;
// `<?!= include('X'); ?>` — GAS allows an optional trailing ; before ?>
const INCLUDE_RE = new RegExp(`<\\?!?=?\\s*include${NAME}\\s*;?\\s*\\?>`, "g");
const HTML_SERVICE_RE = new RegExp(
  `<\\?!?=?\\s*HtmlService\\s*\\.\\s*create(?:HtmlOutput|Template)FromFile${NAME}(?:\\s*\\.\\s*evaluate\\(\\s*\\))?\\s*\\.\\s*getContent\\(\\s*\\)\\s*;?\\s*\\?>`,
  "g",
);
const SCRIPTLET_RE = /<\?[\s\S]*?\?>/g;
const MAX_DEPTH = 5;

/** The file named `baseName` (with or without .html), or "" when the project has none. */
export function findContent(files: PreviewFiles, baseName: string): string {
  const lower = baseName.replace(/\.html$/i, "").toLowerCase();
  for (const [path, f] of Object.entries(files)) {
    if (path.replace(/\.html$/i, "").toLowerCase() === lower) return f.content;
  }
  return "";
}

/** Inline the partials, following partials that include partials a few levels deep. */
export function resolveIncludes(html: string, files: PreviewFiles, depth = 0): string {
  if (depth > MAX_DEPTH) return html;
  let changed = false;
  const inline = (_m: string, name: string) => {
    changed = true;
    return findContent(files, String(name));
  };
  const out = html.replace(INCLUDE_RE, inline).replace(HTML_SERVICE_RE, inline);
  return changed ? resolveIncludes(out, files, depth + 1) : out;
}

/** The page with its partials inlined and every other scriptlet removed; null without an Index.html. */
export function assemblePreview(files: PreviewFiles): string | null {
  const index = files["Index.html"]?.content ?? findContent(files, "index");
  if (!index) return null;
  return resolveIncludes(index, files).replace(SCRIPTLET_RE, "");
}
