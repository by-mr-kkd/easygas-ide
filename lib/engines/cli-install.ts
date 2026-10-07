/**
 * How the user installs their own AI command-line tool (shown in Settings). No Node imports: client
 * components use these. All are the vendors' own per-user installers — no Node.js, no administrator
 * rights (Claude Code and Codex checked 2026-10-06, Muse Code 2026-10-07):
 *  - Claude Code: Anthropic's setup guide; installs to %USERPROFILE%/.local/bin.
 *  - Codex: OpenAI's install.ps1 (the Windows counterpart of the documented install.sh); installs to
 *    %LOCALAPPDATA%/Programs/OpenAI/Codex/bin.
 *  - Muse Code: Meta's install.ps1 (dev.meta.ai/docs/muse-code); installs to %LOCALAPPDATA%/Programs/muse.
 *    Its sandbox may ask for administrator approval once (a UAC prompt) the first time it starts.
 */
export type InstallableCli = "claude" | "codex" | "muse";

export const CLI_INSTALL: Record<
  InstallableCli,
  { name: string; command: string; docsUrl: string; vendor: string; plan: string; loginCommand: string }
> = {
  claude: {
    name: "Claude Code",
    command: "irm https://claude.ai/install.ps1 | iex",
    docsUrl: "https://code.claude.com/docs/en/setup",
    vendor: "Anthropic",
    plan: "Claude Pro หรือ Max (แพ็กเกจฟรีใช้ไม่ได้)",
    loginCommand: "claude",
  },
  codex: {
    name: "Codex",
    command: "irm https://chatgpt.com/codex/install.ps1 | iex",
    docsUrl: "https://learn.chatgpt.com/docs/codex/cli",
    vendor: "OpenAI",
    plan: "ChatGPT ที่ใช้ Codex ได้",
    loginCommand: "codex login",
  },
  muse: {
    name: "Muse Code",
    command: "irm https://dev.meta.ai/install.ps1 | iex",
    docsUrl: "https://dev.meta.ai/docs/muse-code",
    vendor: "Meta",
    plan: "Meta ที่สมัครแพ็กเกจ Muse Code",
    loginCommand: "muse login",
  },
};

// kept for existing imports
export const CLAUDE_INSTALL_COMMAND_WINDOWS = CLI_INSTALL.claude.command;
export const CLAUDE_SETUP_DOCS_URL = CLI_INSTALL.claude.docsUrl;
