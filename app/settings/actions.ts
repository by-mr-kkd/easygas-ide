"use server";

import { assertLocalRequest } from "@/lib/remote/request";
import { AUTO_UPDATE_KEY } from "@/lib/app-update";
import { MODEL_ID } from "@/lib/ai-choice";
import { revalidatePath } from "next/cache";
import { claspLogout, getClaspAccount, startClaspLogin, type ClaspAccount } from "@/lib/clasp";
import { spawn } from "node:child_process";
import { claudeStatus, findClaudeExecutable } from "@/lib/engines/claude-cli";
import type { InstallableCli } from "@/lib/engines/cli-install";
import { launcherArgs, powershellPath, type TerminalKind } from "@/lib/engines/cli-terminal";
import { codexStatus, findCodexExecutable } from "@/lib/engines/codex-cli";
import { findMuseExecutable, museVersion } from "@/lib/engines/muse-cli";
import { childEnv } from "@/lib/child-env";
import { findUninstaller, uninstallLauncherArgs } from "@/lib/desktop-uninstall";
import { existsSync } from "node:fs";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/llm/catalog";
import { addOwnLesson, approveLesson, deleteLesson, switchLesson } from "@/lib/lessons-store";
import { sanitizePrefs } from "@/lib/preferences";
import { checkRulebookUpdate, maybeAutoCheckRulebook, type UpdateResult } from "@/lib/rulebook/update";
import { CLAUDE_QUOTA_SETTING } from "@/lib/engines/claude-quota";
import { openDataFolder } from "@/lib/open-folder";
import { setAppSetting } from "@/lib/settings";
import { ENGINES, KEY_IDS, getSettings, saveSettings, updateAppSettings, type EngineId, type KeyId } from "@/lib/settings";

const MAX_KEY_LENGTH = 400;

export async function saveEngineAction(input: {
  engine: EngineId;
  provider: LlmProvider;
  cliModel: string;
}): Promise<{ ok: boolean; error?: string }> {
  if (!ENGINES.includes(input.engine)) return { ok: false, error: "engine ไม่ถูกต้อง" };
  if (!LLM_PROVIDERS.includes(input.provider)) return { ok: false, error: "provider ไม่ถูกต้อง" };
  if (input.cliModel !== "" && !MODEL_ID.test(input.cliModel)) return { ok: false, error: "โมเดลไม่ถูกต้อง" };
  await saveSettings({ engine: input.engine, provider: input.provider, cliModel: input.cliModel });
  revalidatePath("/settings");
  revalidatePath("/projects");
  return { ok: true };
}

/** Settings → AI → Claude Code: allow the status bar to read Claude's quota (see lib/engines/claude-quota). */
export async function setClaudeQuotaAction(on: boolean): Promise<void> {
  await setAppSetting(CLAUDE_QUOTA_SETTING, on ? "on" : "off");
  revalidatePath("/settings");
}

/** Store a provider key. The key never comes back to the browser — the page only learns hasKey. */
export async function saveApiKeyAction(keyId: KeyId, key: string): Promise<{ ok: boolean; error?: string }> {
  await assertLocalRequest();
  if (!KEY_IDS.includes(keyId)) return { ok: false, error: "provider ไม่ถูกต้อง" };
  const trimmed = key.trim();
  if (!trimmed || trimmed.length > MAX_KEY_LENGTH || /\s/.test(trimmed)) return { ok: false, error: "รูปแบบคีย์ไม่ถูกต้อง" };
  if (keyId === "anthropic" && !trimmed.startsWith("sk-ant-"))
    return { ok: false, error: "คีย์ Anthropic ต้องขึ้นต้นด้วย sk-ant-" };
  const s = await getSettings();
  await saveSettings({ keys: { ...s.keys, [keyId]: trimmed } });
  revalidatePath("/settings");
  revalidatePath("/projects");
  return { ok: true };
}

export async function removeApiKeyAction(keyId: KeyId): Promise<void> {
  await assertLocalRequest();
  if (!KEY_IDS.includes(keyId)) return;
  const s = await getSettings();
  const keys = { ...s.keys };
  delete keys[keyId];
  await saveSettings({ keys });
  revalidatePath("/settings");
  revalidatePath("/projects");
}

