import { isAbsolute, join } from "node:path";
import { CLI_INSTALL, type InstallableCli } from "./cli-install.ts";

/**
 * The visible PowerShell windows Settings opens for "ติดตั้งให้" and "ล็อกอิน" (pure — unit-tested in
 * tests/cli-terminal.test.ts).
 *
 * The app never installs or signs in on the user's behalf behind their back: it opens a normal terminal
 * window that shows exactly what runs, and the vendor's own installer / sign-in does the rest. Only the
 * fixed commands in CLI_INSTALL and an executable path the app located itself ever go into the script.
 * Messages are ASCII: a Windows console on a non-Thai code page would garble Thai text.
 */

export type TerminalKind = "install" | "login";

/** Windows PowerShell by absolute path, so nothing on PATH can stand in for it. */
export function powershellPath(env: Record<string, string | undefined>): string {
  return join(env.SystemRoot?.trim() || env.windir?.trim() || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
}

/** A PowerShell single-quoted literal (the only escape inside one is a doubled quote). */
export const psQuote = (s: string): string => `'${s.replace(/'/g, "''")}'`;

export function terminalScript(tool: InstallableCli, kind: TerminalKind, exe: string | null): string {
  const info = CLI_INSTALL[tool];
  const title = `$Host.UI.RawUI.WindowTitle = ${psQuote(`EasyGAS IDE - ${kind === "install" ? "install" : "sign in to"} ${info.name}`)}`;
  if (kind === "install") {
    return [
      title,
      `Write-Host ${psQuote(`EasyGAS IDE: installing ${info.name} with ${info.vendor}'s official installer:`)}`,
      `Write-Host ${psQuote(`  ${info.command}`)} -ForegroundColor Cyan`,
      `Write-Host ''`,
      info.command,
      `Write-Host ''`,
      `Write-Host 'Done. Go back to EasyGAS IDE and press the sign-in button, then "check again".' -ForegroundColor Green`,
    ].join("; ");
  }
  if (!exe || !isAbsolute(exe)) throw new Error("no_executable");
  // The path goes in as base64 DATA and is decoded at run time: PowerShell also treats curly quotes as
  // quote characters, so no amount of escaping text makes an arbitrary path safe inside the script.
  const path = `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(exe, "utf8").toString("base64")}'))`;
  // Codex and Muse Code have a sign-in command of their own; Claude Code signs in when it starts.
  const hasLoginCommand = tool !== "claude";
  const run = hasLoginCommand ? `& (${path}) login` : `& (${path})`;
  const after = hasLoginCommand
    ? "When the browser says you are signed in, close this window and press \"check again\" in EasyGAS IDE."
    : "Sign in when asked. Once Claude Code is ready, type /exit, close this window and press \"check again\" in EasyGAS IDE.";
  return [title, `Write-Host ${psQuote(`EasyGAS IDE: ${after}`)} -ForegroundColor Cyan`, `Write-Host ''`, run].join("; ");
}

/** Arguments for the visible window's powershell.exe: kept open so the user can read the result. */
export function terminalArgs(tool: InstallableCli, kind: TerminalKind, exe: string | null): string[] {
  return ["-NoExit", "-NoProfile", "-EncodedCommand", Buffer.from(terminalScript(tool, kind, exe), "utf16le").toString("base64")];
}

/**
 * Arguments for a HIDDEN powershell.exe that opens the visible window with Start-Process. Spawned
 * straight from the app's server (which has no console of its own), the window would inherit "no
 * input" and PowerShell would quit at once despite -NoExit (verified); Start-Process gives the new
 * window a console of its own. The script travels base64-encoded, so no quoting can break it.
 */
export function launcherArgs(psPath: string, tool: InstallableCli, kind: TerminalKind, exe: string | null): string[] {
  const list = terminalArgs(tool, kind, exe).map(psQuote).join(",");
  return ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command", `Start-Process -FilePath ${psQuote(psPath)} -ArgumentList ${list}`];
}
