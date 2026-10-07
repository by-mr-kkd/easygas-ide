import { delimiter, isAbsolute, join } from "node:path";

/**
 * Where the user's own AI command-line tools might be installed — Claude Code and Codex
 * (pure — unit-tested in tests/cli-locate.test.ts).
 *
 * We spawn the executable directly, never through a shell, so only a real binary counts: an npm
 * `.cmd` shim cannot be started without a shell and is skipped.
 *
 * Order: an explicit override, then the places the vendors' installers use, then PATH. Fixed locations
 * come first because PATH is read once when the app starts — a user who installs a tool while the app
 * is open is still found at the installer's default location without restarting.
 */
export interface LocateInput {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  exists: (path: string) => boolean;
  /** Explicit path from a caller (tests, a setting). */
  override?: string;
}

export type CliTool = "claude" | "codex";

const value = (env: LocateInput["env"], key: string): string | undefined => env[key]?.trim() || undefined;

/** Fixed install locations per tool, from the vendors' own installers. */
function fixedLocations(tool: CliTool, env: LocateInput["env"], win: boolean): (string | undefined)[] {
  const bin = win ? `${tool}.exe` : tool;
  const home = value(env, win ? "USERPROFILE" : "HOME") ?? value(env, "HOME");
  const appData = value(env, "APPDATA");
  const localAppData = value(env, "LOCALAPPDATA");
  const out: (string | undefined)[] = [];
  if (tool === "claude") {
    // Anthropic's native installer: ~/.local/bin/claude(.exe)
    if (home) out.push(join(home, ".local", "bin", bin));
    // npm global install: the real binary inside the package (the .cmd shim needs a shell)
    if (win && appData) out.push(join(appData, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", bin));
  } else {
    // OpenAI's standalone installer (install.ps1): a per-user folder linked to ~/.codex/packages/standalone
    if (win && localAppData) out.push(join(localAppData, "Programs", "OpenAI", "Codex", "bin", bin));
    if (home) out.push(join(home, ".codex", "packages", "standalone", "current", "bin", bin));
  }
  if (win && localAppData) out.push(join(localAppData, "Microsoft", "WinGet", "Links", bin)); // WinGet
  if (!win) out.push(`/usr/local/bin/${tool}`, `/opt/homebrew/bin/${tool}`, `/usr/bin/${tool}`);
  return out;
}

export function cliCandidates(tool: CliTool, { env, platform, override }: Omit<LocateInput, "exists">): string[] {
  const win = platform === "win32";
  const bin = win ? `${tool}.exe` : tool;
  const out: (string | undefined)[] = [
    override,
    value(env, tool === "claude" ? "EASYGAS_CLAUDE_PATH" : "EASYGAS_CODEX_PATH"),
    ...fixedLocations(tool, env, win),
  ];

  // PATH — absolute folders only: a relative entry such as "." would run whatever binary sits in the
  // current directory, which for a spawned engine is a project folder the AI can write to.
  const pathVar = win ? (value(env, "Path") ?? value(env, "PATH")) : value(env, "PATH");
  for (const dir of (pathVar ?? "").split(delimiter)) {
    const d = dir.trim().replace(/^"(.*)"$/, "$1");
    if (d && isAbsolute(d)) out.push(join(d, bin));
  }

  const seen = new Set<string>();
  return out.filter((p): p is string => {
    if (!p) return false;
    const key = win ? p.toLowerCase() : p;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

/** First candidate that exists, or null. */
export function locateCli(tool: CliTool, input: LocateInput): string | null {
  for (const candidate of cliCandidates(tool, input)) if (input.exists(candidate)) return candidate;
  return null;
}

// kept for the existing call sites and tests
export const claudeCandidates = (input: Omit<LocateInput, "exists">): string[] => cliCandidates("claude", input);
export const locateClaude = (input: LocateInput): string | null => locateCli("claude", input);