/** Opens Google's sign-in page in the user's browser (clasp login); the UI polls googleStatusAction. */
export async function startGoogleLoginAction(): Promise<void> {
  await assertLocalRequest();
  await startClaspLogin();
}

export async function googleStatusAction(): Promise<ClaspAccount> {
  return getClaspAccount({ fresh: true });
}

export async function googleLogoutAction(): Promise<void> {
  await assertLocalRequest();
  await claspLogout();
  revalidatePath("/settings");
  revalidatePath("/projects");
}

/** The user's default look & feel for new builds. Unknown keys / option ids are dropped. */
export async function savePrefsAction(input: unknown): Promise<{ ok: boolean; error?: string }> {
  await saveSettings({ prefs: sanitizePrefs(input) });
  revalidatePath("/settings");
  return { ok: true };
}

/** "อัปเดตอัตโนมัติเมื่อเปิดโปรแกรม" (default on). The Electron shell reads it at the next launch. */
export async function setAutoUpdateAction(on: boolean): Promise<void> {
  await assertLocalRequest();
  await updateAppSettings({ [AUTO_UPDATE_KEY]: on === true ? "on" : "off" });
  revalidatePath("/settings");
}

export async function setRulebookAutoAction(on: boolean): Promise<void> {
  await updateAppSettings({ rulebook_auto: on === true ? "on" : "off" });
  revalidatePath("/settings");
  revalidatePath("/knowledge");
}

/** Check GitHub for a newer signed rulebook now (downloads only; see lib/rulebook/update). */
export async function checkRulebookAction(): Promise<UpdateResult> {
  const r = await checkRulebookUpdate();
  revalidatePath("/settings");
  revalidatePath("/knowledge");
  return r;
}

/** Background check, at most once a day and only while automatic updates are on (never throws). */
export async function autoCheckRulebookAction(): Promise<void> {
  await maybeAutoCheckRulebook();
}

// ── lessons (lib/lessons): the user's decisions; ids are matched against the book, unknown ids do nothing ──

const LESSON_ID = /^L-\d{4,6}$/;

// ok:false = that lesson no longer exists (deleted elsewhere) — the UI must not claim it was saved

/** Keep a proposed lesson: from now on the AI is told about it when it applies. */
export async function approveLessonAction(id: string): Promise<{ ok: boolean }> {
  const ok = LESSON_ID.test(String(id)) && (await approveLesson(id));
  revalidatePath("/settings");
  revalidatePath("/knowledge");
  return { ok };
}

/** on=false declines / switches off: kept on file so it is not proposed again, never sent to the AI. */
export async function switchLessonAction(id: string, on: boolean): Promise<{ ok: boolean }> {
  const ok = LESSON_ID.test(String(id)) && (await switchLesson(id, on === true));
  revalidatePath("/settings");
  revalidatePath("/knowledge");
  return { ok };
}

export async function deleteLessonAction(id: string): Promise<{ ok: boolean }> {
  const ok = LESSON_ID.test(String(id)) && (await deleteLesson(id));
  revalidatePath("/settings");
  revalidatePath("/knowledge");
  return { ok };
}

/** A lesson the user writes themselves (active at once). */
export async function addLessonAction(input: unknown): Promise<{ ok: boolean; reason?: "invalid" | "full" }> {
  const r = await addOwnLesson(input);
  revalidatePath("/settings");
  revalidatePath("/knowledge");
  return r.ok ? { ok: true } : { ok: false, reason: r.reason };
}

/**
 * "ตรวจอีกครั้ง" after installing Claude Code: look for it again and prove it starts. Returns no path
 * (the page does not need it) — only whether it was found and the version it reports.
 */
export interface CliCheck {
  found: boolean;
  version: string | null;
  /** null = this tool has no sign-in check the app can run (Claude Code, Muse Code). */
  loggedIn: boolean | null;
  /** How the user is signed in ("ChatGPT"), never an account secret. */
  account: string | null;
}

const isCli = (t: unknown): t is InstallableCli => t === "claude" || t === "codex" || t === "muse";

const findCli = (tool: InstallableCli): string | null =>
  tool === "claude" ? findClaudeExecutable() : tool === "codex" ? findCodexExecutable() : findMuseExecutable();

/**
 * "ตรวจอีกครั้ง": look for the tool again and prove it starts (and, for Codex, whether it is signed in).
 * Returns no path — the page does not need it.
 */
