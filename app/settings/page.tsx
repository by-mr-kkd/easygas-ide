import { existsSync } from "node:fs";
import { savePrefsAction } from "./actions";
import { UninstallApp } from "@/components/settings/UninstallApp";
import { AppUpdateCard } from "@/components/settings/AppUpdateCard";
import { autoUpdateEnabled, readUpdateState } from "@/lib/app-update";
import { EngineForm } from "@/components/settings/EngineForm";
import { PremiumSection } from "@/components/premium/PremiumSection";
import { GoogleConnect } from "@/components/settings/GoogleConnect";
import { RemoteSection } from "@/components/settings/RemoteSection";
import { SupportSection } from "@/components/settings/SupportSection";
import { APP_VERSION } from "@/lib/rulebook/store";
import { remoteView } from "@/lib/remote/view";
import { isRemoteRequest } from "@/lib/remote/request";
import { remoteSnapshot } from "@/lib/remote/runtime";
import { CLAUDE_QUOTA_SETTING } from "@/lib/engines/claude-quota";

const isOn = (v: string | undefined) => v === "on" || v === "true" || v === "1";
import { GoogleConnectGuide } from "@/components/settings/GoogleConnectGuide";
import { SettingsShell, pickFrom, pickSection, type SettingsSection } from "@/components/settings/SettingsShell";
import { StylePrefsForm } from "@/components/settings/StylePrefsForm";
import { findUninstaller } from "@/lib/desktop-uninstall";
import { findClaudeExecutable } from "@/lib/engines/claude-cli";
import { findCodexExecutable } from "@/lib/engines/codex-cli";
import { findMuseExecutable } from "@/lib/engines/muse-cli";
import { LLM_PROVIDERS, providerConfig } from "@/lib/llm/catalog";
import { dataRoot } from "@/lib/local/paths";
import { resolvePrefs } from "@/lib/preferences";
import { premiumStatus } from "@/lib/premium/status";
import { getSetupStatus } from "@/lib/setup-status";
import { getApiKey, getSettings, keyIdFor, type KeyId } from "@/lib/settings";

export const metadata = { title: "ตั้งค่า — EasyGAS IDE" };

const SECTIONS: readonly SettingsSection[] = ["ai", "google", "style", "remote", "premium", "support", "data"];

const KEY_FORMS: { id: KeyId; label: string; hint: string }[] = [
  { id: "anthropic", label: "Anthropic (Claude)", hint: "สร้างคีย์ที่ console.anthropic.com" },
  { id: "openai", label: "OpenAI (ChatGPT)", hint: "สร้างคีย์ที่ platform.openai.com" },
  { id: "gemini", label: "Google Gemini", hint: "สร้างคีย์ที่ aistudio.google.com" },
  { id: "deepseek", label: "DeepSeek", hint: "สร้างคีย์ที่ platform.deepseek.com" },
  { id: "zai", label: "GLM (z.ai)", hint: "สร้างคีย์ที่ z.ai" },
  { id: "meta", label: "Meta (Muse)", hint: "สร้างคีย์ที่ dev.meta.ai (Model API dashboard)" },
];

const HEAD: Record<SettingsSection, { title: string; hint: string }> = {
  ai: {
    title: "AI ที่ใช้สร้างโค้ด",
    hint:
      "ติดตั้ง ล็อกอิน หรือใส่คีย์ของ AI ที่จะใช้ และเลือกตัวที่โปรเจกต์ใหม่จะเริ่มด้วย " +
      "ในแต่ละโปรเจกต์สลับ AI และโมเดลได้ทุกข้อความ จากปุ่มในช่องพิมพ์ของแชต",
  },
  google: {
    title: "บัญชี Google ที่ใช้เผยแพร่",
    hint: "เครื่องมือที่สร้างเสร็จจะถูกเผยแพร่เข้าบัญชี Google นี้ ยังไม่เชื่อมก็สร้างและดูตัวอย่างได้ก่อน",
  },
  style: {
    title: "สไตล์เริ่มต้น",
    hint:
      "AI จะใช้ค่าพวกนี้กับทุกโปรเจกต์ใหม่ แต่ละโปรเจกต์ตั้งต่างออกไปได้ และบอก AI ในแชทเพื่อเปลี่ยนก็ได้ " +
      "ส่วนกฎด้านความปลอดภัยและข้อจำกัดของ Google Apps Script เปลี่ยนจากตรงนี้ไม่ได้",
  },
  remote: {
    title: "ใช้จากมือถือ",
    hint: "เปิดคอมทิ้งไว้ แล้วใช้มือถือสั่ง AI ดูพรีวิว และเผยแพร่ได้จากที่ไหนก็ได้ ไม่ต้องลงแอปในมือถือ",
  },
  premium: {
    title: "Pro",
    hint: "ปลดล็อกให้ AI สร้างเว็บแอปที่ใช้กล้องได้ และเชื่อมบัญชี GitHub ที่จะใช้วางหน้าเว็บ",
  },
  support: {
    title: "ช่วยเหลือ",
    hint: "ติดตรงไหนถามได้ ผู้ใช้ Pro ส่ง Fast Track ถึงแอดมินได้จากหน้านี้ คนอื่นถามในเว็บบอร์ดได้ฟรี",
  },
  data: {
    title: "ข้อมูลในเครื่อง",
    hint: "ที่เก็บข้อมูลของแอปบนเครื่องนี้",
  },
};

