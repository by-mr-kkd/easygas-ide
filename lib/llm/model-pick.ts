/**
 * Which of a provider's models to offer and which to recommend — from the list the user's own key returns
 * (lib/llm/model-list.ts), not from names built into the app. Built-in names go stale: Google stopped serving
 * gemini-2.5-* to new keys in 2026 and every new key got a bare 404. Pure, so it is unit-tested.
 */

/** Same shape the catalog uses; kept as a plain string union here so this file has no app imports. */
export type PickProvider = "claude" | "chatgpt" | "deepseek" | "deepseek-pro" | "gemini" | "zai" | "muse";

/** Ids that are plainly not chat models (speech, images, embeddings, …) — never offered. */
const NOT_A_CHAT_MODEL = /embed|whisper|tts|audio|transcri|moderation|dall-e|image|realtime|rerank|sam-|speech|video|live|banana|lyria|omni|veo|imagen|aqa|search|computer-use|robotics|antigravity|deep-research|translate/i;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/;
export const MAX_LISTED_MODELS = 200;

/** "models/gemini-x" → "gemini-x", chat models only, no duplicates, newest-looking first. */
export function chatModelIds(ids: string[]): string[] {
  const clean = [...new Set(ids.map((id) => id.replace(/^models\//, "").trim()))].filter((id) => MODEL_ID.test(id) && !NOT_A_CHAT_MODEL.test(id));
  return clean.sort((a, b) => b.localeCompare(a, "en", { numeric: true })).slice(0, MAX_LISTED_MODELS);
}

/**
 * The family to recommend, best first: the first pattern with any match wins and its highest version is
 * the pick. Stable names only — no -preview / -exp / dated snapshots — so the pick does not churn daily.
 * The version is the captured group: "3.8" → [3, 8], "4-6" → [4, 6].
 */
const FAMILIES: Record<PickProvider, RegExp[]> = {
  gemini: [/^gemini-(\d+(?:\.\d+)?)-flash$/, /^gemini-(\d+(?:\.\d+)?)-pro$/, /^gemini-(\d+(?:\.\d+)?)-flash-lite$/],
  claude: [/^claude-sonnet-(\d{1,2}(?:-\d{1,2})?)$/, /^claude-opus-(\d{1,2}(?:-\d{1,2})?)$/],
  chatgpt: [/^gpt-(\d+(?:\.\d+)?)$/, /^gpt-(\d+(?:\.\d+)?)o$/],
  deepseek: [/^deepseek-v(\d+(?:\.\d+)?)-flash$/, /^deepseek-(chat)$/],
  "deepseek-pro": [/^deepseek-v(\d+(?:\.\d+)?)-pro$/, /^deepseek-(reasoner)$/],
  zai: [/^glm-(\d+(?:\.\d+)?)$/],
  muse: [/^muse-spark-(\d+(?:\.\d+)?)$/],
};

function versionOf(raw: string): number[] {
  return raw.split(/[.-]/).map((n) => (/^\d+$/.test(n) ? Number(n) : 0));
}

function newer(a: number[], b: number[]): number {
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    const d = (a[i] ?? 0) - (b[i] ?? 0);
    if (d !== 0) return d;
  }
  return 0;
}

/**
 * The picker's order: the recommendation, then the provider's own families (newest first, in family order),
 * then everything else the key can use (other vendors' open models such as gemma, previews, oddities).
 */
export function orderModels(provider: PickProvider, ids: string[]): string[] {
  const rec = recommendModel(provider, ids);
  const families = FAMILIES[provider] ?? [];
  const rank = (id: string) => {
    const i = families.findIndex((re) => re.test(id));
    return i < 0 ? families.length : i;
  };
  const rest = ids.filter((id) => id !== rec);
  const sorted = rest
    .map((id, at) => ({ id, at, r: rank(id) }))
    .sort((a, b) => a.r - b.r || a.at - b.at) // stable inside a group: chatModelIds already put newest first
    .map((x) => x.id);
  return rec ? [rec, ...sorted] : sorted;
}

/** The model to recommend from what the key can use, or null when no known family is in the list. */
export function recommendModel(provider: PickProvider, ids: string[]): string | null {
  for (const re of FAMILIES[provider] ?? []) {
    let best: { id: string; v: number[] } | null = null;
    for (const id of ids) {
      const m = re.exec(id);
      if (!m) continue;
      const v = versionOf(m[1]);
      if (!best || newer(v, best.v) > 0) best = { id, v };
    }
    if (best) return best.id;
  }
  return null;
}

/**
 * The model to actually call. `wanted` is what the user picked (picker or Settings) — always honoured;
 * a 404 then explains itself in the chat. `builtIn` is the app's own default: kept while the key can use
 * it, otherwise replaced by the recommendation. Without a list (offline, provider error) nothing changes.
 */
export function pickModel(provider: PickProvider, opts: { wanted?: string | null; builtIn: string; listed: string[] | null }): { model: string; replaced?: string } {
  if (opts.wanted) return { model: opts.wanted };
  if (!opts.listed || opts.listed.length === 0 || opts.listed.includes(opts.builtIn)) return { model: opts.builtIn };
  const rec = recommendModel(provider, opts.listed);
  return rec ? { model: rec, replaced: opts.builtIn } : { model: opts.builtIn };
}
