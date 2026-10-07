import { strict as assert } from "node:assert";
import { test } from "node:test";
import { claudeCandidates, cliCandidates, locateClaude, locateCli } from "../lib/engines/cli-locate.ts";

// These tests use Windows-style paths and run on Windows (the app's platform); path.join on another OS
// would produce different separators.
const WIN_ENV = {
  USERPROFILE: "C:\\Users\\somchai",
  APPDATA: "C:\\Users\\somchai\\AppData\\Roaming",
  LOCALAPPDATA: "C:\\Users\\somchai\\AppData\\Local",
  Path: "C:\\Windows\\system32;C:\\Tools\\bin;.;relative\\dir;\"C:\\Quoted Dir\";;",
};
const onWindows = process.platform === "win32";
const locate = (present: string[], env: Record<string, string> = WIN_ENV) =>
  locateClaude({ env, platform: "win32", exists: (p) => present.map((x) => x.toLowerCase()).includes(p.toLowerCase()) });

test("finds the native installer's location first", { skip: !onWindows }, () => {
  assert.equal(
    locate(["C:\\Users\\somchai\\.local\\bin\\claude.exe", "C:\\Tools\\bin\\claude.exe"]),
    "C:\\Users\\somchai\\.local\\bin\\claude.exe",
  );
});

test("finds an npm install by its real binary, never the .cmd shim", { skip: !onWindows }, () => {
  const exe = "C:\\Users\\somchai\\AppData\\Roaming\\npm\\node_modules\\@anthropic-ai\\claude-code\\bin\\claude.exe";
  assert.equal(locate([exe, "C:\\Users\\somchai\\AppData\\Roaming\\npm\\claude.cmd"]), exe);
  assert.equal(locate(["C:\\Users\\somchai\\AppData\\Roaming\\npm\\claude.cmd"]), null);
});

test("finds a WinGet install even when PATH was read before it was installed", { skip: !onWindows }, () => {
  const link = "C:\\Users\\somchai\\AppData\\Local\\Microsoft\\WinGet\\Links\\claude.exe";
  assert.equal(locate([link], { ...WIN_ENV, Path: "C:\\Windows\\system32" }), link);
});

test("falls back to any absolute folder on PATH, including a quoted one", { skip: !onWindows }, () => {
  assert.equal(locate(["C:\\Tools\\bin\\claude.exe"]), "C:\\Tools\\bin\\claude.exe");
  assert.equal(locate(["C:\\Quoted Dir\\claude.exe"]), "C:\\Quoted Dir\\claude.exe");
});

test("never looks in relative PATH entries such as '.' (that would run a planted claude.exe)", { skip: !onWindows }, () => {
  const all = claudeCandidates({ env: WIN_ENV, platform: "win32" });
  assert.ok(all.every((p) => /^[A-Za-z]:\\/.test(p)), all.join("\n"));
  assert.ok(!all.some((p) => p.toLowerCase().startsWith("relative")));
});

test("an explicit path wins, and duplicates are listed once", { skip: !onWindows }, () => {
  const all = claudeCandidates({
    env: { ...WIN_ENV, Path: "C:\\Users\\somchai\\.local\\bin;C:\\USERS\\SOMCHAI\\.LOCAL\\BIN" },
    platform: "win32",
    override: "D:\\portable\\claude.exe",
  });
  assert.equal(all[0], "D:\\portable\\claude.exe");
  assert.equal(all.filter((p) => p.toLowerCase() === "c:\\users\\somchai\\.local\\bin\\claude.exe").length, 1);
});

test("finds Codex where OpenAI's installer puts it, then its package folder", { skip: !onWindows }, () => {
  const visible = "C:\\Users\\somchai\\AppData\\Local\\Programs\\OpenAI\\Codex\\bin\\codex.exe";
  const pkg = "C:\\Users\\somchai\\.codex\\packages\\standalone\\current\\bin\\codex.exe";
  const find = (present: string[]) =>
    locateCli("codex", { env: WIN_ENV, platform: "win32", exists: (p) => present.map((x) => x.toLowerCase()).includes(p.toLowerCase()) });
  assert.equal(find([visible, pkg]), visible);
  assert.equal(find([pkg]), pkg);
  assert.equal(find(["C:\\Tools\\bin\\codex.exe"]), "C:\\Tools\\bin\\codex.exe", "PATH works for Codex too");
  assert.equal(find(["C:\\Users\\somchai\\.local\\bin\\claude.exe"]), null, "a Claude install is not a Codex install");
});

test("the Codex override variable is separate from Claude's", { skip: !onWindows }, () => {
  const env = { ...WIN_ENV, EASYGAS_CODEX_PATH: "D:\\x\\codex.exe", EASYGAS_CLAUDE_PATH: "D:\\x\\claude.exe" };
  assert.equal(cliCandidates("codex", { env, platform: "win32" })[0], "D:\\x\\codex.exe");
  assert.equal(cliCandidates("claude", { env, platform: "win32" })[0], "D:\\x\\claude.exe");
});

test("nothing found → null, and a missing environment does not throw", () => {
  assert.equal(locate([]), null);
  assert.equal(locateClaude({ env: {}, platform: "win32", exists: () => false }), null);
});
