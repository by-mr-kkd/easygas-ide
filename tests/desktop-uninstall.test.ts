import { strict as assert } from "node:assert";
import { test } from "node:test";
import { findUninstaller, uninstallLauncherArgs, uninstallScript } from "../lib/desktop-uninstall.ts";

// Windows-style paths; path.join on another OS would produce different separators.
const onWindows = process.platform === "win32";
const DIR = "C:\\Users\\somchai\\AppData\\Local\\Programs\\EasyGAS IDE";
const EXE = `${DIR}\\EasyGAS IDE.exe`;
const UNINSTALLER = `${DIR}\\Uninstall EasyGAS IDE.exe`;
const lookup = (o: Partial<Parameters<typeof findUninstaller>[0]> = {}) =>
  findUninstaller({ env: { EASYGAS_DESKTOP: "1" }, platform: "win32", execPath: EXE, exists: (p) => p === UNINSTALLER, ...o });

test("finds the uninstaller that sits next to the running, installed app", { skip: !onWindows }, () => {
  assert.equal(lookup(), UNINSTALLER);
});

test("there is nothing to launch outside an installed desktop app", { skip: !onWindows }, () => {
  assert.equal(lookup({ env: {} }), null, "a development server");
  assert.equal(lookup({ platform: "linux" }), null);
  assert.equal(lookup({ exists: () => false }), null, "a copy with no uninstaller");
  assert.equal(lookup({ execPath: "EasyGAS IDE.exe" }), null, "a relative path is never trusted");
  assert.equal(lookup({ execPath: "" }), null);
});

const decodedPath = (script: string): string => Buffer.from(/FromBase64String\('([A-Za-z0-9+/=]+)'\)/.exec(script)?.[1] ?? "", "base64").toString("utf8");

test("the path goes in as encoded data, so no folder name can inject a command", () => {
  for (const exe of ["C:\\Users\\o'brien; Remove-Item\\Uninstall EasyGAS IDE.exe", "C:\\ผู้ใช้\\Uninstall EasyGAS IDE.exe", "C:\\a\u2019b'; calc; '\\Uninstall EasyGAS IDE.exe"]) {
    const script = uninstallScript(exe, false);
    assert.equal(decodedPath(script), exe, "the exact path round-trips");
    assert.match(script, /^Start-Process -FilePath \(\[Text\.Encoding\]::UTF8\.GetString\(\[Convert\]::FromBase64String\('[A-Za-z0-9+/=]+'\)\)\)$/);
  }
  assert.throws(() => uninstallScript("Uninstall EasyGAS IDE.exe", false), /no_uninstaller/);
});

test("the user's data is removed only when asked for, with electron-builder's own switch", () => {
  assert.ok(!uninstallScript(UNINSTALLER, false).includes("delete-app-data"));
  assert.match(uninstallScript(UNINSTALLER, true), / -ArgumentList '--delete-app-data'$/);
});

test("the launcher is a hidden PowerShell with no profile, and the script round-trips exactly", () => {
  const args = uninstallLauncherArgs(UNINSTALLER, true);
  assert.deepEqual(args.slice(0, 5), ["-NoProfile", "-NonInteractive", "-WindowStyle", "Hidden", "-EncodedCommand"]);
  assert.equal(Buffer.from(args[5], "base64").toString("utf16le"), uninstallScript(UNINSTALLER, true));
});