export async function checkCliAction(tool: InstallableCli): Promise<CliCheck> {
  if (!isCli(tool)) return { found: false, version: null, loggedIn: null, account: null };
  let result: CliCheck;
  if (tool === "claude") {
    const exe = findClaudeExecutable();
    result = exe ? { found: true, ...(await claudeStatus(exe)) } : { found: false, version: null, loggedIn: null, account: null };
  } else if (tool === "muse") {
    const exe = findMuseExecutable();
    result = { found: exe !== null, version: exe ? await museVersion(exe) : null, loggedIn: null, account: null };
  } else {
    const exe = findCodexExecutable();
    result = exe ? { found: true, ...(await codexStatus(exe)) } : { found: false, version: null, loggedIn: null, account: null };
  }
  revalidatePath("/settings");
  revalidatePath("/projects");
  return result;
}

/**
 * "ติดตั้งให้" / "ล็อกอิน": open a VISIBLE PowerShell window running the vendor's own installer or the
 * tool's own sign-in (lib/engines/cli-terminal.ts). The user watches it and can close it; nothing from
 * the request goes into the command but the two fixed choices below.
 */
export async function openCliTerminalAction(tool: InstallableCli, kind: TerminalKind): Promise<{ ok: boolean; error?: string }> {
  await assertLocalRequest();
  if (!isCli(tool) || (kind !== "install" && kind !== "login")) return { ok: false, error: "คำขอไม่ถูกต้อง" };
  if (process.platform !== "win32") return { ok: false, error: "ปุ่มนี้ใช้ได้บน Windows ทำตามขั้นตอนติดตั้งเองด้านล่าง" };
  const exe = kind === "login" ? findCli(tool) : null;
  if (kind === "login" && !exe) return { ok: false, error: "ยังไม่พบโปรแกรม ติดตั้งก่อน แล้วค่อยล็อกอิน" };
  try {
    const ps = powershellPath(process.env);
    // a hidden launcher opens the visible window (see launcherArgs for why not directly)
    const child = spawn(ps, launcherArgs(ps, tool, kind, exe), { stdio: "ignore", windowsHide: true, env: childEnv({}) });
    child.on("error", (e) => console.error("[settings] could not open the terminal:", e.message));
    child.unref();
    return { ok: true };
  } catch (e) {
    console.error("[settings] could not open the terminal:", e);
    return { ok: false, error: "เปิดหน้าต่าง PowerShell ไม่สำเร็จ ทำตามขั้นตอนด้านล่างเอง" };
  }
}

/**
 * "ถอนการติดตั้ง": open the app's own uninstaller (lib/desktop-uninstall.ts). Its wizard asks the user
 * again and closes the app itself. The only thing taken from the request is whether the data folder
 * goes too; the path comes from the running executable.
 */
export async function uninstallAppAction(deleteData: boolean): Promise<{ ok: boolean; error?: string }> {
  await assertLocalRequest();
  const uninstaller = findUninstaller({ env: process.env, platform: process.platform, execPath: process.execPath, exists: existsSync });
  if (!uninstaller) {
    return { ok: false, error: "ปุ่มนี้ใช้ได้กับแอปที่ติดตั้งด้วยตัวติดตั้งเท่านั้น ถอนได้จาก Settings ของ Windows → Apps → Installed apps" };
  }
  try {
    const child = spawn(powershellPath(process.env), uninstallLauncherArgs(uninstaller, deleteData === true), {
      stdio: "ignore",
      windowsHide: true,
      detached: true,
      env: childEnv({}),
    });
    child.on("error", (e) => console.error("[settings] could not open the uninstaller:", e.message));
    child.unref();
    return { ok: true };
  } catch (e) {
    console.error("[settings] could not open the uninstaller:", e);
    return { ok: false, error: "เปิดตัวถอนการติดตั้งไม่สำเร็จ ถอนได้จาก Settings ของ Windows → Apps → Installed apps" };
  }
}

/** Settings → ข้อมูลในเครื่อง: open the app's data folder in File Explorer. */
export async function openDataFolderAction(): Promise<{ ok: true } | { ok: false; error: string }> {
  await assertLocalRequest();
  try {
    await openDataFolder();
    return { ok: true };
  } catch (e) {
    console.error("[open-folder]", e);
    return { ok: false, error: "เปิดโฟลเดอร์ไม่สำเร็จ" };
  }
}
