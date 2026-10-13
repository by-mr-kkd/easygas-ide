/**
 * Publishing on Google's own page (hosting "gas"), pure: the "install as an app" buttons (`data-egs-install`,
 * lib/pages/pwa-install.ts) only work on GitHub Pages, so the PUSHED copy of every html file that has one gets a
 * style that hides them. The project's own files are never rewritten — this runs on the push set only.
 */

export const INSTALL_HIDE_MARK = "data-egs-hide-install";
export const INSTALL_HIDE_STYLE = `<style ${INSTALL_HIDE_MARK}>[data-egs-install]{display:none!important}</style>`;

const HAS_INSTALL = /data-egs-install(?![-\w])/;

export function hideInstallInHtml(html: string): string {
  if (!HAS_INSTALL.test(html) || html.includes(INSTALL_HIDE_MARK)) return html;
  const head = /<head\b[^>]*>/i.exec(html);
  if (head) return html.slice(0, head.index + head[0].length) + INSTALL_HIDE_STYLE + html.slice(head.index + head[0].length);
  // a partial (included with <?!= include() ?>) or a page without <head>: the style goes first
  return INSTALL_HIDE_STYLE + "\n" + html;
}

export function hideInstallButtons<T extends { path: string; content: string }>(files: T[]): T[] {
  return files.map((f) => (/\.html$/i.test(f.path) && HAS_INSTALL.test(f.content) ? { ...f, content: hideInstallInHtml(f.content) } : f));
}
