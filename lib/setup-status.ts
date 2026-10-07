import { getClaspAccount, type ClaspAccount } from "@/lib/clasp";
import { findClaudeExecutable } from "@/lib/engines/claude-cli";
import { findCodexExecutable } from "@/lib/engines/codex-cli";
import { findMuseExecutable } from "@/lib/engines/muse-cli";
import { providerConfig } from "@/lib/llm/catalog";
import { getApiKey, getSettings, type EngineId } from "@/lib/settings";

/** What the app still needs before the user can build + deploy (server-only). */
export interface SetupStatus {
  engine: EngineId;
  engineLabel: string;
  engineReady: boolean;
  /** Thai hint for what's missing, or null when ready. */
  engineHint: string | null;
  google: ClaspAccount;
}

export async function getSetupStatus(): Promise<SetupStatus> {
  const [settings, google] = await Promise.all([getSettings(), getClaspAccount()]);
  let engineLabel: string;
  let engineHint: string | null = null;
  if (settings.engine === "claude-cli") {
    engineLabel = "Claude Code (สมาชิกรายเดือน)";
    if (!findClaudeExecutable()) engineHint = "ยังไม่พบ Claude Code ในเครื่อง ดูวิธีติดตั้งในหน้า ตั้งค่า แล้วล็อกอินด้วยบัญชี Claude ของคุณ";
  } else if (settings.engine === "codex-cli") {
    engineLabel = "Codex (สมาชิก ChatGPT)";
    if (!findCodexExecutable()) engineHint = "ยังไม่พบ Codex ในเครื่อง กดติดตั้งได้ในหน้า ตั้งค่า แล้วล็อกอินด้วยบัญชี ChatGPT ของคุณ";
  } else if (settings.engine === "muse-cli") {
    engineLabel = "Muse Code (สมาชิก Meta)";
    if (!findMuseExecutable()) engineHint = "ยังไม่พบ Muse Code ในเครื่อง กดติดตั้งได้ในหน้า ตั้งค่า แล้วล็อกอินด้วยบัญชี Meta ของคุณ";
  } else {
    engineLabel = `${providerConfig(settings.provider).label} (API key)`;
    if (!(await getApiKey(settings.provider))) engineHint = `ยังไม่ได้ใส่ API key ของ ${providerConfig(settings.provider).label}`;
  }
  return { engine: settings.engine, engineLabel, engineReady: engineHint === null, engineHint, google };
}
