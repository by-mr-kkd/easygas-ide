import { APP_VERSION } from "@/lib/rulebook/store";
import { getSettings } from "@/lib/settings";

/** One line about this install for a support question: version, OS and the AI in use (no keys, no paths). */
export async function machineInfo(): Promise<string> {
  const settings = await getSettings();
  const ai = settings.engine === "api" ? `API ${settings.provider}` : `${settings.engine}${settings.cliModel ? ` (${settings.cliModel})` : ""}`;
  const os = process.platform === "win32" ? "Windows" : process.platform;
  return `EasyGAS IDE ${APP_VERSION} · ${os} · AI: ${ai}`;
}
