/** Pure helpers for the GitHub Pages publish (no app imports, so tests can load them directly). */

/** LINE's in-app browser blocks the camera; this parameter makes LINE open the link in the device browser. */
export const SHARE_PARAM = "openExternalBrowser=1";

const REPO_PREFIX = "easygas-";
const MAX_SLUG = 40;

/**
 * `easygas-<slug>` from the project name: ASCII letters/digits/hyphens, lower case. A name with nothing
 * usable (Thai, for one) falls back to the project id's first 8 characters. A repo stored on the project
 * from an earlier publish wins, so re-publishing never creates a second repo.
 */
export function repoNameFor(project: { id: string; name: string; pages?: { repo: string; url?: string; published_at?: string } | null }): string {
  if (project.pages?.repo) return project.pages.repo;
  const slug = project.name
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, MAX_SLUG)
    .replace(/-+$/g, "");
  const safe = slug.length >= 2 ? slug : project.id.replace(/[^a-z0-9]/gi, "").slice(0, 8).toLowerCase() || "app";
  return `${REPO_PREFIX}${safe}`;
}

export const pagesUrlFor = (login: string, repo: string): string => `https://${login.toLowerCase()}.github.io/${repo}/`;
export const shareUrlFor = (url: string): string => `${url}${url.includes("?") ? "&" : "?"}${SHARE_PARAM}`;
