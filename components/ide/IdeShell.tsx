"use client";

import { type CSSProperties, type PointerEvent as ReactPointerEvent, useEffect, useState } from "react";
import Link from "next/link";
import {
  ChatBubbleLeftRightIcon,
  CodeBracketIcon,
  Cog6ToothIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  MagnifyingGlassIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import { AppTopBar } from "@/components/AppTopBar";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { QuotaStatus } from "./QuotaStatus";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMediaQuery } from "@/components/ui/useIsDark";
import type { AiChoice } from "@/lib/ai-choice";
import type { AiOption } from "@/lib/ai-options";
import { DEFAULT_PREFS, type StylePrefs } from "@/lib/preferences";
import { aiLabel } from "./AiPicker";
import { ChatPanel } from "./ChatPanel";
import { CommandPalette } from "./CommandPalette";
import { ConnectGoogleDialog } from "./ConnectGoogleDialog";
import { DeployButton } from "./DeployButton";
import { ShareButton } from "./ShareButton";
import { DeployedUrlBar } from "./DeployedUrlBar";
import { EditorPane } from "./EditorPane";
import { EditorToolbar } from "./EditorToolbar";
import { IssuesPanel } from "./IssuesPanel";
import { ProjectSwitcher, type SwitcherProject } from "./ProjectSwitcher";
import { FileTree } from "./FileTree";
import { PreviewPane } from "./PreviewPane";
import { AppNudge } from "@/components/remote/AppNudge";

type Pane = "chat" | "code" | "preview";
/** What sits beside the chat on a wide window. "split" needs room for three columns (xl and up). */
type View = "preview" | "code" | "split";

const PANEL = "min-h-0 flex-col overflow-hidden bg-surface";
const VIEW_KEY = "egs:view";
const VIEWS: { id: View; label: string; Icon: typeof EyeIcon; wideOnly?: boolean }[] = [
  { id: "preview", label: "พรีวิว", Icon: EyeIcon },
  { id: "code", label: "โค้ด", Icon: CodeBracketIcon },
  { id: "split", label: "คู่กัน", Icon: ViewColumnsIcon, wideOnly: true },
];

