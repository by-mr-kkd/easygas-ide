import Link from "next/link";
import { AcademicCapIcon, ArrowDownTrayIcon, LinkIcon, SparklesIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { AppRail } from "@/components/AppRail";
import { AppStatusBar, shortEngineLabel } from "@/components/AppStatusBar";
import { AppTopBar } from "@/components/AppTopBar";
import { AnnouncementBanner } from "@/components/projects/AnnouncementBanner";
import { AppNudge } from "@/components/remote/AppNudge";
import { PoweredBy } from "@/components/PoweredBy";
import { RulebookAutoCheck } from "@/components/RulebookAutoCheck";
import { CloneFromLink } from "@/components/projects/CloneFromLink";
import { GoogleScriptsList } from "@/components/projects/GoogleScriptsList";
import { HomeGreeting } from "@/components/projects/HomeGreeting";
import { ProjectSidebar } from "@/components/projects/ProjectSidebar";
import { PromptComposer } from "@/components/projects/PromptComposer";
import { SetupChecklist } from "@/components/projects/SetupChecklist";
import { SharedLatest } from "@/components/projects/SharedLatest";
import { StartModeTabs, startModeFrom } from "@/components/projects/StartModeTabs";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getDeployedMap, listProjects } from "@/lib/projects";
import { premiumStatus } from "@/lib/premium/status";
import { getAppSetting } from "@/lib/settings";
import { shouldNudgeApp } from "@/lib/remote/nudge";
import { getSetupStatus } from "@/lib/setup-status";
import { listSharesRemote } from "@/lib/share/remote";
import { tourSeenKey } from "@/lib/tour";

export const metadata = { title: "หน้าหลัก — EasyGAS IDE" };

/** the other ways in, under the work box; each is a place the box's tabs or the rail also reach */
const ALT_STARTS = [
  { href: "/projects?mode=existing", Icon: ArrowDownTrayIcon, tone: "tone-info", title: "ดึงสคริปต์จาก Google มาแก้", hint: "เลือกจากบัญชีของคุณ ต้นฉบับเก็บในประวัติ ย้อนได้" },
  { href: "/projects?mode=clone", Icon: LinkIcon, tone: "tone-accent", title: "โคลนจากลิงก์แชร์", hint: "วางลิงก์ easygaside.tech/s/… ดูไฟล์และสิทธิ์ก่อนโคลน" },
  { href: "/styleshopping", Icon: Squares2X2Icon, tone: "tone-info", title: "ดูตัวอย่างหน้าตาก่อน", hint: "เลือกสไตล์หน้าจอที่ชอบ แล้วค่อยเล่าระบบ" },
  { href: "/knowledge?s=lessons", Icon: AcademicCapIcon, tone: "tone-ai", title: "สิ่งที่ AI เรียนรู้จากคุณ", hint: "กฎและบทเรียนที่ AI จำไว้ใช้กับทุกโปรเจกต์" },
] as const;

