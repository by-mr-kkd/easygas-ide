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
  SparklesIcon,
  SwatchIcon,
  UserIcon,
  ViewColumnsIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import { AppTopBar } from "@/components/AppTopBar";
import { HelpButton } from "@/components/ide/HelpDialog";
import { BoundSheetBar } from "@/components/ide/BoundSheetBar";
import { hasDoGet } from "@/lib/bound";
import { GuidedTour } from "@/components/tour/GuidedTour";
import { QuotaStatus } from "./QuotaStatus";
import { ThemeSwitch } from "@/components/ui/ThemeToggle";
import { Tooltip } from "@/components/ui/Tooltip";
import { useMediaQuery } from "@/components/ui/useIsDark";
import type { AiChoice } from "@/lib/ai-choice";
import type { AiOption } from "@/lib/ai-options";
import { DEFAULT_PREFS, type StylePrefs } from "@/lib/preferences";
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
import { PreviewTools } from "./PreviewTools";
import { AppNudge } from "@/components/remote/AppNudge";
import { PhoneButton } from "@/components/remote/PhoneButton";
import { PhoneDialog } from "@/components/remote/PhoneDialog";
import { PhoneInvite, usePhoneInvite } from "@/components/remote/PhoneInvite";
import { usePhoneRemote } from "@/components/remote/usePhoneRemote";
import type { RemoteView } from "@/app/settings/remote-actions";

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

/**
 * The IDE screen. Three bands of chrome, each with one job:
 *   title bar (48px)  — where you are (project) and who you are (phone remote · Google account · theme);
 *                       in the desktop app it is also the window's drag region
 *   toolbar  (40px)   — what you can do: search · project style · guide, the tools of the pane shown
 *                       beside the chat (file tabs + editor buttons, the preview's device/console), แชร์, เผยแพร่
 *   rail (wide, 60px) — which pane sits beside the chat (พรีวิว / โค้ด / คู่กัน) and a switch that folds the chat
 * The panes themselves carry no headers. A narrow window has no rail: the bottom tabs pick the pane.
 */
