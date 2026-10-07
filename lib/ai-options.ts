import { ENGINE_NAME, sanitizeChoice, type AiChoice, type EngineId } from "@/lib/ai-choice";
import { findClaudeExecutable } from "@/lib/engines/claude-cli";
import { codexModels, findCodexExecutable } from "@/lib/engines/codex-cli";
import { findMuseExecutable } from "@/lib/engines/muse-cli";
import { LLM_PROVIDERS, providerConfig, type LlmProvider } from "@/lib/llm/catalog";
import { getStoredRows } from "@/lib/messages";
import { historyFormat } from "@/lib/messages-text";
import { getApiKey, getSettings, type LocalSettings } from "@/lib/settings";
import type { EgsProject } from "@/types/db";

/**
 * The AIs the chat's picker can offer for a project (server-only): the user's signed-in CLI tools and
 * the API providers they have a key for, each with the models to choose from. Only booleans and
 * labels leave the server — never a key.
 */

export interface AiModelOption {
  /** "" = that AI's own default. */
  id: string;
  label: string;
}

export interface AiOption {
  engine: EngineId;
  provider?: LlmProvider;
  label: string;
  /** "plan" = a monthly plan through the vendor's own program; "key" = pay-as-you-go with an API key. */
  group: "plan" | "key";
  ready: boolean;
  /** Why it cannot be used right now (null when ready). */
  hint: string | null;
  models: AiModelOption[];
  /** The provider can be asked for the account's model list. */
  canListModels: boolean;
}

const CLI_MODELS: Record<"claude-cli" | "codex-cli" | "muse-cli", AiModelOption[]> = {
  // Claude Code takes family aliases that always mean the newest of that family; a full model id
  // (claude-opus-4-8 …) can be typed in the picker for one specific release.
  "claude-cli": [
    { id: "", label: "ค่าเริ่มต้นของ Claude Code" },
    { id: "opus", label: "Opus · เก่งสุด ช้าสุด" },
    { id: "sonnet", label: "Sonnet · สมดุล" },
    { id: "haiku", label: "Haiku · เร็ว ประหยัดโควตา" },
  ],
  // the rest of the Codex list comes from its catalog at request time (codexModels)
  "codex-cli": [{ id: "", label: "ค่าเริ่มต้นของ Codex" }],
  "muse-cli": [
    { id: "", label: "ค่าเริ่มต้นของ Muse Code" },
    { id: "muse-spark-1.3", label: "Muse Spark 1.3" },
    { id: "muse-spark-1.2", label: "Muse Spark 1.2" },
  ],
};

/**
 * The API provider a project's history is tied to, or null when any provider may continue it.
 * Rows with tool traffic can only be replayed in the wire format that wrote them; a history of plain
 * text (a new project, or one only the CLI engines have worked on) is open.
 */
export async function apiProviderLock(project: EgsProject): Promise<LlmProvider | null> {
  const format = historyFormat(await getStoredRows(project.id));
  if (format === "plain") return null;
  if (format === "anthropic") return "claude";
  const locked = LLM_PROVIDERS.find((p) => p === project.llm_provider);
  return locked && locked !== "claude" ? locked : "chatgpt";
}

/** The choice Settings implies, for a project that has not picked yet. */
export function defaultChoice(settings: LocalSettings): AiChoice {
  if (settings.engine === "api") return { engine: "api", provider: settings.provider };
  if (settings.engine === "claude-cli" && settings.cliModel) return { engine: "claude-cli", model: settings.cliModel };
  return { engine: settings.engine };
}

/** What answers the next message: this request's pick → the project's last pick → Settings. */
export async function resolveChoice(project: EgsProject, requested: AiChoice | null): Promise<AiChoice> {
  return requested ?? sanitizeChoice(project.ai) ?? defaultChoice(await getSettings());
}

export async function getAiOptions(project: EgsProject): Promise<AiOption[]> {
  const [settings, lock] = await Promise.all([getSettings(), apiProviderLock(project)]);
  const codexExe = findCodexExecutable();
  const found: Record<"claude-cli" | "codex-cli" | "muse-cli", boolean> = {
    "claude-cli": findClaudeExecutable() !== null,
    "codex-cli": codexExe !== null,
    "muse-cli": findMuseExecutable() !== null,
  };
  const codexList = codexExe ? await codexModels(codexExe) : [];
  const options: AiOption[] = (["claude-cli", "codex-cli", "muse-cli"] as const).map((engine) => ({
    engine,
    label: ENGINE_NAME[engine],
    group: "plan",
    ready: found[engine],
    hint: found[engine] ? null : "ยังไม่ได้ติดตั้งในเครื่องนี้ ติดตั้งได้ที่ ตั้งค่า",
    models: engine === "codex-cli" ? [...CLI_MODELS[engine], ...codexList] : CLI_MODELS[engine],
    canListModels: false,
  }));

  for (const provider of LLM_PROVIDERS) {
    const cfg = providerConfig(provider);
    const hasKey = !!(await getApiKey(provider));
    const lockedOut = lock !== null && lock !== provider;
    // without a key a provider is only worth showing when it is the one the user would expect to see
    if (!hasKey && provider !== lock && provider !== settings.provider) continue;
    options.push({
      engine: "api",
      provider,
      label: cfg.label,
      group: "key",
      ready: hasKey && !lockedOut,
      hint: lockedOut
        ? `โปรเจกต์นี้มีประวัติแชตในรูปแบบของ ${providerConfig(lock).label} จึงต่อด้วย API ของเจ้าอื่นไม่ได้`
        : hasKey
          ? null
          : "ยังไม่ได้ใส่ API key ใส่ได้ที่ ตั้งค่า",
      models: [{ id: "", label: `ค่าเริ่มต้น (${settings.models[provider]?.trim() || cfg.model})` }],
      canListModels: hasKey,
    });
  }
  return options;
}
