import { readJson, writeJsonAtomic } from "@/lib/local/json-store";
import { settingsPath } from "@/lib/local/paths";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/llm/catalog";
import { sanitizePrefs, type StylePrefs } from "@/lib/preferences";

/**
 * Local app settings (server-only), stored in <data root>/settings.json: the AI a NEW project starts
 * with (each project then remembers its own pick — lib/ai-options.ts), the user's own API keys, and
 * per-provider model / base-URL overrides.
 *
 * API keys are stored as plain text in the user's own profile folder for now. The desktop build
 * moves them to the OS keychain (Electron safeStorage).
 */

import { ENGINES, type EngineId } from "@/lib/ai-choice";

export { ENGINES, type EngineId };

/** Which API key a provider uses (deepseek + deepseek-pro share one). */
export type KeyId = "anthropic" | "openai" | "deepseek" | "gemini" | "zai" | "meta";
export const KEY_IDS: KeyId[] = ["anthropic", "openai", "deepseek", "gemini", "zai", "meta"];

export function keyIdFor(p: LlmProvider): KeyId {
  switch (p) {
    case "claude":
      return "anthropic";
    case "chatgpt":
      return "openai";
    case "deepseek":
    case "deepseek-pro":
      return "deepseek";
    case "gemini":
      return "gemini";
    case "zai":
      return "zai";
    case "muse":
      return "meta";
  }
}

const KEY_ENV: Record<KeyId, string> = {
  anthropic: "ANTHROPIC_API_KEY",
  openai: "OPENAI_API_KEY",
  deepseek: "DEEPSEEK_API_KEY",
  gemini: "GEMINI_API_KEY",
  zai: "ZAI_API_KEY",
  meta: "MODEL_API_KEY", // the name Meta's SDKs read
};

export interface LocalSettings {
  engine: EngineId;
  /** Provider used by the "api" engine. */
  provider: LlmProvider;
  keys: Partial<Record<KeyId, string>>;
  models: Partial<Record<LlmProvider, string>>;
  baseUrls: Partial<Record<LlmProvider, string>>;
  /** Model alias passed to the CLI engines (e.g. "sonnet"); empty = the CLI's own default. */
  cliModel: string;
  /** The user's default look & feel for new builds (lib/preferences); a project can override it. */
  prefs: Partial<StylePrefs>;
  /** Free-form tunables (critic_provider, critic_model, repair_provider, vision_provider, rulebook_*). */
  app: Record<string, string>;
}

export const DEFAULT_SETTINGS: LocalSettings = {
  engine: "api",
  provider: "claude",
  keys: {},
  models: {},
  baseUrls: {},
  cliModel: "",
  prefs: {},
  app: {},
};

function normalize(raw: Partial<LocalSettings> | null): LocalSettings {
  const s = { ...DEFAULT_SETTINGS, ...(raw ?? {}) };
  return {
    ...s,
    engine: ENGINES.includes(s.engine) ? s.engine : DEFAULT_SETTINGS.engine,
    provider: LLM_PROVIDERS.includes(s.provider) ? s.provider : DEFAULT_SETTINGS.provider,
    keys: { ...(s.keys ?? {}) },
    models: { ...(s.models ?? {}) },
    baseUrls: { ...(s.baseUrls ?? {}) },
    prefs: sanitizePrefs(s.prefs),
    app: { ...(s.app ?? {}) },
  };
}

export async function getSettings(): Promise<LocalSettings> {
  return normalize(await readJson<Partial<LocalSettings> | null>(settingsPath(), null));
}

export async function saveSettings(patch: Partial<LocalSettings>): Promise<LocalSettings> {
  const next = normalize({ ...(await getSettings()), ...patch });
  await writeJsonAtomic(settingsPath(), next);
  return next;
}

/** The user's key for a provider: settings.json first, then the environment (handy for development). */
export async function getApiKey(p: LlmProvider): Promise<string | undefined> {
  const id = keyIdFor(p);
  const fromSettings = (await getSettings()).keys[id]?.trim();
  return fromSettings || process.env[KEY_ENV[id]]?.trim() || undefined;
}

/** Compatibility with the hosted version's key/value tunables. */
export async function getAppSetting(key: string): Promise<string | null> {
  return (await getSettings()).app[key] ?? null;
}

// Serialize read-modify-write of the `app` map (a background rulebook check and a Settings click can
// overlap — without this, one write silently drops the other's key).
const g = globalThis as unknown as { __egsAppSettingsWrite?: Promise<unknown> };

/** Merge keys into settings.app in one queued step. */
export function updateAppSettings(patch: Record<string, string>): Promise<void> {
  const run = (g.__egsAppSettingsWrite ?? Promise.resolve())
    .catch(() => {})
    .then(async () => {
      const s = await getSettings();
      await saveSettings({ app: { ...s.app, ...patch } });
    });
  g.__egsAppSettingsWrite = run;
  return run;
}

export async function setAppSetting(key: string, value: string): Promise<void> {
  await updateAppSettings({ [key]: value });
}

export async function getNumberSetting(key: string, fallback: number): Promise<number> {
  const n = Number(await getAppSetting(key));
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

export async function getBoolSetting(key: string, fallback: boolean): Promise<boolean> {
  const v = await getAppSetting(key);
  if (v === null) return fallback;
  return v === "on" || v === "true" || v === "1";
}