export function IdeShell({
  projectId,
  projectName,
  pro = false,
  support = null,
  bound = null,
  initialFiles,
  initialImages,
  initialMessages,
  initialRunning = false,
  phone = null,
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
  /** this install has Pro: the top bar shows the tag */
  pro?: boolean;
  /** Pro: the help button's Fast Track (machine line for the question, answers not opened yet) */
  support?: { machineInfo: string; unread: number } | null;
  /** kind "bound": the project's script lives in a Google Sheet (sheetUrl once it has been published) */
  bound?: { sheetUrl: string | null; scriptId: string | null } | null;
  initialFiles: { path: string; content: string }[];
  initialImages?: { url: string }[];
  /** The conversation so far (lib/messages-text chatHistoryOf), and whether an AI turn is running right now. */
  initialMessages?: { role: "user" | "assistant"; text: string }[];
  initialRunning?: boolean;
  /** "ใช้จากมือถือ" as it is now (lib/remote/view); null when this page was opened from a phone */
  phone?: RemoteView | null;
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
  // the picked AI lives in the store (chat box and re-check both read it); seed it before
  // the first render of the children, so a message sent on arrival already carries it
  useState(() => useProjectStore.setState({ aiChoice: initialAiChoice }));
  const aiChoice = useProjectStore((s) => s.aiChoice);
  const pickedAi = aiOptions.find((o) => aiChoice && o.engine === aiChoice.engine && (o.engine !== "api" || o.provider === aiChoice.provider));
  const engineReady = pickedAi?.ready ?? false;
  const setInitial = useProjectStore((s) => s.setInitial);
  const fileCount = useProjectStore((s) => s.order.length);
  // a project in a Sheet serves a page only when it has a doGet: then it is published as a web app too
  const hasPage = useProjectStore((s) => hasDoGet(Object.entries(s.files).map(([path, f]) => ({ path, content: f.content }))));
  const sheetOnly = !!bound && !hasPage;
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
  const [sheetUrl, setSheetUrl] = useState<string | null>(bound?.sheetUrl ?? null);
  const [google, setGoogle] = useState({ connected: googleConnected, email: googleEmail });
  const [connectOpen, setConnectOpen] = useState(false);
  const phoneRemote = usePhoneRemote(phone);
  const [phoneOpen, setPhoneOpen] = useState(false);
  const invite = usePhoneInvite(phoneRemote.v);
  // narrow window (below lg): one pane at a time, switched by the bottom tabs
  const [pane, setPane] = useState<Pane>("chat");
  // wide window: what sits beside the chat, and whether the chat column is open at all
  const [view, setView] = useState<View>("preview");
  const [chatOpen, setChatOpen] = useState(true);
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
  // actually sees it: the bottom tab on a narrow window, the (possibly folded) chat column on a wide one.
  useEffect(() => {
    if (!command) return;
    setPane("chat");
    setChatOpen(true);
  }, [command]);
  // command palette → "เผยแพร่" while Google is not connected
  useEffect(() => {
    if (actionRequest !== "connectGoogle") return;
    clearActionRequest();
    setConnectOpen(true);
  }, [actionRequest, clearActionRequest]);
  // command palette → "ใช้จากมือถือ"
  useEffect(() => {
    if (actionRequest !== "phone") return;
    clearActionRequest();
    setPhoneOpen(true);
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
    if (p === "chat") setChatOpen(true);
    if (p === "code" && effView === "preview") chooseView("code");
    if (p === "preview" && effView === "code") chooseView("preview");
  }

  const onDesktop = (p: Pane) => (p === "chat" ? chatOpen : effView === "split" || effView === p);
  const paneClass = (p: Pane) =>
    `${PANEL} ${pane === p ? "flex" : "max-lg:hidden"} ${onDesktop(p) ? "lg:flex" : "lg:hidden"}`;
  const TAB = (active: boolean) =>
    `relative flex flex-1 items-center justify-center gap-1.5 rounded-md py-2 text-[13px] transition ${
      active ? "bg-accent-soft font-semibold text-accent-text" : "font-medium text-muted hover:bg-sunken hover:text-fg"
    }`;
  // the chat column is a fixed 340px (the toolbar's left zone is sized to end exactly at its edge)
  const gridCols = isStart
    ? ""
    : effView === "split"
      ? chatOpen
        ? "lg:grid-cols-[340px_minmax(0,1fr)_7px_var(--preview-w,440px)]"
        : "lg:grid-cols-[minmax(0,1fr)_7px_var(--preview-w,440px)]"
      : chatOpen
        ? "lg:grid-cols-[340px_minmax(0,1fr)]"
        : "lg:grid-cols-[minmax(0,1fr)]";

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

  // the two monthly-plan AIs have a quota to show — under the chat box, on every window size
  const quotaEngine = engineReady && (aiChoice?.engine === "codex-cli" || aiChoice?.engine === "claude-cli") ? aiChoice.engine : null;
  const wide = useMediaQuery("(min-width: 1024px)");

  const settingsHref = (section: string) => `/settings?s=${section}&from=${projectId}`;

  return (
    <main className="flex h-dvh flex-col overflow-hidden bg-bg text-fg">
      <AppTopBar
        pro={pro}
        center={<ProjectSwitcher currentId={projectId} currentName={projectName} projects={projects} />}
        right={
          <>
            {/* the identity corner: phone remote · Google account · theme, one bordered group */}
            <div className="flex h-8 items-center rounded-lg border border-line-strong bg-surface [&_.btn]:rounded-none [&>.btn:first-child]:rounded-l-[7px] [&>.btn:last-child]:rounded-r-[7px]">
              {phoneRemote.v && (
                <>
                  <PhoneButton v={phoneRemote.v} variant="icon" wave={invite.show} onClick={() => setPhoneOpen(true)} />
                  <span className="h-[18px] w-px bg-line" aria-hidden />
                </>
              )}
              {google.connected ? (
                <Link
                  href={settingsHref("google")}
                  title="บัญชี Google ที่ใช้เผยแพร่ กดเพื่อเปลี่ยน"
                  aria-label={`บัญชี Google: ${google.email ?? "เชื่อมแล้ว"} กดเพื่อเปลี่ยน`}
                  className="btn btn-ghost btn-sm gap-2 pl-1.5 pr-2.5 font-normal text-fg"
                >
                  <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-text">
                    {(google.email?.[0] ?? "G").toUpperCase()}
                  </span>
                  <span className="hidden max-w-[220px] truncate md:inline">{google.email ?? "เชื่อมแล้ว"}</span>
                </Link>
              ) : (
                <button
                  type="button"
                  onClick={() => setConnectOpen(true)}
                  title="การเผยแพร่ต้องใช้บัญชี Google ของคุณ กดเพื่อเชื่อม"
                  className="btn btn-ghost btn-sm gap-2 pl-1.5 pr-2.5 font-normal"
                >
                  <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-sunken text-faint">
                    <UserIcon className="h-3.5 w-3.5" />
                  </span>
                  <span className="hidden md:inline">เชื่อม Google</span>
                </button>
              )}
              <span className="hidden h-[18px] w-px bg-line sm:block" aria-hidden />
              <ThemeSwitch className="mx-0.5 max-sm:hidden" />
            </div>
            {/* narrow window: there is no rail, so settings stays up here */}
            <Link href={settingsHref("ai")} title="ตั้งค่า" aria-label="ตั้งค่า" className="btn btn-ghost btn-sm btn-icon lg:hidden">
              <Cog6ToothIcon className="h-[18px] w-[18px]" />
            </Link>
          </>
        }
        toolbar={
          <>
            {/* left zone: as wide as rail + chat column, so the divider after it lines up with the chat's edge */}
            <div className={`flex min-w-0 items-center gap-1.5 ${!isStart && chatOpen ? "lg:min-w-[388px]" : ""}`}>
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
                <Tooltip label="ไลบรารีและหน้าตาที่ AI ใช้กับโปรเจกต์นี้" placement="bottom" className="shrink-0">
                  {/* the dialog is rendered inside the chat pane: bring that pane on screen before asking for it */}
                  <button
                    type="button"
                    onClick={() => {
                      setChatOpen(true);
                      setPane("chat");
                      requestAction("style");
                    }}
                    className="btn btn-ghost btn-sm"
                  >
                    <SwatchIcon className="h-4 w-4 text-info" />
                    <span className="hidden md:inline">สไตล์โปรเจกต์</span>
                    <span className="md:hidden">สไตล์</span>
                  </button>
                </Tooltip>
              )}
              {!isStart && <GuidedTour tour="ide" seen={tourSeen} className="btn-sm max-sm:hidden" />}
              {pro && support && <HelpButton project={{ id: projectId, name: projectName }} machineInfo={support.machineInfo} unread={support.unread} />}
            </div>
            {!isStart && <span className="hidden h-5 w-px shrink-0 bg-line lg:block" aria-hidden />}
            {/* the tools of whatever sits beside the chat: file tabs + editor buttons, and/or the preview's.
                The editor toolbar stays mounted (hidden) while only the preview shows: it owns the
                unsaved-changes warning and the palette's "ตรวจซ้ำ" request. */}
            {!isStart && wide && (
              // narrower than the tools (1024–1280px with the code view on): this zone scrolls sideways
              // instead of pushing แชร์ / เผยแพร่ off the edge
              <div className="flex min-w-0 items-center gap-1.5 overflow-x-auto [scrollbar-width:none]">
                <div className={effView === "preview" ? "hidden" : "flex min-w-0 shrink-0 items-center gap-1.5"}>
                  <FileTree variant="toolbar" />
                  <span className="h-5 w-px shrink-0 bg-line" aria-hidden />
                  <EditorToolbar projectId={projectId} canVerify={!sheetOnly} variant="toolbar" />
                </div>
                {effView === "split" && <span className="h-5 w-px shrink-0 bg-line" aria-hidden />}
                {effView !== "code" && (
                  <div className="shrink-0">
                    <PreviewTools />
                  </div>
                )}
              </div>
            )}
            <span className="min-w-2 flex-1" />
            {!isStart && <ShareButton projectId={projectId} projectName={projectName} className="shrink-0 max-md:w-[1.875rem] max-md:px-0" />}
            <span data-tour="deploy" className="flex shrink-0 items-center">
              <DeployButton
                projectId={projectId}
                googleConnected={google.connected}
                googleEmail={google.email}
                deployed={!!deployUrl || !!sheetUrl}
                empty={fileCount === 0}
                bound={!!bound}
                boundHasScript={!!bound?.scriptId}
                sheetOnly={sheetOnly}
                onBoundPublished={setSheetUrl}
                onDeployed={setDeployUrl}
                onConnectGoogle={() => setConnectOpen(true)}
              />
            </span>
          </>
        }
      />

      {/* live /exec URL + its actions */}
      {deployUrl && <DeployedUrlBar url={deployUrl} projectId={projectId} googleEmail={google.email} sheetUrl={sheetUrl} />}
      {!deployUrl && sheetUrl && <BoundSheetBar sheetUrl={sheetUrl} scriptId={bound?.scriptId ?? null} />}

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

      <div className="flex min-h-0 flex-1">
        {/* RAIL (wide window) — which pane sits beside the chat; the chat button folds the chat column */}
        {!isStart && (
          <nav aria-label="มุมมอง" className="hidden w-[60px] flex-none flex-col items-center gap-1 border-r border-line bg-panel px-1 py-2 lg:flex">
            <button
              type="button"
              onClick={() => setChatOpen((o) => !o)}
              aria-pressed={chatOpen}
              title={chatOpen ? "พับแผงแชต ให้พรีวิวหรือโค้ดเต็มจอ" : "เปิดแผงแชต"}
              className="rail-btn rail-toggle"
            >
              <SparklesIcon className="h-[18px] w-[18px]" />
              <span>แชต</span>
              {/* folded while the AI is writing: a pulse says there is something happening in there */}
              {!chatOpen && workingPath && <span className="absolute right-2 top-2 h-2 w-2 animate-pulse rounded-full bg-accent" aria-hidden />}
            </button>
            <span className="my-0.5 h-px w-7 bg-line" aria-hidden />
            <div className="flex flex-col items-center gap-1" role="group" aria-label="สิ่งที่แสดงข้างแชต" data-tour="views">
              {VIEWS.filter((v) => !v.wideOnly || roomForSplit).map((v) => (
                <button key={v.id} type="button" aria-pressed={effView === v.id} onClick={() => chooseView(v.id)} title={v.label} className="rail-btn">
                  <v.Icon className="h-[18px] w-[18px]" />
                  <span>{v.label}</span>
                </button>
              ))}
            </div>
            <span className="flex-1" />
            <Link href={settingsHref("ai")} title="ตั้งค่า" className="rail-btn">
              <Cog6ToothIcon className="h-[18px] w-[18px]" />
              <span>ตั้งค่า</span>
            </Link>
          </nav>
        )}

        {/* BODY — the chat is the first column (when open); the view decides what sits beside it */}
        <div
          className={`grid min-h-0 min-w-0 flex-1 grid-cols-1 grid-rows-[minmax(0,1fr)] ${gridCols}`}
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
                quotaEngine ? (
                  <div className="flex w-full items-center gap-3">
                    <QuotaStatus engine={quotaEngine} claudeAllowed={claudeQuotaAllowed} settingsHref={settingsHref("ai")} quiet={!wide} compact />
                    {wide && <span className="ml-auto text-faint">Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่</span>}
                  </div>
                ) : undefined
              }
            />
          </section>

          {!isStart && (
            <>
              <section data-tour="code" className={paneClass("code")}>
                {/* narrow window: the file tabs and editor buttons sit above the editor (a wide one has them in the toolbar row) */}
                {!wide && <FileTree />}
                {!wide && <EditorToolbar projectId={projectId} canVerify={!sheetOnly} />}
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
      </div>

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

      <CommandPalette
        projectId={projectId}
        googleConnected={google.connected}
        deployed={!!deployUrl || !!sheetUrl}
        canVerify={!sheetOnly}
        phone={!!phoneRemote.v}
        onJumpPane={jumpPane}
      />
      {phoneRemote.v && (
        <PhoneDialog open={phoneOpen} v={phoneRemote.v} onView={phoneRemote.setV} onClose={() => setPhoneOpen(false)} settingsHref={settingsHref("remote")} />
      )}
      {invite.show && !phoneOpen && (
        // the phone button lives in the title bar's corner on every window size now: the card drops down from it
        <PhoneInvite
          placement="top"
          onAccept={() => {
            invite.accept();
            setPhoneOpen(true);
          }}
          onLater={invite.later}
          onNever={invite.never}
        />
      )}
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
