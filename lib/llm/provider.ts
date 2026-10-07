import {
  DEFAULT_PROVIDER,
  LLM_PROVIDERS,
  providerConfig,
  type LlmProvider,
  type ProviderConfig,
} from "@/lib/llm/catalog";
import { getProject, updateProject } from "@/lib/projects";
import { getApiKey, getAppSetting, getSettings } from "@/lib/settings";

/**
 * Provider resolution (server-only). The user picks a provider in Settings and supplies their own
 * key; a project locks to the provider it was first generated with (stored history is in that
 * provider's wire format). The pure catalog lives in ./catalog and is re-exported for old importers.
 */

export {
  DEFAULT_PROVIDER,
  LLM_PROVIDERS,
  providerConfig,
  type LlmFamily,
  type LlmProvider,
  type ProviderConfig,
} from "@/lib/llm/catalog";

/** The provider chosen in Settings. */
export async function getDefaultProvider(): Promise<LlmProvider> {
  return (await getSettings()).provider ?? DEFAULT_PROVIDER;
}

/**
 * Full config with the user's key, model and base URL overrides applied (use this on the request
 * path). Precedence: settings.json → env/static default in catalog.
 */
export async function resolveProvider(p: LlmProvider): Promise<ProviderConfig> {
  const base = providerConfig(p);
  const s = await getSettings();
  return {
    ...base,
    model: s.models[p]?.trim() || base.model,
    baseURL: s.baseUrls[p]?.trim() || base.baseURL,
    apiKey: await getApiKey(p),
  };
}

/** Kept for call-site compatibility: there is one local user, whose provider is the Settings one. */
export async function getUserProvider(_userId: string): Promise<LlmProvider> {
  return getDefaultProvider();
}

/** Resolve the provider for a project, locking it on first use. */
export async function resolveProjectProvider(projectId: string, _userId: string): Promise<LlmProvider> {
  const project = await getProject(projectId);
  const locked = project?.llm_provider as LlmProvider | null | undefined;
  if (locked && LLM_PROVIDERS.includes(locked)) return locked;
  const chosen = await getDefaultProvider();
  await updateProject(projectId, { llm_provider: chosen });
  return chosen;
}

/**
 * The provider that RUNS a Gate-2 repair. Defaults to the project's own provider; settings.app.
 * repair_provider can point OpenAI-family projects at a stronger model the user also has a key for.
 * Claude projects always stay on Claude (Anthropic-format history can't cross families).
 */
export async function resolveRepairProvider(projectProvider: LlmProvider): Promise<LlmProvider> {
  if (projectProvider === "claude") return "claude";
  const stored = (await getAppSetting("repair_provider")) as LlmProvider | null;
  if (!stored || !LLM_PROVIDERS.includes(stored) || stored === "claude" || stored === projectProvider) {
    return projectProvider;
  }
  return (await resolveProvider(stored)).apiKey ? stored : projectProvider;
}
