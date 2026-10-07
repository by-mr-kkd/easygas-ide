import { dirname, isAbsolute, join } from "node:path";

/**
 * Starting the app's own uninstaller from Settings (pure — unit-tested in tests/desktop-uninstall.test.ts).
 *
 * The installed app has the NSIS uninstaller electron-builder generates, next to the executable. The
 * button only LAUNCHES it: the uninstaller's own wizard asks the user to confirm, closes the running
 * app, and removes the program. `--delete-app-data` is electron-builder's switch that also removes
 * %APPDATA%\<product name> — which is exactly this app's data folder (lib/local/paths.ts).
 *
 * It is started through a hidden PowerShell `Start-Process`, not spawned directly: the uninstaller
 * skips its "the app is running — close it?" step when its parent process IS the app (that path is
 * meant for self-updates), and would then try to delete files that are still in use.
 */

/** electron-builder.yml `productName`; the uninstaller is "Uninstall <productName>.exe". */
export const PRODUCT_NAME = "EasyGAS IDE";

export interface UninstallerLookup {
  env: Record<string, string | undefined>;
  platform: NodeJS.Platform;
  /** The running executable — in the desktop app, the installed "EasyGAS IDE.exe". */
  execPath: string;
  exists: (path: string) => boolean;
}

/**
 * The uninstaller of THIS installation, or null when the app is not running from one (a development
 * server, a portable copy, another OS). Derived from the running executable only — never from a request.
 */
export function findUninstaller({ env, platform, execPath, exists }: UninstallerLookup): string | null {
  if (platform !== "win32" || env.EASYGAS_DESKTOP !== "1") return null;
  if (!execPath || !isAbsolute(execPath)) return null;
  const candidate = join(dirname(execPath), `Uninstall ${PRODUCT_NAME}.exe`);
  return exists(candidate) ? candidate : null;
}

/** The PowerShell script the hidden launcher runs. The path travels as base64 data, never as script text. */
export function uninstallScript(uninstaller: string, deleteData: boolean): string {
  if (!isAbsolute(uninstaller)) throw new Error("no_uninstaller");
  const path = `[Text.Encoding]::UTF8.GetString([Convert]::FromBase64String('${Buffer.from(uninstaller, "utf8").toString("base64")}'))`;
  return `Start-Process -FilePath (${path})${deleteData ? " -ArgumentList '--delete-app-data'" : ""}`;
}

/** Arguments for powershell.exe (hidden, no profile); the script is base64-encoded so nothing needs quoting. */
export function uninstallLauncherArgs(uninstaller: string, deleteData: boolean): string[] {
  return [
    "-NoProfile",
    "-NonInteractive",
    "-WindowStyle",
    "Hidden",
    "-EncodedCommand",
    Buffer.from(uninstallScript(uninstaller, deleteData), "utf16le").toString("base64"),
  ];
}