/**
 * The home screen as an app window: the left rail, the project panel, and the work area — a box with the
 * three ways to start (describe something new, pull a script down from Google `?mode=existing`, clone a
 * share `?mode=clone`, also where easygas://clone/<slug> arrives), then other ways in and the newest shares
 * from the website. The status bar along the bottom says what the app is set up with.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [projects, deployed, setup, tourSeen, params, appNudge, shared, premium] = await Promise.all([
    listProjects(),
    getDeployedMap(),
    getSetupStatus(),
    getAppSetting(tourSeenKey("home")),
    searchParams,
    shouldNudgeApp().catch(() => false),
    listSharesRemote("new").catch(() => null),
    premiumStatus().catch(() => ({ active: false })),
  ]);
  const mode = startModeFrom(params.mode);
  // the easygas://clone/<slug> protocol lands here with the slug (electron/main.js)
  const cloneLink = typeof params.clone === "string" ? params.clone.slice(0, 300) : "";

  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg md:h-screen md:overflow-hidden">
      <AppTopBar
        pro={premium.active}
        center={<span className="truncate text-sm font-semibold">หน้าหลัก</span>}
        right={
          <>
            <ThemeToggle className="md:hidden" />
            <GuidedTour tour="home" seen={tourSeen === "1"} />
          </>
        }
      />

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <AppRail active={mode === "existing" ? "google" : "home"} />

        {/* the project panel: beside the work area on a wide window, under it on a phone */}
        <div className="order-2 flex min-w-0 flex-col md:order-1 md:min-h-0">
          <ProjectSidebar projects={projects} deployed={deployed} googleConnected={setup.google.loggedIn} />
        </div>

        {/* relative: an absolutely placed child (an sr-only label) anchors here, not to the page, so the window never scrolls */}
        <section className="relative order-1 min-w-0 flex-1 md:order-2 md:min-h-0 md:overflow-y-auto md:bg-main">
          <div className="mx-auto flex w-full max-w-5xl flex-col gap-5 px-4 py-5 md:px-7 md:py-6">
            {appNudge && <AppNudge />}
            {(!setup.engineReady || !setup.google.loggedIn) && <SetupChecklist setup={setup} />}

            {mode !== "existing" && (
              <HomeGreeting now={Date.now()} projects={projects.length} deployed={projects.filter((p) => deployed[p.id]).length} />
            )}

            {/* the Google screen has its own framed list, so the box around it is dropped there (no frame in a frame) */}
            <section className={mode === "existing" ? "" : "card overflow-hidden"} aria-live="polite">
              {/* the Google screen (rail → Google) is the scripts list alone, without the start tabs */}
              {mode !== "existing" && (
                <div className="flex flex-wrap items-center gap-2 border-b border-line bg-sunken px-3 py-2">
                  <StartModeTabs active={mode} />
                  <Link
                    href="/settings?s=ai"
                    title="AI ที่ใช้ตอนนี้ · กดเพื่อเปลี่ยน"
                    className={`btn btn-ghost btn-sm ml-auto hidden sm:inline-flex ${setup.engineReady ? "" : "text-warn-text"}`}
                  >
                    <SparklesIcon className="h-4 w-4 text-ai" aria-hidden />
                    {setup.engineReady ? shortEngineLabel(setup.engineLabel) : "ตั้งค่า AI"}
                  </Link>
                </div>
              )}
              <div className={mode === "existing" ? "" : "p-4 sm:p-5"}>
                {mode === "new" ? (
                  <PromptComposer engineReady={setup.engineReady} />
                ) : mode === "clone" ? (
                  <>
                    <h1 className="text-xl font-semibold sm:text-[22px]">โคลนจากลิงก์แชร์</h1>
                    <p className="hint mt-0.5">วางลิงก์ easygaside.tech/s/… ที่คนอื่นแชร์ไว้ ดูไฟล์และสิทธิ์ที่ขอก่อน แล้วโคลนเป็นโปรเจกต์ในเครื่องนี้</p>
                    <CloneFromLink initialLink={cloneLink} />
                  </>
                ) : (
                  <>
                    <h1 className="text-xl font-semibold sm:text-[22px]">สคริปต์ในบัญชี Google</h1>
                    <p className="hint mt-0.5">เลือกตัวที่จะแก้ โปรแกรมดึงโค้ดลงมาเป็นโปรเจกต์ในเครื่อง ต้นฉบับถูกเก็บในประวัติ ย้อนกลับได้ทุกเมื่อ</p>
                    {setup.google.loggedIn ? (
                      <GoogleScriptsList />
                    ) : (
                      <div className="callout callout-warn mt-4 flex-wrap items-center">
                        <span className="min-w-0 flex-1">ต้องเชื่อมบัญชี Google ก่อน ถึงจะเห็นสคริปต์ในบัญชี</span>
                        <Link href="/settings?s=google" className="btn btn-primary btn-sm">
                          เชื่อมบัญชี Google
                        </Link>
                      </div>
                    )}
                  </>
                )}
              </div>
            </section>

            {/* the Google tab is the scripts list only: these two have their own screens (and the other tabs) */}
            {mode !== "existing" && (
              <div className="grid gap-6 lg:grid-cols-2">
                <section aria-labelledby="alt-title" className="min-w-0">
                  <h2 id="alt-title" className="mb-1 text-[12.5px] font-semibold text-muted">
                    เริ่มแบบอื่น
                  </h2>
                  <ul className="-mx-2 flex flex-col">
                    {ALT_STARTS.map((a) => (
                      <li key={a.href}>
                        <Link href={a.href} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-sunken">
                          <span className={`icon-chip shrink-0 ${a.tone}`}>
                            <a.Icon className="h-4 w-4" aria-hidden />
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-[13.5px] font-medium leading-snug">{a.title}</span>
                            <span className="block truncate text-[11.5px] leading-snug text-muted">{a.hint}</span>
                          </span>
                        </Link>
                      </li>
                    ))}
                  </ul>
                </section>
                <SharedLatest list={shared} />
              </div>
            )}

            <AnnouncementBanner />
            <div className="md:hidden">
              <PoweredBy />
            </div>
          </div>
        </section>
      </div>

      <AppStatusBar setup={setup} />
      <RulebookAutoCheck />
    </main>
  );
}
