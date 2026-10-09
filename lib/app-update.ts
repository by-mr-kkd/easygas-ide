import "server-only";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { dataRoot } from "@/lib/local/paths";
import { getAppSetting } from "@/lib/settings";

/**
 * App updates (desktop build only). The Electron shell (electron/main.js) checks GitHub Releases at launch when
 * settings.app[AUTO_UPDATE_KEY] is not "off", downloads in the background, and installs when the app closes. It
 * writes what it is doing to <dataRoot>/update-state.json; the server only reads that file (the same one-way
 * file pattern as remote-state.json), for the Settings card and the small "ปิดแล้วเปิดใหม่" notice.
 */

export const AUTO_UPDATE_KEY = "app_auto_update";

export type UpdateStatus = "off" | "checking" | "latest" | "downloading" | "ready" | "error";

export interface UpdateState {
  status: UpdateStatus;
  /** the version running now */
  current: string;
  /** the newer version being downloaded / ready */
  version: string | null;
  percent: number | null;
  error: string | null;
  at: string;
}

const STATUSES: readonly UpdateStatus[] = ["off", "checking", "latest", "downloading", "ready", "error"];
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

export const updateStatePath = (): string => join(dataRoot(), "update-state.json");

/** The shell's last word, checked field by field; null when there is none (dev server, first launch). */
export async function readUpdateState(): Promise<UpdateState | null> {
  try {
    const raw = JSON.parse(await readFile(updateStatePath(), "utf8")) as Record<string, unknown>;
    if (!STATUSES.includes(raw.status as UpdateStatus)) return null;
    const ver = (v: unknown): string | null => (typeof v === "string" && VERSION.test(v) ? v : null);
    return {
      status: raw.status as UpdateStatus,
      current: ver(raw.current) ?? "",
      version: ver(raw.version),
      percent: typeof raw.percent === "number" && raw.percent >= 0 && raw.percent <= 100 ? Math.round(raw.percent) : null,
      error: typeof raw.error === "string" ? raw.error.slice(0, 200) : null,
      at: typeof raw.at === "string" ? raw.at.slice(0, 40) : "",
    };
  } catch {
    return null;
  }
}

/** On unless the user switched it off (the default is on). */
export async function autoUpdateEnabled(): Promise<boolean> {
  return (await getAppSetting(AUTO_UPDATE_KEY)) !== "off";
}