export function IdeShell({
  projectId,
  projectName,
  initialFiles,
  initialImages,
  initialMessages,
  initialRunning = false,
  remoteDevices = null,
  pushNudge = false,
  webHint,
  googleConnected = true,
  googleEmail = null,
  aiOptions = [],
  aiChoice: initialAiChoice = null,
  energyUsed = 0,
  energyTank,
  deployedUrl,
  projects = [],
  stylePrefs = {},
  styleDefaults = DEFAULT_PREFS,
  imported = false,
  tourSeen = false,
  claudeQuotaAllowed = false,
}: {
  projectId: string;
  imported?: boolean;
  /** The IDE tour was shown before (from the settings file). */
  tourSeen?: boolean;
  /** Settings → AI: the user allowed reading Claude's quota. */
  claudeQuotaAllowed?: boolean;
  projectName: string;
  initialFiles: { path: string; content: string }[];
  initialImages?: { url: string }[];
  /** The conversation so far (lib/messages-text chatHistoryOf), and whether an AI turn is running right now. */
  initialMessages?: { role: "user" | "assistant"; text: string }[];
  initialRunning?: boolean;
  /** Remote access is on (lib/remote): how many phones are paired; null when it is off. */
  remoteDevices?: number | null;
  /** Pro, opened from a paired phone that has no notifications yet: point it to the Pro app to turn them on. */
  pushNudge?: boolean;
  webHint?: string[];
  googleConnected?: boolean;
  googleEmail?: string | null;
  /** The AIs this project's chat can use, and the one picked last time (or the default from Settings). */
  aiOptions?: AiOption[];
  aiChoice?: AiChoice | null;
  energyUsed?: number;
  energyTank?: number;
  deployedUrl?: string | null;
  projects?: SwitcherProject[];
  /** This project's own look & feel choices, and the user's defaults they fall back to. */
  stylePrefs?: Partial<StylePrefs>;
  styleDefaults?: StylePrefs;
}) {
  // the picked AI lives in the store (chat box, re-check and status bar all read it); seed it before
  // the first render of the children, so a message sent on arrival already carries it
  useState(() => useProjectStore.setState({ aiChoice: initialAiChoice }));
  const aiChoice = useProjectStore((s) => s.aiChoice);
  const pickedAi = aiOptions.find((o) => aiChoice && o.engine === aiChoice.engine && (o.engine !== "api" || o.provider === aiChoice.provider));
  const engineReady = pickedAi?.ready ?? false;
  const setInitial = useProjectStore((s) => s.setInitial);
  const activePath = useProjectStore((s) => s.activePath);
  const fileCount = useProjectStore((s) => s.order.length);
  const chatActive = useProjectStore((s) => s.chatActive);
  const setPaletteOpen = useProjectStore((s) => s.setPaletteOpen);
  // the file the agent is writing right now (null when idle) — drives the narrow-window code-tab pulse
  const workingPath = useProjectStore((s) => s.workingPath);
  // editor-triggered agent actions (ทดสอบรันจริง / ซ่อมจาก issues panel) are dispatched as a store
  // command and run inside ChatPanel, streaming into the chat pane — watch it to jump there.
  const command = useProjectStore((s) => s.command);
  const actionRequest = useProjectStore((s) => s.actionRequest);
  const clearActionRequest = useProjectStore((s) => s.clearActionRequest);
  const requestAction = useProjectStore((s) => s.requestAction);
  const [hintOpen, setHintOpen] = useState(true);
  const [deployUrl, setDeployUrl] = useState<string | null>(deployedUrl ?? null);
  const [google, setGoogle] = useState({ connected: googleConnected, email: googleEmail });
  const [connectOpen, setConnectOpen] = useState(false);
  // narrow window (below lg): one pane at a time, switched by the bottom tabs
  const [pane, setPane] = useState<Pane>("chat");
  // wide window: what sits beside the chat
  const [view, setView] = useState<View>("preview");
  const roomForSplit = useMediaQuery("(min-width: 1280px)");
  const effView: View = view === "split" && !roomForSplit ? "code" : view;
  const codeBusy = !!workingPath && pane !== "code";
  // width (px) of the preview pane in the "คู่กัน" view — dragged via the splitter
  const [previewW, setPreviewW] = useState(440);
  const [resizing, setResizing] = useState(false);

  // An empty project that nobody has talked to yet shows ONE start screen, not three empty panes.
  const isStart = fileCount === 0 && !chatActive;

  useEffect(() => {
    setInitial(initialFiles);
  }, [initialFiles, setInitial]);
  useEffect(() => {
    try {
      const saved = localStorage.getItem(VIEW_KEY);
      if (saved === "preview" || saved === "code" || saved === "split") setView(saved);
    } catch {
      /* storage unavailable — keep the default */
    }
  }, []);
  // "ทดสอบรันจริง" / fix-from-issues stream their result into the chat pane — jump there so the user
  // actually sees it on a narrow window, where only one pane is visible at a time.
  useEffect(() => {
    if (command) setPane("chat");
  }, [command]);
  // command palette → "เผยแพร่" while Google is not connected
  useEffect(() => {
    if (actionRequest !== "connectGoogle") return;
    clearActionRequest();
    setConnectOpen(true);
  }, [actionRequest, clearActionRequest]);

  function chooseView(next: View) {
    setView(next);
    try {
      localStorage.setItem(VIEW_KEY, next);
    } catch {
      /* not remembered — fine */
    }
  }

  /** Show a pane wherever the window is: the bottom tab when narrow, the side view when wide. */
  function jumpPane(p: Pane) {
    setPane(p);
    if (p === "code" && effView === "preview") chooseView("code");
    if (p === "preview" && effView === "code") chooseView("preview");
  }

  const onDesktop = (p: Pane) => p === "chat" || effView === "split" || effView === p;
  const paneClass = (p: Pane) =>
    `${PANEL} ${pane === p ? "flex" : "max-lg:hidden"} ${onDesktop(p) ? "lg:flex" : "lg:hidden"}`;
  const TAB = (active: boolean) =>
    `relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[13px] transition ${
      active ? "bg-accent-soft font-semibold text-accent-text" : "font-medium text-muted hover:bg-sunken hover:text-fg"
    }`;

  // drag the splitter (pointer-capture so dragging OVER the preview iframe still tracks + releases)
  function startResize(e: ReactPointerEvent<HTMLDivElement>) {
    e.preventDefault();
    const el = e.currentTarget;
    const startX = e.clientX;
    const startW = previewW;
    el.setPointerCapture(e.pointerId);
    setResizing(true);
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMove = (ev: PointerEvent) => {
      const maxW = Math.min(820, window.innerWidth - 700);
      setPreviewW(Math.min(Math.max(startW - (ev.clientX - startX), 300), Math.max(maxW, 320)));
    };
    const end = (ev: PointerEvent) => {
      el.releasePointerCapture?.(ev.pointerId);
      el.removeEventListener("pointermove", onMove);
      el.removeEventListener("pointerup", end);
      el.removeEventListener("pointercancel", end);
      setResizing(false);
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
    };
    el.addEventListener("pointermove", onMove);
    el.addEventListener("pointerup", end);
    el.addEventListener("pointercancel", end);
  }

  // the two monthly-plan AIs have a quota to show: the status bar on a wide window, under the chat box on a phone
  const quotaEngine = engineReady && (aiChoice?.engine === "codex-cli" || aiChoice?.engine === "claude-cli") ? aiChoice.engine : null;
  const wide = useMediaQuery("(min-width: 1024px)");

  const settingsHref = (section: string) => `/settings?s=${section}&from=${projectId}`;

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <AppTopBar
        center={<ProjectSwitcher currentId={projectId} currentName={projectName} projects={projects} />}
        right={
          <>
            <button
              type="button"
              onClick={() => setPaletteOpen(true)}
              title="ค้นหาไฟล์ หรือสั่งงาน (Ctrl+K)"
              data-tour="search"
              className="btn btn-ghost btn-sm max-md:w-[1.875rem] max-md:px-0"
            >
              <MagnifyingGlassIcon className="h-4 w-4" />
              <span className="hidden md:inline">ค้นหา</span>
              <span className="kbd hidden xl:inline-flex">Ctrl+K</span>
            </button>
            {!isStart && (
              <div className="seg hidden lg:inline-flex" role="group" aria-label="สิ่งที่แสดงข้างแชต" data-tour="views">
                {VIEWS.filter((v) => !v.wideOnly || roomForSplit).map((v) => (
                  <button key={v.id} type="button" aria-pressed={effView === v.id} onClick={() => chooseView(v.id)} className="seg-item">
                    <v.Icon className="h-4 w-4" />
                    {v.label}
                  </button>
                ))}
              </div>
            )}
            <ThemeToggle className="btn-sm max-sm:hidden" />
            <Link href={settingsHref("ai")} title="ตั้งค่า" aria-label="ตั้งค่า" className="btn btn-ghost btn-sm btn-icon">
              <Cog6ToothIcon className="h-[18px] w-[18px]" />
            </Link>
            {!isStart && <GuidedTour tour="ide" seen={tourSeen} className="btn-sm max-sm:hidden" />}
            {!isStart && <ShareButton projectId={projectId} projectName={projectName} className="max-md:w-[1.875rem] max-md:px-0" />}
            <span data-tour="deploy" className="flex shrink-0 items-center">
              <DeployButton
                projectId={projectId}
                googleConnected={google.connected}
                googleEmail={google.email}
                deployed={!!deployUrl}
                onDeployed={setDeployUrl}
                onConnectGoogle={() => setConnectOpen(true)}
              />
            </span>
          </>
        }
      />

      {/* live /exec URL + its actions */}
      {deployUrl && <DeployedUrlBar url={deployUrl} projectId={projectId} googleEmail={google.email} />}

      {webHint && webHint.length > 0 && hintOpen && (
        <div className="callout callout-warn flex-none rounded-none border-x-0 border-t-0">
          <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
          <div className="min-w-0 flex-1">
            งานนี้ดูเหมือนต้องใช้สิ่งที่ Google Apps Script ทำไม่ได้: <b>{webHint.join(" · ")}</b>
            <br />
            ตอนนี้จะสร้างเป็น Google Apps Script ให้ก่อน ส่วนนั้นจะยังไม่ทำงาน
          </div>
          <button onClick={() => setHintOpen(false)} className="btn btn-ghost btn-sm btn-icon shrink-0" aria-label="ปิด">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* BODY — the chat is always the first column; the view decides what sits beside it */}
      <div
        className={`grid min-h-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] ${
          isStart
            ? ""
            : effView === "split"
              ? "lg:grid-cols-[340px_minmax(0,1fr)_7px_var(--preview-w,440px)]"
              : "lg:grid-cols-[minmax(320px,380px)_minmax(0,1fr)]"
        }`}
        style={{ "--preview-w": `${previewW}px` } as CSSProperties}
      >
        <section data-tour="chat" className={`${isStart ? `${PANEL} flex bg-transparent` : `${paneClass("chat")} border-line lg:border-r`}`}>
          {pushNudge && <AppNudge strip />}
          <ChatPanel
            projectId={projectId}
            start={isStart}
            initialImages={initialImages}
            initialMessages={initialMessages}
            initialRunning={initialRunning}
            energyUsed={energyUsed}
            energyTank={energyTank}
            aiOptions={aiOptions}
            settingsHref={settingsHref("ai")}
            stylePrefs={stylePrefs}
            styleDefaults={styleDefaults}
            imported={imported}
            footnote={
              quotaEngine && !wide ? (
                <QuotaStatus engine={quotaEngine} claudeAllowed={claudeQuotaAllowed} settingsHref={settingsHref("ai")} quiet />
              ) : undefined
            }
          />
        </section>

        {!isStart && (
          <>
            <section data-tour="code" className={paneClass("code")}>
              <FileTree />
              <EditorToolbar projectId={projectId} />
              <div className="min-h-0 flex-1">
                <EditorPane />
              </div>
              <IssuesPanel />
            </section>

            {effView === "split" && (
              <div
                onPointerDown={startResize}
                title="ลากเพื่อปรับความกว้างของพรีวิว"
                className="group relative hidden cursor-col-resize touch-none bg-surface lg:block"
              >
                <span
                  className={`absolute inset-y-0 left-1/2 -translate-x-1/2 transition-all ${
                    resizing ? "w-[3px] bg-accent" : "w-px bg-line group-hover:w-[3px] group-hover:bg-accent"
                  }`}
                />
              </div>
            )}

            <section data-tour="preview" className={paneClass("preview")}>
              <PreviewPane />
            </section>
          </>
        )}
      </div>

      {/* STATUS BAR (wide window) — only facts the user can act on. A phone shows the quota under the chat box. */}
      <footer className="hidden h-7 flex-none items-center gap-1 border-t border-line bg-surface px-2 text-xs text-muted lg:flex">
        {google.connected ? (
          <Tooltip label="บัญชี Google ที่ใช้เผยแพร่ กดเพื่อเปลี่ยน" placement="top" className="max-lg:hidden">
            <Link href={settingsHref("google")} className="flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-accent" />
              Google: {google.email ?? "เชื่อมแล้ว"}
            </Link>
          </Tooltip>
        ) : (
          <button
            type="button"
            onClick={() => setConnectOpen(true)}
            className="flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg max-lg:hidden"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
            ยังไม่ได้เชื่อม Google
          </button>
        )}
        <span className="h-3.5 w-px bg-line max-lg:hidden" aria-hidden />
        <Tooltip
          label={engineReady ? "AI ที่ใช้อยู่ตอนนี้ เปลี่ยนได้ที่ปุ่มในช่องพิมพ์" : (pickedAi?.hint ?? "ยังไม่มี AI ที่ใช้ได้")}
          placement="top"
          className="max-lg:hidden"
        >
          <Link
            href={settingsHref("ai")}
            className={`flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg ${engineReady ? "" : "font-semibold text-warn-text"}`}
          >
            <span className={`h-1.5 w-1.5 rounded-full ${engineReady ? "bg-ai" : "bg-warn-line"}`} />
            {engineReady ? `AI: ${aiLabel(aiOptions, aiChoice)}` : "AI ยังใช้ไม่ได้ กดเพื่อตั้งค่า"}
          </Link>
        </Tooltip>
        {quotaEngine && wide && (
          <QuotaStatus engine={quotaEngine} claudeAllowed={claudeQuotaAllowed} settingsHref={settingsHref("ai")} />
        )}
        <span className="flex-1" />
        {remoteDevices !== null && (
          <Tooltip label="เปิดให้มือถือสั่งงานอยู่ กดเพื่อดูหรือปิด" placement="top" className="max-lg:hidden">
            <Link href={settingsHref("remote")} className="flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg">
              <span className="h-1.5 w-1.5 rounded-full bg-info" />
              รีโมท · {remoteDevices} เครื่อง
            </Link>
          </Tooltip>
        )}
        {fileCount > 0 && <span className="px-1.5 max-lg:hidden">{fileCount} ไฟล์</span>}
        {activePath && effView !== "preview" && <span className="truncate px-1.5 font-mono max-lg:hidden">{activePath}</span>}
      </footer>

      {/* PANE TABS (narrow window) — a wide window shows the panes side by side instead */}
      {!isStart && (
        // hidden while the phone keyboard is up (a short window): the chat box needs the room
        <nav className="flex flex-none items-center gap-1 border-t border-line bg-surface px-2 py-1.5 lg:hidden [@media(max-height:520px)]:hidden">
          <button type="button" onClick={() => setPane("chat")} aria-pressed={pane === "chat"} className={TAB(pane === "chat")}>
            <ChatBubbleLeftRightIcon className="h-4 w-4 shrink-0" />
            แชต
          </button>
          <button type="button" onClick={() => setPane("preview")} aria-pressed={pane === "preview"} className={TAB(pane === "preview")}>
            <EyeIcon className="h-4 w-4 shrink-0" />
            พรีวิว
          </button>
          <button type="button" onClick={() => setPane("code")} aria-pressed={pane === "code"} className={TAB(pane === "code")}>
            <CodeBracketIcon className={`h-4 w-4 shrink-0 ${codeBusy ? "animate-pulse" : ""}`} />
            โค้ด
            {codeBusy && <span className="absolute right-3 top-1.5 h-2 w-2 animate-pulse rounded-full bg-accent" />}
          </button>
        </nav>
      )}

      <CommandPalette projectId={projectId} googleConnected={google.connected} deployed={!!deployUrl} onJumpPane={jumpPane} />
      <ConnectGoogleDialog
        open={connectOpen}
        projectId={projectId}
        onClose={() => setConnectOpen(false)}
        onConnected={(email) => {
          setGoogle({ connected: true, email });
          setConnectOpen(false);
          if (fileCount > 0) requestAction("deploy"); // carry on with what the user was trying to do
        }}
      />
    </main>
  );
}
