// Vendored copy of EasyGAS-Site/lib/share-link.ts — keep the two in step.
/** Share links, pure (no server import): the website, the desktop app and the tests share these rules. */

export const SHARE_SLUG_RE = /^[a-z0-9]{6,16}$/;

export const isShareSlug = (s: string): boolean => SHARE_SLUG_RE.test(s);

/** The slug from anything a person may paste: the share page, the app's clone link, or the bare slug. */
export function parseShareLink(input: string): string | null {
  const s = input.trim();
  if (!s) return null;
  if (SHARE_SLUG_RE.test(s.toLowerCase())) return s.toLowerCase();
  const m = s.match(/(?:\/s\/|easygas:\/\/clone\/)([A-Za-z0-9]{6,16})(?:[/?#]|$)/);
  return m ? m[1].toLowerCase() : null;
}
