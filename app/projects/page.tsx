import Link from "next/link";
import { AppRail } from "@/components/AppRail";
import { AppStatusBar } from "@/components/AppStatusBar";
import { AppTopBar } from "@/components/AppTopBar";
import { AnnouncementBanner } from "@/components/projects/AnnouncementBanner";
import { AppNudge } from "@/components/remote/AppNudge";
import { PoweredBy } from "@/components/PoweredBy";
import { RulebookAutoCheck } from "@/components/RulebookAutoCheck";
import { CloneFromLink } from "@/components/projects/CloneFromLink";
import { GoogleScriptsList } from "@/components/projects/GoogleScriptsList";
import { ProjectTable } from "@/components/projects/ProjectTable";
import { SharesView } from "@/components/shares/SharesView";
import { SetupChecklist } from "@/components/projects/SetupChecklist";
import { startModeFrom } from "@/components/projects/StartModeTabs";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { getDeployedMap, listProjects } from "@/lib/projects";
import { busyProjectIds } from "@/lib/agent-lock";
import { premiumStatus } from "@/lib/premium/status";
import { githubStatus } from "@/lib/pages/github-auth";
import { getAppSetting } from "@/lib/settings";
import { shouldNudgeApp } from "@/lib/remote/nudge";
import { getSetupStatus } from "@/lib/setup-status";
import { tourSeenKey } from "@/lib/tour";
import { getFile } from "@/lib/files";
import { runUrlFor } from "@/lib/run-link";
import { HubHome } from "@/components/hub/HubHome";

export const metadata = { title: "โปรเจกต์ — EasyGAS IDE" };

/**
 * The home screen: the list of projects (filter, search, rename, delete) and the three ways in — a new
 * project (a name first; the AI comes after, on the code screen), a script from the user's Google account
 * (`?mode=existing`) or a share link (`?mode=clone`, also where easygas://clone/<slug> arrives).
 * Two screens in all: this one and the code screen.
 */
export default async function ProjectsPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [projects, deployed, setup, tourSeen, params, appNudge, premium, github] = await Promise.all([
    listProjects(),
    getDeployedMap(),
    getSetupStatus(),
    getAppSetting(tourSeenKey("home")),
    searchParams,
    shouldNudgeApp().catch(() => false),
    premiumStatus().catch(() => ({ active: false })),
    githubStatus().catch(() => ({ available: false, connected: false })),
  ]);
  // the link each card opens: GitHub Pages, else run.easygaside.tech for a public app (lib/run-link.ts), else /exec / the Sheet
  const execs: Record<string, string> = {};
  for (const p of projects) {
    const url = deployed[p.id];
    if (p.deployment?.exec_url) execs[p.id] = p.deployment.exec_url;
    if (!url) continue;
    if (p.hosting === "github" && p.pages?.url) deployed[p.id] = p.pages.url;
    else deployed[p.id] = runUrlFor(url, (await getFile(p.id, "appsscript.json").catch(() => null))?.content) ?? url;
  }
  const mode = startModeFrom(params.mode);
  // projects the AI is working on right now (the list puts them first and keeps following)
  const busy = busyProjectIds();
  // the easygas://clone/<slug> protocol lands here with the slug (electron/main.js)
  const cloneLink = typeof params.clone === "string" ? params.clone.slice(0, 300) : "";

  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg md:h-screen md:overflow-hidden">
      <AppTopBar
        pro={premium.active}
        center={<span className="truncate text-sm font-semibold">โปรเจกต์</span>}
        right={
          <>
            <ThemeToggle className="md:hidden" />
            <GuidedTour tour="home" seen={tourSeen === "1"} />
          </>
        }
      />

      <div className="flex flex-1 flex-col md:min-h-0 md:flex-row">
        <AppRail active="home" />

        <section className="relative min-w-0 flex-1 md:min-h-0 md:overflow-y-auto md:bg-main">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-5 px-4 py-5 md:px-8 md:py-7">
            {appNudge && <AppNudge />}
            {(!setup.engineReady || !setup.google.loggedIn) && <SetupChecklist setup={setup} />}

            <ProjectTable projects={projects} deployed={deployed} execs={execs} busy={busy} openCreate={params.new === "1"} mode={mode} pro={premium.active} githubConnected={github.connected}>
              {mode === "clone" ? (
                <div className="card p-4 sm:p-5">
                  <p className="hint">วางลิงก์ easygaside.tech/s/… ที่คนอื่นแชร์ไว้ ดูไฟล์และสิทธิ์ที่ขอก่อน แล้วโคลนเป็นโปรเจกต์ในเครื่องนี้</p>
                  <CloneFromLink initialLink={cloneLink} />
                </div>
              ) : mode === "existing" ? (
                <>
                  <p className="hint">เลือกตัวที่จะแก้ โปรแกรมดึงโค้ดลงมาเป็นโปรเจกต์ในเครื่อง ต้นฉบับถูกเก็บในประวัติ ย้อนกลับได้ทุกเมื่อ</p>
                  {setup.google.loggedIn ? (
                    <GoogleScriptsList />
                  ) : (
                    <div className="callout callout-warn mt-3 flex-wrap items-center">
                      <span className="min-w-0 flex-1">ต้องเชื่อมบัญชี Google ก่อน ถึงจะเห็นสคริปต์ในบัญชี</span>
                      <Link href="/settings?s=google" className="btn btn-primary btn-sm">
                        เชื่อมบัญชี Google
                      </Link>
                    </div>
                  )}
                </>
              ) : mode === "shares" ? (
                <SharesView order={params.order === "clones" ? "clones" : "new"} />
              ) : mode === "hub" ? (
                <HubHome googleConnected={setup.google.loggedIn} initialHub={typeof params.hub === "string" ? params.hub.slice(0, 40) : null} />
              ) : null}
            </ProjectTable>

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
