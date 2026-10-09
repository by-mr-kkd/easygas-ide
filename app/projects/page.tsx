import Link from "next/link";
import { Cog6ToothIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { AppTopBar } from "@/components/AppTopBar";
import { AnnouncementBanner } from "@/components/projects/AnnouncementBanner";
import { AppNudge } from "@/components/remote/AppNudge";
import { PoweredBy } from "@/components/PoweredBy";
import { RulebookAutoCheck } from "@/components/RulebookAutoCheck";
import { CloneFromLink } from "@/components/projects/CloneFromLink";
import { GoogleScriptsList } from "@/components/projects/GoogleScriptsList";
import { ProjectSidebar } from "@/components/projects/ProjectSidebar";
import { PromptComposer } from "@/components/projects/PromptComposer";
import { SetupChecklist } from "@/components/projects/SetupChecklist";
import { StartModeTabs, startModeFrom } from "@/components/projects/StartModeTabs";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getDeployedMap, listProjects } from "@/lib/projects";
import { getAppSetting } from "@/lib/settings";
import { shouldNudgeApp } from "@/lib/remote/nudge";
import { getSetupStatus } from "@/lib/setup-status";
import { tourSeenKey } from "@/lib/tour";

export const metadata = { title: "โปรเจกต์ของฉัน — EasyGAS IDE" };

/**
 * The home screen: the projects already here on the left (one click to open), and on the right the three
 * ways to start — describe something new, pull a script down from Google (`?mode=existing`), or clone code
 * someone shared as an EasyGAS link (`?mode=clone`, also where easygas://clone/<slug> arrives).
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [projects, deployed, setup, tourSeen, params, appNudge] = await Promise.all([
    listProjects(),
    getDeployedMap(),
    getSetupStatus(),
    getAppSetting(tourSeenKey("home")),
    searchParams,
    shouldNudgeApp().catch(() => false),
  ]);
  const mode = startModeFrom(params.mode);
  // the easygas://clone/<slug> protocol lands here with the slug (electron/main.js)
  const cloneLink = typeof params.clone === "string" ? params.clone.slice(0, 300) : "";

  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg">
      <AppTopBar
        center={<span className="truncate text-sm font-semibold">โปรเจกต์ของฉัน</span>}
        right={
          <>
            <Link href="/styleshopping" title="ตัวอย่างสไตล์" aria-label="ตัวอย่างสไตล์" className="btn btn-ghost btn-sm max-md:hidden">
              <Squares2X2Icon className="h-4 w-4 text-info" />
              <span className="hidden sm:inline">ตัวอย่างสไตล์</span>
            </Link>
            <Link href="/settings?s=ai" title="ตั้งค่า" aria-label="ตั้งค่า" data-tour="settings" className="btn btn-ghost btn-icon max-md:hidden">
              <Cog6ToothIcon className="h-5 w-5" />
            </Link>
            <ThemeToggle />
            <GuidedTour tour="home" seen={tourSeen === "1"} />
          </>
        }
      />

      <div className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-6 sm:px-6 sm:py-8">
        {appNudge && <AppNudge />}
        {(!setup.engineReady || !setup.google.loggedIn) && <SetupChecklist setup={setup} />}

        {/* the sidebar sits first on a wide window and under the composer on a narrow one */}
        <div className="grid gap-6 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div className="order-2 min-w-0 lg:order-1">
            <ProjectSidebar projects={projects} deployed={deployed} googleConnected={setup.google.loggedIn} />
          </div>

          <div className="order-1 min-w-0 lg:order-2">
            <StartModeTabs active={mode} />
            <section className="card rounded-t-none p-4 sm:p-6" aria-live="polite">
              {mode === "new" ? (
                <>
                  <h1 className="text-2xl font-semibold">อยากได้ระบบอะไร?</h1>
                  <p className="hint mt-1">เล่าเป็นภาษาพูดได้ AI จะเขียนโค้ดและทำหน้าจอตัวอย่างให้ดูก่อน</p>
                  <div className="mt-4">
                    <PromptComposer engineReady={setup.engineReady} foldExamples={projects.length > 0} />
                  </div>
                </>
              ) : mode === "clone" ? (
                <>
                  <h1 className="text-2xl font-semibold">โคลนจากลิงก์แชร์</h1>
                  <p className="hint mt-1">วางลิงก์ easygaside.tech/s/… ที่คนอื่นแชร์ไว้ ดูไฟล์และสิทธิ์ที่ขอก่อน แล้วโคลนเป็นโปรเจกต์ในเครื่องนี้</p>
                  <CloneFromLink initialLink={cloneLink} />
                </>
              ) : (
                <>
                  <h1 className="text-2xl font-semibold">สคริปต์ในบัญชี Google</h1>
                  <p className="hint mt-1">
                    เลือกตัวที่จะแก้ โปรแกรมดึงโค้ดลงมาเป็นโปรเจกต์ในเครื่อง ต้นฉบับถูกเก็บในประวัติ ย้อนกลับได้ทุกเมื่อ
                  </p>
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
            </section>
            <AnnouncementBanner />
          </div>
        </div>
      </div>
      <PoweredBy />
      <RulebookAutoCheck />
    </main>
  );
}
