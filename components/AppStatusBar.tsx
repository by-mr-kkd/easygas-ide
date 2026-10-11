import Link from "next/link";
import { ArrowPathIcon, CheckCircleIcon, DevicePhoneMobileIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import { WhatsNewLink } from "@/components/WhatsNewLink";
import { QuotaStatus } from "@/components/ide/QuotaStatus";
import { FacebookIcon, GitHubIcon } from "@/components/ui/BrandIcons";
import { readUpdateState } from "@/lib/app-update";
import { CLAUDE_QUOTA_SETTING } from "@/lib/engines/claude-quota";
import { LINKS, whatsNewUrl } from "@/lib/links";
import { APP_VERSION } from "@/lib/rulebook/store";
import { remoteSnapshot } from "@/lib/remote/runtime";
import { getBoolSetting } from "@/lib/settings";
import type { SetupStatus } from "@/lib/setup-status";

/** "Claude Code (สมาชิกรายเดือน)" → "Claude Code": the bar has room for the name only */
export const shortEngineLabel = (label: string): string => label.replace(/\s*\(.*\)\s*$/, "");

const ITEM = "flex h-full items-center gap-1.5 whitespace-nowrap px-2 transition hover:bg-line hover:text-fg";

function Item({ href, tone = "muted", title, children }: { href: string; tone?: "muted" | "warn"; title?: string; children: React.ReactNode }) {
  return (
    <Link href={href} title={title} className={`${ITEM} ${tone === "warn" ? "text-warn-text" : ""}`}>
      {children}
    </Link>
  );
}

/**
 * The strip along the bottom of a wide window, as programs have. Left: what the app is set up with
 * (Google, the AI, the AI's quota left), each a link to where it is changed. Right: use from a phone,
 * the version / update, and the credits — About, the users' Facebook group, the source on GitHub — the
 * same links the page footer had. A phone has the tab bar there instead.
 *
 * It never overflows the window: the right half keeps its width and its words fall away before its
 * icons do (full wording from xl, labels on the brand links from 2xl); the left half shrinks and clips
 * last, so the corner the eye goes to is always there.
 */
export async function AppStatusBar({ setup }: { setup: SetupStatus }) {
  const [remote, update, claudeQuotaAllowed] = await Promise.all([
    remoteSnapshot().catch(() => null),
    readUpdateState().catch(() => null),
    getBoolSetting(CLAUDE_QUOTA_SETTING, false).catch(() => false),
  ]);
  const online = remote?.enabled && remote.phase === "on";
  const devices = remote?.devices.length ?? 0;
  // the real state, for free and Pro alike (both can use it from a phone)
  const phoneLabel = !remote?.enabled
    ? "ปิดอยู่"
    : remote.phase === "on"
      ? `ออนไลน์${devices ? ` · ${devices} เครื่อง` : " · ยังไม่จับคู่"}`
      : remote.phase === "error"
        ? "เชื่อมไม่สำเร็จ"
        : "กำลังเชื่อม…";
  // the two monthly-plan AIs have a quota to show
  const quotaEngine = setup.engineReady && (setup.engine === "codex-cli" || setup.engine === "claude-cli") ? setup.engine : null;

  // a version newer than this one is downloading or waiting to be installed
  const newer = (update?.status === "ready" || update?.status === "downloading") && update.version ? update.version : null;
  const updateLabel =
    update?.status === "ready" && update.version
      ? `${update.version} พร้อมแล้ว · ปิดแล้วเปิดใหม่`
      : update?.status === "downloading" && update.version
        ? `กำลังโหลด ${update.version}…`
        : update?.current
          ? `v${update.current}${update.status === "latest" ? " · ล่าสุดแล้ว" : ""}`
          : null;
  // the same, in the few words a narrower window has room for
  const updateShort =
    update?.status === "ready" && update.version
      ? `${update.version} พร้อมแล้ว`
      : update?.status === "downloading" && update.version
        ? `โหลด ${update.version}…`
        : update?.current
          ? `v${update.current}`
          : null;

  return (
    <footer
      aria-label="สถานะ"
      className="hidden h-[26px] shrink-0 items-stretch overflow-hidden border-t border-line bg-panel2 px-1 text-[11.5px] text-muted md:flex"
    >
      {/* left: the setup — gives way first (shrinks, then clips) when the window is narrow */}
      <div className="flex min-w-0 flex-1 items-stretch overflow-hidden">
        <Item href="/settings?s=google" title={setup.google.loggedIn ? "Google: เชื่อมแล้ว" : "Google: ยังไม่เชื่อม"}>
          <CheckCircleIcon className={`h-3.5 w-3.5 ${setup.google.loggedIn ? "text-accent-text" : "text-faint"}`} aria-hidden />
          <span className="hidden lg:inline">{setup.google.loggedIn ? "Google: เชื่อมแล้ว" : "Google: ยังไม่เชื่อม"}</span>
          <span className="lg:hidden">Google</span>
        </Item>
        <Item href="/settings?s=ai" tone={setup.engineReady ? "muted" : "warn"}>
          {setup.engineReady ? <span className="h-1.5 w-1.5 rounded-full bg-ai" aria-hidden /> : <ExclamationTriangleIcon className="h-3.5 w-3.5" aria-hidden />}
          {setup.engineReady ? `AI: ${shortEngineLabel(setup.engineLabel)}` : "ตั้งค่า AI ก่อนเริ่มสร้าง"}
        </Item>
        {quotaEngine && (
          <div className="flex min-w-0 items-center px-0.5">
            <QuotaStatus engine={quotaEngine} claudeAllowed={claudeQuotaAllowed} settingsHref="/settings?s=ai" />
          </div>
        )}
      </div>

      {/* right: keeps its width; words drop before icons */}
      <div className="flex shrink-0 items-stretch">
        <Item href="/settings?s=remote" title={`ใช้จากมือถือ: ${phoneLabel}`}>
          <DevicePhoneMobileIcon className={`h-3.5 w-3.5 ${online ? "text-accent-text" : "text-faint"}`} aria-hidden />
          <span className="hidden xl:inline">ใช้จากมือถือ: </span>
          {phoneLabel}
        </Item>
        {updateLabel && (
          <Item href="/settings?s=data" tone={update?.status === "ready" ? "warn" : "muted"} title={updateLabel}>
            <ArrowPathIcon className="h-3.5 w-3.5" aria-hidden />
            <span className="hidden xl:inline">{updateLabel}</span>
            <span className="xl:hidden">{updateShort}</span>
          </Item>
        )}
        {/* the news thread of the version in use — or of the newer one on its way (then it greets once per launch) */}
        <span className={newer ? "contents" : "hidden lg:contents"}>
          <WhatsNewLink href={whatsNewUrl(newer ?? (update?.current || APP_VERSION))} fresh={!!newer} className={ITEM} />
        </span>
        <span className="my-1.5 w-px bg-line" aria-hidden />
        <Item href="/about" title="เกี่ยวกับ EasyGAS IDE · Powered by Mr.KKD">
          <span className="hidden xl:inline">Powered by&nbsp;</span>
          <span className="font-semibold text-fg">Mr.KKD</span>
        </Item>
        <a href={LINKS.facebookGroup} target="_blank" rel="noopener noreferrer" title="กลุ่ม Facebook ผู้ใช้ EasyGAS" aria-label="กลุ่ม Facebook ผู้ใช้ EasyGAS" className={ITEM}>
          <FacebookIcon className="h-3.5 w-3.5 text-[#1877F2]" />
          <span className="hidden 2xl:inline">กลุ่ม Facebook</span>
        </a>
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" title="โค้ดและเวอร์ชันบน GitHub" aria-label="โค้ดและเวอร์ชันบน GitHub" className={ITEM}>
          <GitHubIcon className="h-3.5 w-3.5" />
          <span className="hidden 2xl:inline">GitHub</span>
        </a>
      </div>
    </footer>
  );
}
