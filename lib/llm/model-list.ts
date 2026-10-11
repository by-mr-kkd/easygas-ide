import { join } from "node:path";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { readJson, writeJsonAtomic } from "@/lib/local/json-store";
import { dataRoot } from "@/lib/local/paths";
import { chatModelIds, MAX_LISTED_MODELS, recommendModel } from "@/lib/llm/model-pick";
import type { LlmProvider, ProviderConfig } from "@/lib/llm/catalog";

/**
 * The models each provider offers the user's own key, asked from the provider and remembered for a day
 * in <data>/model-lists.json (server-only). The picker shows this list; the request path uses it to
 * swap a built-in default the key can no longer use (lib/llm/model-pick.ts pickModel).
 */

/** a day: model line-ups change in weeks, and every look costs the user a request */
const FRESH_MS = 24 * 60 * 60 * 1000;
/** asking on the request path must not hold a chat turn up for long */
const ASK_TIMEOUT_MS = 6000;

type Cache = Partial<Record<LlmProvider, { at: number; models: string[]; keyTail: string }>>;

const cachePath = () => join(dataRoot(), "model-lists.json");
/** a different key can see different models: the cache is only valid for the key it was made with */
const keyTail = (key: string) => key.slice(-6);

async function readCache(): Promise<Cache> {
  return readJson<Cache>(cachePath(), {}).catch(() => ({}));
}

async function askProvider(cfg: ProviderConfig & { apiKey: string }): Promise<string[]> {
  const ids: string[] = [];
  if (cfg.family === "anthropic") {
    for await (const m of new Anthropic({ apiKey: cfg.apiKey, timeout: ASK_TIMEOUT_MS, maxRetries: 0 }).models.list()) {
      ids.push(m.id);
      if (ids.length >= MAX_LISTED_MODELS) break;
    }
  } else {
    for await (const m of new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL, timeout: ASK_TIMEOUT_MS, maxRetries: 0 }).models.list()) {
      ids.push(m.id);
      if (ids.length >= MAX_LISTED_MODELS * 3) break;
    }
  }
  return chatModelIds(ids);
}

/**
 * The chat models this key can use. Fresh from the provider when the remembered list is older than a day
 * (or `force`); when asking fails, the last list (even an old one) or null. Never throws unless `force`
 * (the picker's button wants the reason).
 */
export async function listedModels(cfg: ProviderConfig, opts: { force?: boolean } = {}): Promise<string[] | null> {
  if (!cfg.apiKey) return null;
  const cache = await readCache();
  const hit = cache[cfg.provider];
  const sameKey = hit?.keyTail === keyTail(cfg.apiKey);
  if (!opts.force && hit && sameKey && Date.now() - hit.at < FRESH_MS) return hit.models;
  try {
    const models = await askProvider({ ...cfg, apiKey: cfg.apiKey });
    if (models.length > 0) {
      const next: Cache = { ...(await readCache()), [cfg.provider]: { at: Date.now(), models, keyTail: keyTail(cfg.apiKey) } };
      await writeJsonAtomic(cachePath(), next).catch(() => {});
    }
    return models;
  } catch (e) {
    console.error(`[models] ${cfg.provider} list failed:`, (e as Error).message);
    if (opts.force) throw e;
    return hit && sameKey ? hit.models : null;
  }
}

/** The remembered list only (no network): for rendering pages. */
export async function cachedModels(p: LlmProvider): Promise<string[] | null> {
  return (await readCache())[p]?.models ?? null;
}

export { recommendModel };
