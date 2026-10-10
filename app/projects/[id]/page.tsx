import { notFound } from "next/navigation";
import { IdeShell } from "@/components/ide/IdeShell";
import { getAiOptions, resolveChoice } from "@/lib/ai-options";
import { listProjectChatImages } from "@/lib/chat-images";
import { getFiles } from "@/lib/files";
import { isProjectBusy } from "@/lib/agent-lock";
import { getStoredRows } from "@/lib/messages";
import { chatHistoryOf } from "@/lib/messages-text";
import { remoteSnapshot } from "@/lib/remote/runtime";
import { remoteDeviceOf } from "@/lib/remote/turn-notify";
import { headers } from "next/headers";
import { resolvePrefs, sanitizePrefs } from "@/lib/preferences";
import { getDeployedMap, getProject, listProjects } from "@/lib/projects";
import { getSettings } from "@/lib/settings";
import { getSetupStatus } from "@/lib/setup-status";
import { tourSeenKey } from "@/lib/tour";
import { CLAUDE_QUOTA_SETTING } from "@/lib/engines/claude-quota";

const isOn = (v: string | undefined) => v === "on" || v === "true" || v === "1";
import { routeTarget, type CapabilityNeeds } from "@/lib/deployment-targets/router";
import { premiumStatus } from "@/lib/premium/status";
import { sheetUrl } from "@/lib/bound";
import { unreadAnswers } from "@/lib/support/fast-track";
import { machineInfo } from "@/lib/support/machine-info";
import { githubStatus } from "@/lib/pages/github-auth";

export default async function ProjectBuilderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) notFound();

  const [files, setup, aiOptions, aiChoice, chatImages, allProjects, deployedMap, settings, premium, github, chatRows] = await Promise.all([
    getFiles(id),
    getSetupStatus(),
    getAiOptions(project),
    resolveChoice(project, null),
    listProjectChatImages(id),
    listProjects(),
    getDeployedMap(),
    getSettings(),
    premiumStatus().catch(() => ({ active: false })),
    githubStatus().catch(() => ({ available: false, connected: false })),
    getStoredRows(id).catch(() => []),
  ]);
  const remote = await remoteSnapshot().catch(() => null);
  // Pro, opened from a paired phone that has not turned notifications on yet
  const phone = remoteDeviceOf(await headers());
  const pushNudge = !!(premium.active && phone && remote?.devices.some((d) => d.id === phone && !d.push));
  const switcherProjects = allProjects.map((p) => ({ id: p.id, name: p.name, deployed: !!deployedMap[p.id] }));

  // honest hint when the project asked for a capability GAS can't serve (web target). Recomputed here, not
  // read from the spec frozen at creation: with Pro + GitHub (or a project already on GitHub Pages) the
  // live camera IS served, so it must not be listed as a missing capability.
  const spec = (project.spec ?? {}) as { capabilityNeeds?: CapabilityNeeds; webOnlyReasons?: unknown };
  const cameraAllowed = project.hosting === "github" || (premium.active && github.connected);
  const route = spec.capabilityNeeds && typeof spec.capabilityNeeds === "object" ? routeTarget(spec.capabilityNeeds, { cameraAllowed }) : null;
  const reasons = route ? (route.notImplemented ? route.reasons : []) : Array.isArray(spec.webOnlyReasons) ? (spec.webOnlyReasons as string[]) : [];
  const webHint = reasons.length > 0 ? reasons : undefined;

  return (
    <IdeShell
      projectId={id}
      projectName={project.name}
      pro={premium.active}
      bound={
        project.kind === "bound"
          ? { sheetUrl: project.bound_sheet_id && project.bound_push ? sheetUrl(project.bound_sheet_id) : null, scriptId: project.script_id }
          : null
      }
      support={premium.active ? { machineInfo: await machineInfo(), unread: await unreadAnswers().catch(() => 0) } : null}
      imported={project.origin === "imported"}
      tourSeen={settings.app[tourSeenKey("ide")] === "1"}
      claudeQuotaAllowed={isOn(settings.app[CLAUDE_QUOTA_SETTING])}
      initialFiles={files.map((f) => ({ path: f.path, content: f.content }))}
      initialImages={chatImages.map((img) => ({ url: img.url }))}
      initialMessages={chatHistoryOf(chatRows)}
      initialRunning={isProjectBusy(id)}
      remoteDevices={remote?.enabled ? remote.devices.length : null}
      pushNudge={pushNudge}
      webHint={webHint}
      googleConnected={setup.google.loggedIn}
      googleEmail={setup.google.email}
      aiOptions={aiOptions}
      aiChoice={aiChoice}
      energyUsed={0}
      energyTank={undefined}
      deployedUrl={project.deployment?.exec_url ?? null}
      projects={switcherProjects}
      stylePrefs={sanitizePrefs(project.prefs)}
      styleDefaults={resolvePrefs(settings.prefs, null)}
    />
  );
}
