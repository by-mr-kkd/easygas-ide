import { LLM_PROVIDERS, providerConfig, type LlmProvider } from "./llm/catalog.ts";

/**
 * Which AI answers a message (pure — no server imports; the chat's picker and the server both use it,
 * unit-tested in tests/ai-choice.test.ts). The user picks per message, like the model switcher of a
 * chat app; the last pick is remembered on the project.
 */

/** "api" = a provider's API with the user's key; the *-cli engines drive the user's own signed-in CLI. */
export type EngineId = "api" | "claude-cli" | "codex-cli" | "muse-cli";
export const ENGINES: EngineId[] = ["api", "claude-cli", "codex-cli", "muse-cli"];
export type CliEngine = Exclude<EngineId, "api">;
export const CLI_ENGINES: CliEngine[] = ["claude-cli", "codex-cli", "muse-cli"];
export const isCliEngine = (e: EngineId): e is CliEngine => e !== "api";

export interface AiChoice {
  engine: EngineId;
  /** API engine only: whose API. */
  provider?: LlmProvider;
  /** A model id / alias; absent = that AI's own default. */
  model?: string;
}

/**
 * A model name is handed to a CLI as one argument and to an API as a string. It must start with a
 * letter or digit — a leading "-" would be read by a CLI as a flag of its own.
 */
export const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:/@-]{0,99}$/;

export const cleanModel = (m: unknown): string | undefined => {
  const s = typeof m === "string" ? m.trim() : "";
  return s && MODEL_ID.test(s) ? s : undefined;
};

/** Anything from a request body or a stored record → a well-formed choice, or null. */
export function sanitizeChoice(input: unknown): AiChoice | null {
  if (!input || typeof input !== "object") return null;
  const o = input as Record<string, unknown>;
  const engine = ENGINES.find((e) => e === o.engine);
  if (!engine) return null;
  const model = cleanModel(o.model);
  if (engine !== "api") return model ? { engine, model } : { engine };
  const provider = LLM_PROVIDERS.find((p) => p === o.provider);
  if (!provider) return null;
  return model ? { engine, provider, model } : { engine, provider };
}

/** "Codex · gpt-6-astra", "Claude (API)", "Claude Code" — the pick as a person would say it; null for none. */
export function aiName(choice: AiChoice | null | undefined): string | null {
  if (!choice) return null;
  const base = choice.engine === "api" ? `${choice.provider ? providerConfig(choice.provider).label : "API"} (API)` : ENGINE_NAME[choice.engine];
  return choice.model ? `${base} · ${choice.model}` : base;
}

export const sameAi = (a: AiChoice, b: AiChoice): boolean => a.engine === b.engine && (a.engine !== "api" || a.provider === b.provider);

export const ENGINE_NAME: Record<CliEngine, string> = {
  "claude-cli": "Claude Code",
  "codex-cli": "Codex",
  "muse-cli": "Muse Code",
};