/** One line about this install for a Fast Track question: version, Windows, the AI in use (no keys, no paths). */
async function machineInfo(): Promise<string> {
  const settings = await getSettings();
  const ai = settings.engine === "api" ? `API ${settings.provider}` : `${settings.engine}${settings.cliModel ? ` (${settings.cliModel})` : ""}`;
  const os = process.platform === "win32" ? "Windows" : process.platform;
  return `EasyGAS IDE ${APP_VERSION} · ${os} · AI: ${ai}`;
}

/** The remote section's data — for the person at the computer only ("remote" when a phone asks). */
async function loadRemoteSection() {
  if (await isRemoteRequest()) return "remote" as const;
  return remoteSnapshot();
}

/** The AI section's data. Keys stay on the server — the form only learns hasKey. */
async function loadAiSection() {
  const settings = await getSettings();
  const keys = await Promise.all(
    KEY_FORMS.map(async (k) => ({ ...k, hasKey: !!(await getApiKey(LLM_PROVIDERS.find((p) => keyIdFor(p) === k.id)!)) })),
  );
  const providers = LLM_PROVIDERS.map((p) => ({ id: p, label: providerConfig(p).label, keyId: keyIdFor(p) }));
  return { settings, keys, providers };
}

export default async function SettingsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const section = pickSection(sp, SECTIONS, "ai");
  // only the visible section's data is loaded (the status feeds the nav badges on every section)
  const [status, ai, settings, premium, remote] = await Promise.all([
    getSetupStatus(),
    section === "ai" ? loadAiSection() : null,
    section === "style" ? getSettings() : null,
    section === "premium" || section === "remote" || section === "support" ? premiumStatus() : null,
    section === "remote" ? loadRemoteSection() : null,
  ]);

  return (
    <SettingsShell current={section} from={pickFrom(sp)} status={status} title={HEAD[section].title} hint={HEAD[section].hint}>
      {ai && (
        <EngineForm
          engine={ai.settings.engine}
          provider={ai.settings.provider}
          cliModel={ai.settings.cliModel}
          claudeQuota={isOn(ai.settings.app[CLAUDE_QUOTA_SETTING])}
          providers={ai.providers}
          keys={ai.keys}
          claudeFound={findClaudeExecutable() !== null}
          codexFound={findCodexExecutable() !== null}
          museFound={findMuseExecutable() !== null}
        />
      )}

      {section === "google" && (
        <>
          <GoogleConnect loggedIn={status.google.loggedIn} email={status.google.email} />
          <GoogleConnectGuide open={!status.google.loggedIn} />
        </>
      )}

      {settings && <StylePrefsForm value={resolvePrefs(settings.prefs, null)} onSave={savePrefsAction} />}

      {section === "premium" && premium && <PremiumSection status={premium} />}

      {section === "support" && premium && <SupportSection pro={premium.active} machineInfo={await machineInfo()} />}

      {section === "remote" &&
        (remote === "remote" ? (
          <p className="card px-4 py-3 text-sm text-fg">หน้านี้ตั้งค่าได้บนคอมเท่านั้น เพื่อไม่ให้มือถือที่หลุดมือไปเปลี่ยน PIN หรือจับคู่เครื่องอื่นเพิ่มได้</p>
        ) : (
          remote && (
            <RemoteSection
              initial={remoteView(remote, !!premium?.active)}
            />
          )
        ))}

      {section === "data" && (
        <>
          <AppUpdateCard version={APP_VERSION} enabled={await autoUpdateEnabled()} state={await readUpdateState()} />
          <p className="card break-all px-4 py-3 font-mono text-[13px] text-fg">{dataRoot()}</p>
          <p className="hint mt-2">โปรเจกต์ทั้งหมดและการตั้งค่าของคุณเก็บอยู่ในโฟลเดอร์นี้ ไม่ได้ส่งไปเก็บที่อื่น</p>
          <UninstallApp
            available={findUninstaller({ env: process.env, platform: process.platform, execPath: process.execPath, exists: existsSync }) !== null}
          />
        </>
      )}
    </SettingsShell>
  );
}
