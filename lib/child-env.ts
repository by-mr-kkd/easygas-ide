/**
 * Environment for child processes (claude, codex, muse, clasp). Provider API keys are removed: the app
 * keeps the user's keys in settings.json and passes them to SDK clients directly, and a stray
 * ANTHROPIC_API_KEY would silently move Claude Code from the user's subscription to pay-per-use API
 * billing (Muse Code does the same with META_API_KEY: "an API key always takes priority").
 */
const STRIP = [
  "ANTHROPIC_API_KEY",
  "ANTHROPIC_AUTH_TOKEN",
  "OPENAI_API_KEY",
  "DEEPSEEK_API_KEY",
  "GEMINI_API_KEY",
  "GOOGLE_API_KEY",
  "ZAI_API_KEY",
  "META_API_KEY",
  "MODEL_API_KEY",
];

/**
 * The app's own process settings, which must not leak into what it starts: ELECTRON_RUN_AS_NODE would
 * make any Electron program the user opens from a sign-in window (VS Code, for one) run as bare Node,
 * and PORT / HOSTNAME / NODE_ENV / EASYGAS_* belong to the app's server alone. Callers that need one
 * (clasp runs on Electron's Node) pass it back explicitly in `extra`.
 */
const STRIP_APP = ["ELECTRON_RUN_AS_NODE", "PORT", "HOSTNAME", "NODE_ENV"];

export function childEnv(extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const env: NodeJS.ProcessEnv = { ...process.env };
  for (const k of Object.keys(env)) {
    const key = k.toUpperCase();
    if (STRIP.includes(key) || STRIP_APP.includes(key) || key.startsWith("EASYGAS_")) delete env[k];
  }
  return { ...env, ...extra };
}
