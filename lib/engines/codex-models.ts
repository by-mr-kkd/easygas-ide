/**
 * The models Codex can be told to use, read from `codex debug models` (the CLI's own catalog, as JSON).
 * Only the ones the catalog marks for listing, in its own order. Pure (tests/codex-models.test.ts).
 */

export interface CodexModel {
  id: string;
  label: string;
}

interface CatalogEntry {
  slug?: unknown;
  display_name?: unknown;
  visibility?: unknown;
  priority?: unknown;
}

export function parseCodexModels(out: string): CodexModel[] {
  const start = out.indexOf("{");
  if (start < 0) return [];
  let data: unknown;
  try {
    data = JSON.parse(out.slice(start, out.lastIndexOf("}") + 1));
  } catch {
    return [];
  }
  const list = (data as { models?: unknown })?.models;
  if (!Array.isArray(list)) return [];
  return (list as CatalogEntry[])
    .filter((m) => typeof m.slug === "string" && m.slug.trim() && (m.visibility === undefined || m.visibility === "list"))
    .sort((a, b) => (typeof a.priority === "number" ? a.priority : 1e9) - (typeof b.priority === "number" ? b.priority : 1e9))
    .map((m) => ({ id: (m.slug as string).trim(), label: typeof m.display_name === "string" && m.display_name.trim() ? m.display_name.trim() : (m.slug as string).trim() }));
}
