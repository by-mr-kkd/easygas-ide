import { strict as assert } from "node:assert";
import { test } from "node:test";
import { CLI_INSTALL } from "../lib/engines/cli-install.ts";
import { launcherArgs, powershellPath, psQuote, terminalArgs, terminalScript } from "../lib/engines/cli-terminal.ts";

test("PowerShell is taken from the Windows folder, never from PATH", () => {
  assert.equal(powershellPath({ SystemRoot: "C:\\Windows" }), "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(powershellPath({ windir: "D:\\Win" }), "D:\\Win\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
  assert.equal(powershellPath({}), "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe");
});

test("the install window runs exactly the vendor's documented command and shows it first", () => {
  for (const tool of ["claude", "codex", "muse"] as const) {
    const script = terminalScript(tool, "install", null);
    assert.ok(script.includes(`; ${CLI_INSTALL[tool].command}; `), tool);
    assert.ok(script.indexOf("Write-Host") < script.indexOf(`; ${CLI_INSTALL[tool].command}; `), "shown before it runs");
  }
  assert.equal(CLI_INSTALL.codex.command, "irm https://chatgpt.com/codex/install.ps1 | iex");
  assert.equal(CLI_INSTALL.claude.command, "irm https://claude.ai/install.ps1 | iex");
  assert.equal(CLI_INSTALL.muse.command, "irm https://dev.meta.ai/install.ps1 | iex");
});

const decodedPath = (script: string): string => {
  const b64 = /FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1] ?? "";
  return Buffer.from(b64, "base64").toString("utf8");
};

test("the sign-in window gets the executable path as encoded data, so no path can inject commands", () => {
  for (const exe of ["C:\\Users\\o'brien; Remove-Item\\codex.exe", "C:\\Users\\O\u2019Brien\\x'; calc; '\\codex.exe", "C:\\ทดสอบ\\codex.exe"]) {
    const script = terminalScript("codex", "login", exe);
    assert.equal(decodedPath(script), exe, "the exact path round-trips");
    assert.ok(!script.includes("Remove-Item") && !script.includes("calc") && !script.includes("\u2019"), script);
  }
  assert.equal(psQuote("a'b"), "'a''b'");
});

test("Claude Code signs in by starting it; Codex has its own login command", () => {
  assert.match(terminalScript("claude", "login", "C:\\x\\claude.exe"), /& \(\[Text\.Encoding\]::UTF8\.GetString\(\[Convert\]::FromBase64String\('[A-Za-z0-9+/=]+'\)\)\)$/);
  assert.match(terminalScript("codex", "login", "C:\\x\\codex.exe"), /\) login$/);
  assert.match(terminalScript("muse", "login", "C:\\x\\muse-bin-1.4.2.exe"), /\) login$/);
});

test("sign-in needs an absolute path the app located itself", () => {
  for (const exe of [null, "codex.exe", ".\\codex.exe"]) {
    assert.throws(() => terminalScript("codex", "login", exe), /no_executable/, String(exe));
  }
});

test("the window stays open so the user can read the result, and no profile script runs", () => {
  const args = terminalArgs("codex", "install", null);
  assert.deepEqual(args.slice(0, 3), ["-NoExit", "-NoProfile", "-EncodedCommand"]);
  assert.equal(Buffer.from(args[3], "base64").toString("utf16le"), terminalScript("codex", "install", null), "the script round-trips exactly");
});

test("a hidden launcher opens the visible window with Start-Process, everything quoted", () => {
  const ps = "C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe";
  const args = launcherArgs(ps, "codex", "login", "C:\\Users\\o'brien\\codex.exe");
  assert.deepEqual(args.slice(0, 5), ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-Command"]);
  assert.match(args[5], /^Start-Process -FilePath 'C:\\Windows\\System32\\WindowsPowerShell\\v1\.0\\powershell\.exe' -ArgumentList '-NoExit','-NoProfile','-EncodedCommand','[A-Za-z0-9+/=]+'$/);
});

test("terminal messages are plain ASCII (a non-Thai console code page would garble Thai)", () => {
  for (const tool of ["claude", "codex", "muse"] as const) {
    for (const s of [terminalScript(tool, "install", null), terminalScript(tool, "login", "C:\\x\\a.exe")]) {
      assert.match(s, /^[\x20-\x7e]*$/, s);
    }
  }
});
