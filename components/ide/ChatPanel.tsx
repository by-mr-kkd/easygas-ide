"use client";

import { ChatText } from "./ChatText";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BoltIcon,
  BugAntIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  EyeIcon,
  LightBulbIcon,
  PaperAirplaneIcon,
  PlusIcon,
  PhotoIcon,
  QueueListIcon,
  RocketLaunchIcon,
  SparklesIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getProjectPrefsAction, projectRunningAction, saveProjectLookAction, setProjectDemoAction } from "@/app/projects/actions";
import { STYLE_CATALOG, type StyleItem } from "@/lib/style-catalog";
import { BUILD_FROM_DEMO, BUILD_NOW, DEFAULT_LOOK, LOOK_COLORS, LOOK_FONTS, demoMessage, mergeAppBlocks, stripAppBlocks, type MockLook } from "@/lib/style-mockup";
import { useProjectStore } from "@/store/useProjectStore";
import { onTourPhase, tourPhase } from "@/components/tour/tour-phase";
import { compressImage, type CompressedImage } from "@/lib/client/image-compress";
import { saveDirtyFiles } from "@/lib/client/save-files";
import { Tooltip } from "@/components/ui/Tooltip";
import type { AiOption } from "@/lib/ai-options";
import { DEFAULT_PREFS, resolvePrefs, type StylePrefs } from "@/lib/preferences";
import { AiPicker } from "./AiPicker";
import { GuidedWizard } from "./GuidedWizard";
import { LessonOffers, type LessonOffer } from "./LessonOffers";
import { UpgradeDialog } from "@/components/premium/UpgradeDialog";
import { AuditCard } from "./AuditCard";
import { ProjectStyleDialog } from "./ProjectStyleDialog";
import { AiMark, TypingDots } from "./AiMark";

const MAX_IMAGES = 4;

interface ProjectSpec {
  title: string;
  summary: string;
  features: string[];
  dataModel?: string[];
  storage?: string;
  outputs?: string[];
}

// mirror of lib/anthropic-agent AgentEvent (defined locally to avoid pulling server-only code)
type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "status"; text: string }
  | { type: "tool_call"; name: string; input: unknown }
  | { type: "file_mutation"; op: "write" | "edit" | "delete"; path: string; content?: string }
  | { type: "lint"; messages: string[] }
  | { type: "lesson"; lesson: LessonOffer }
  | { type: "spec"; spec: ProjectSpec }
  | { type: "generation"; id: string }
  | { type: "done"; tokens?: number }
  | { type: "verdict"; ok: boolean; text: string }
  | { type: "camera_gate"; gate: CameraGateState; first?: boolean }
  | { type: "error"; message: string };

type CameraGateState = "allowed" | "need-github" | "need-premium";

const RUNNING_ELSEWHERE = "AI กำลังทำงานอยู่ (สั่งจากอีกหน้าจอ) เสร็จแล้วหน้านี้จะโหลดผลให้เอง…";
const RUNNING_POLL_MS = 4000;

interface ChatMsg {
  role: "user" | "assistant";
  text: string;
  images?: string[]; // data: URLs for local preview
}

const TOOL_LABEL: Record<string, string> = {
  write_file: "กำลังเขียนไฟล์",
  edit_file: "กำลังแก้ไฟล์",
  delete_file: "กำลังลบไฟล์",
  read_project: "กำลังอ่านโปรเจกต์",
  read_rule: "กำลังอ่านกฎ",
  save_preference: "กำลังบันทึกสิ่งที่คุณเลือก",
  propose_lesson: "กำลังเสนอบทเรียน",
};

// shown when the project already has code (reopened/deployed) — guide toward editing, not building anew
const EDIT_SUGGESTIONS = [
  "เพิ่มช่องค้นหา",
  "เพิ่มปุ่มลบรายการ",
  "ทำให้ใช้ง่ายบนมือถือ",
  "กดแล้วขึ้น error ช่วยแก้ให้",
];

/** Monthly "แต้ม" (credit) gauge = แต้มที่ใช้ไป / ทั้งหมด ของ pool รายเดือน (แชร์ทุกโปรเจกต์).
 *  1 แต้ม = 10k tokens; แสดง "ใช้ไป X/total" — bar เติมขึ้นตามการใช้, เขียว→แดงเมื่อใกล้เต็ม. รีเซ็ตรายเดือน. */
function EnergyBar({ used, tank }: { used: number; tank: number }) {
  const finite = Number.isFinite(tank) && tank > 0;
  const pctUsed = finite ? Math.max(0, Math.min(100, Math.round((used / tank) * 100))) : 0;
  const total = finite ? Math.floor(tank / 10000) : 0;
  const usedCredits = finite ? Math.min(total, Math.round(used / 10000)) : 0;
  const label = finite ? `ใช้ไป ${usedCredits}/${total} แต้ม` : "ไม่จำกัด";
  const fill = pctUsed < 60 ? "bg-accent" : pctUsed < 85 ? "bg-warn-line" : "bg-danger";
  return (
    <Tooltip
      label={finite ? `ใช้ไป ${usedCredits}/${total} แต้มเดือนนี้ รวมทุกเครื่องมือ รีเซ็ตต้นเดือนหน้า` : "ไม่จำกัด"}
      placement="bottom"
      className="w-full"
    >
      <div className="flex w-full items-center gap-2.5 rounded-lg border border-line bg-sunken px-3 py-2">
        <BoltIcon className="h-4 w-4 shrink-0 text-muted" />
        <span className="h-1.5 min-w-0 flex-1 overflow-hidden rounded-full bg-line">
          <span className={`block h-full rounded-full ${fill} transition-all`} style={{ width: `${pctUsed}%` }} />
        </span>
        <span className="shrink-0 text-xs font-medium text-muted">{label}</span>
      </div>
    </Tooltip>
  );
}

export function ChatPanel({
  projectId,
  demo: initialDemo = false,
  initialImages,
  initialMessages = [],
  initialRunning = false,
  energyUsed = 0,
  energyTank,
  aiOptions = [],
  settingsHref = "/settings?s=ai",
  stylePrefs = {},
  styleDefaults = DEFAULT_PREFS,
  imported = false,
  footnote,
}: {
  projectId: string;
  /** a script imported from the user's Google account: offer "วิเคราะห์โค้ด" */
  imported?: boolean;
  /** replaces the "Enter ส่ง" hint under the box (a phone: the AI quota — a phone has no Enter / Shift+Enter) */
  footnote?: ReactNode;
  /** The last build was a screen-only demo: offer to build it for real. */
  demo?: boolean;
  /** This project's own look & feel choices, and the user's defaults they fall back to. */
  stylePrefs?: Partial<StylePrefs>;
  styleDefaults?: StylePrefs;
  initialImages?: { url: string }[];
  /** The conversation so far, read from the project's history when the page opened. */
  initialMessages?: ChatMsg[];
  /** An AI turn was already running when the page opened (started on another screen, or before a reload). */
  initialRunning?: boolean;
  energyUsed?: number;
  energyTank?: number;
  /** The AIs the chat's picker offers (which are set up, their models). */
  aiOptions?: AiOption[];
  settingsHref?: string;
}) {
  const applyMutation = useProjectStore((s) => s.applyMutation);
  const setWorking = useProjectStore((s) => s.setWorking);
  const hasFiles = useProjectStore((s) => s.order.length > 0);
  const command = useProjectStore((s) => s.command);
  const consumeCommand = useProjectStore((s) => s.consumeCommand);
  const actionRequest = useProjectStore((s) => s.actionRequest);
  const clearActionRequest = useProjectStore((s) => s.clearActionRequest);
  const setChatActive = useProjectStore((s) => s.setChatActive);
  const aiChoice = useProjectStore((s) => s.aiChoice);
  // the picked AI as the picker lists it: whether it is set up, and what is missing when it is not
  const pickedAi = aiOptions.find((o) => aiChoice && o.engine === aiChoice.engine && (o.engine !== "api" || o.provider === aiChoice.provider));
  const engineReady = pickedAi ? pickedAi.ready : aiOptions.length === 0;
  const engineHint = pickedAi ? pickedAi.hint && `${pickedAi.label}: ${pickedAi.hint}` : "ยังไม่มี AI ที่ใช้ได้ เลือกจากปุ่มในช่องพิมพ์ หรือไปตั้งค่าก่อน";
  const [messages, setMessages] = useState<ChatMsg[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(initialRunning);
  const [status, setStatus] = useState(initialRunning ? RUNNING_ELSEWHERE : "");
  // energy lives in the store so a manual "ตรวจซ้ำ" (EditorToolbar) deducts from the same bar
  const energy = useProjectStore((s) => s.energy);
  const initEnergy = useProjectStore((s) => s.initEnergy);
  const addEnergy = useProjectStore((s) => s.addEnergy);
  const [pendingSpec, setPendingSpec] = useState<ProjectSpec | null>(null);
  // Gate-2 ("ทดสอบรันจริง") result, rendered as an icon card instead of an emoji in the text stream
  const [verdict, setVerdict] = useState<{ ok: boolean; text: string } | null>(null);
  // premium camera gate of the last turn (lib/premium/camera-gate) — a card under the AI's answer
  const [cameraGate, setCameraGate] = useState<{ gate: CameraGateState; first: boolean; activated?: boolean } | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [wizardOpen, setWizardOpen] = useState(false);
  // the start chips: "สร้างเดโม่ให้ดูก่อน" opens the second layer, "เลือกสี / ฟอนต์" the look picker in it
  const [demoOpen, setDemoOpen] = useState(false);
  // first open of an empty project: light up the chat box ("เริ่มไอเดียของคุณที่นี่"), once per project. It waits
  // for the guided tour (pending or on screen) so the two never draw over each other, and leaves when the
  // user starts, after a while, or when the tour is opened again.
  const [spot, setSpot] = useState(false);
  const spotEligible = !hasFiles && messages.length === 0 && !busy;
  useEffect(() => {
    if (!spotEligible) return;
    const key = `egs:spot:${projectId}`;
    try {
      if (localStorage.getItem(key) === "1") return;
    } catch {
      // storage blocked: the empty-project condition alone limits it
    }
    let showTimer: ReturnType<typeof setTimeout> | undefined;
    const arm = () => {
      clearTimeout(showTimer);
      if (tourPhase() !== "idle") return;
      showTimer = setTimeout(() => {
        if (tourPhase() !== "idle") return;
        setSpot(true);
        try {
          localStorage.setItem(key, "1");
        } catch {
          /* shown again next time — harmless */
        }
      }, 500);
    };
    // the tour decides whether to open on its own as the page mounts: give it that moment first
    const first = setTimeout(arm, 900);
    const off = onTourPhase((phase) => {
      if (phase === "idle") return arm();
      clearTimeout(showTimer);
      setSpot(false);
    });
    return () => {
      clearTimeout(first);
      clearTimeout(showTimer);
      off();
    };
  }, [spotEligible, projectId]);
  useEffect(() => {
    if (!spot) return;
    if (!spotEligible) return setSpot(false);
    const t = setTimeout(() => setSpot(false), 9000);
    return () => clearTimeout(t);
  }, [spot, spotEligible]);
  const [lookOpen, setLookOpen] = useState(false);
  const [demo, setDemo] = useState(initialDemo);
  const [needIdea, setNeedIdea] = useState(false);
  const draft = useProjectStore((s) => s.draft);
  const setDraft = useProjectStore((s) => s.setDraft);
  const look = useProjectStore((s) => s.look);
  const setLook = useProjectStore((s) => s.setLook);
  const stylePicks = useProjectStore((s) => s.stylePicks);
  const requestAction = useProjectStore((s) => s.requestAction);
  const [styleOpen, setStyleOpen] = useState(false);
  // lessons offered at the end of the last turn — pending until the user keeps or declines each one
  const [lessonOffers, setLessonOffers] = useState<LessonOffer[]>([]);
  const [projectStyle, setProjectStyle] = useState<Partial<StylePrefs>>(stylePrefs);
  const [images, setImages] = useState<CompressedImage[]>([]);
  const [attaching, setAttaching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo(0, bodyRef.current.scrollHeight);
  }, [messages, status, images]);

  // A turn this page did not start (another screen, or a reload cut its stream): its words and files
  // are not streaming here, so wait for it to finish and reload the page to show what it did.
  useEffect(() => {
    if (!initialRunning) return;
    let stop = false;
    const tick = async () => {
      if (stop) return;
      const running = await projectRunningAction(projectId).catch(() => true);
      if (stop) return;
      if (running) setTimeout(tick, RUNNING_POLL_MS);
      else window.location.reload();
    };
    const first = setTimeout(tick, RUNNING_POLL_MS);
    return () => {
      stop = true;
      clearTimeout(first);
    };
  }, [initialRunning, projectId]);

  // seed the energy bar from the server-computed usage (store is shared with the editor toolbar)
  useEffect(() => {
    initEnergy(energyUsed);
  }, [energyUsed, initEnergy]);

  // whether the conversation has begun (the shell and the style tab read it)
  useEffect(() => {
    setChatActive(messages.length > 0 || busy);
  }, [messages.length, busy, setChatActive]);
  useEffect(() => () => setChatActive(false), [setChatActive]);

  // Hand-offs from the screen the user came from, stashed in sessionStorage right before navigating
  // here (one-shot, so a refresh never replays them):
  //   egs:kickoff        a prompt to prefill (the user reviews it first)
  //   egs:kickoff-auto   send it at once (no screen sets this since the home screen asks for a name only;
  //                      kept so an older hand-off still works)
  //   egs:wizard         open "ถามทีละข้อ" on arrival
  useEffect(() => {
    const take = (k: string) => {
      const v = sessionStorage.getItem(k);
      if (v !== null) sessionStorage.removeItem(k);
      return v;
    };
    const prompt = take("egs:kickoff");
    const auto = take("egs:kickoff-auto") === "1";
    const wizard = take("egs:wizard") === "1";
    if (prompt) {
      if (auto && engineReady) send(prompt);
      else setInput(prompt);
    } else if (wizard) {
      setWizardOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // cross-pane commands: the editor toolbar / issues panel ask us to run the agent (fix or verify)
  // so it streams through the chat flow + updates the editor live. Consume immediately to avoid loops.
  useEffect(() => {
    if (!command || busy) return;
    const c = command;
    consumeCommand();
    if (c.kind === "verify") verify();
    else send(c.text);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [command, busy]);

  // toolbar row / command palette → "ไลบรารีและฟอนต์" (the dialog lives here, next to the chat it shapes)
  useEffect(() => {
    if (actionRequest !== "style") return;
    clearActionRequest();
    void openStyle();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRequest]);

  // the style tab hands text to the chat box: fill it, or add a block under what the user typed
  useEffect(() => {
    if (!draft) return;
    const d = draft;
    setDraft(null);
    setInput((cur) => (d.mode === "append" ? mergeAppBlocks(cur, d.text) : d.text));
    setNeedIdea(false);
    inputRef.current?.focus();
  }, [draft, setDraft]);

  // The AI can save a choice mid-chat (save_preference), so load the current ones before editing.
  async function openStyle() {
    try {
      setProjectStyle(await getProjectPrefsAction(projectId));
    } catch {
      /* keep what we have */
    }
    setStyleOpen(true);
  }

  async function onPickFiles(e: React.ChangeEvent<HTMLInputElement>) {
    const picked = Array.from(e.target.files ?? []);
    e.target.value = ""; // allow re-picking the same file
    if (picked.length === 0) return;
    const slots = MAX_IMAGES - images.length;
    if (slots <= 0) return;
    setAttaching(true);
    try {
      const next: CompressedImage[] = [];
      for (const file of picked.slice(0, slots)) {
        if (!file.type.startsWith("image/")) continue;
        try {
          next.push(await compressImage(file));
        } catch {
          /* skip an unreadable image */
        }
      }
      if (next.length) setImages((cur) => [...cur, ...next].slice(0, MAX_IMAGES));
    } finally {
      setAttaching(false);
    }
  }

  function appendAssistant(t: string) {
    setMessages((m) => {
      const c = [...m];
      const last = c[c.length - 1];
      if (last?.role === "assistant") c[c.length - 1] = { role: "assistant", text: last.text + t };
      return c;
    });
  }

  // Consume an SSE stream of AgentEvents (shared by chat send + Gate-2 verify — same protocol).
  async function pumpStream(res: Response) {
    if (!res.body) throw new Error("no body");
    const reader = res.body.getReader();
    const decoder = new TextDecoder();
    let buf = "";
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buf += decoder.decode(value, { stream: true });
      const frames = buf.split("\n\n");
      buf = frames.pop() ?? "";
      for (const frame of frames) {
        const line = frame.trim();
        if (!line.startsWith("data:")) continue;
        let ev: AgentEvent;
        try {
          ev = JSON.parse(line.slice(5).trim());
        } catch {
          continue;
        }
        if (ev.type === "text") appendAssistant(ev.delta);
        else if (ev.type === "status") setStatus(ev.text);
        else if (ev.type === "tool_call") {
          // real-time: show WHICH file the AI is touching (the tool input carries the path), and move
          // the editor's "working" highlight to it before its content even streams in.
          const path =
            ev.input && typeof ev.input === "object" ? (ev.input as { path?: string }).path : undefined;
          const label = TOOL_LABEL[ev.name] ?? ev.name;
          setStatus(path ? `${label} ${path}…` : `${label}…`);
          if (path && (ev.name === "write_file" || ev.name === "edit_file")) setWorking(path);
        }
        else if (ev.type === "file_mutation")
          applyMutation({ op: ev.op, path: ev.path, content: ev.content });
        else if (ev.type === "lint") setStatus(ev.messages.join(" · "));
        else if (ev.type === "spec") setPendingSpec(ev.spec);
        else if (ev.type === "lesson") {
          const offer = ev.lesson;
          setLessonOffers((cur) => (cur.some((o) => o.id === offer.id) ? cur : [...cur, offer]));
        }
        else if (ev.type === "verdict") setVerdict({ ok: ev.ok, text: ev.text });
        else if (ev.type === "camera_gate") setCameraGate({ gate: ev.gate, first: !!ev.first });
        else if (ev.type === "error") appendAssistant(`\n\n[ผิดพลาด: ${ev.message}]`);
        else if (ev.type === "done") {
          if (ev.tokens) addEnergy(ev.tokens);
          setStatus("");
          setWorking(null);
        }
      }
    }
  }

  async function send(text?: string, opts?: { withImages?: boolean }) {
    const msg = (text ?? input).trim();
    // staged images attach to a composer send, or to a chip that replaces the box's text (the demo chips)
    const attached = text === undefined || opts?.withImages ? images : [];
    if ((!msg && attached.length === 0) || busy) return;
    if (text === undefined) setInput("");
    if (attached.length > 0) setImages([]);
    setBusy(true);
    setStatus("");
    setPendingSpec(null);
    setVerdict(null);
    setCameraGate(null);
    setMessages((m) => [
      ...m,
      { role: "user", text: msg, images: attached.map((a) => a.dataUrl) },
      { role: "assistant", text: "" },
    ]);

    try {
      await saveDirtyFiles(projectId); // persist the user's manual edits before the AI reads/overwrites them
      const res = await fetch(`/api/agent/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: msg,
          images: attached.map((a) => ({ dataBase64: a.dataBase64, mediaType: a.mediaType })),
          // read at send time: the user may have switched AI since this render
          ai: useProjectStore.getState().aiChoice ?? undefined,
        }),
      });
      if (!res.ok) {
        // gate (403) / quota (429) and other errors carry a friendly Thai message
        let msg = "เชื่อมต่อล้มเหลว ลองใหม่อีกครั้ง";
        try {
          const j = (await res.json()) as { message?: string };
          if (j?.message) msg = j.message;
        } catch {
          /* non-JSON */
        }
        appendAssistant(`\n\n[${msg}]`);
        return;
      }
      await pumpStream(res);
    } catch {
      appendAssistant("\n\n[เชื่อมต่อล้มเหลว ลองใหม่อีกครั้ง]");
    } finally {
      setBusy(false);
      setStatus("");
      setWorking(null);
    }
  }

  // Gate 2 — open the live app, and repair+redeploy if it failed at runtime. Streams into the chat.
  async function verify() {
    if (busy) return;
    setBusy(true);
    setStatus("");
    setVerdict(null);
    setCameraGate(null);
    setMessages((m) => [...m, { role: "assistant", text: "" }]);
    try {
      await saveDirtyFiles(projectId); // persist manual edits before the repair loop runs on them
      const res = await fetch(`/api/verify/${projectId}`, { method: "POST" });
      if (!res.ok) {
        let m = "เชื่อมต่อล้มเหลว ลองใหม่อีกครั้ง";
        try {
          const j = (await res.json()) as { message?: string };
          if (j?.message) m = j.message;
        } catch {
          /* non-JSON */
        }
        appendAssistant(`[${m}]`);
        return;
      }
      await pumpStream(res);
    } catch {
      appendAssistant("\n\n[ทดสอบไม่สำเร็จ ลองใหม่อีกครั้ง]");
    } finally {
      setBusy(false);
      setStatus("");
      setWorking(null);
    }
  }

  function fillInput(text: string) {
    setInput(text);
    inputRef.current?.focus();
  }

  const canSend = !busy && (input.trim().length > 0 || images.length > 0);

  function markDemo(on: boolean) {
    setDemo(on);
    void setProjectDemoAction(projectId, on).catch(() => {});
  }

  /** what the user has said so far: the text in the box, or the conversation. Nothing yet → ask for one line. */
  function needsIdea(): boolean {
    if (input.trim() || messages.length > 0) return false;
    setNeedIdea(true);
    inputRef.current?.focus();
    return true;
  }

  // "เริ่มสร้างเลย"
  function buildNow() {
    if (needsIdea()) return;
    markDemo(false);
    if (input.trim() || images.length > 0) send();
    else send(BUILD_NOW);
  }

  // "สร้างเดโม่ให้ดูก่อน" → one of the second-layer choices
  function sendDemo(opts: { look?: MockLook | null; aiDesigns?: boolean }) {
    if (needsIdea()) return;
    const styles = stylePicks.map((id) => STYLE_CATALOG.find((c) => c.id === id)).filter((x): x is StyleItem => !!x);
    // the box may already hold the style block ("ใส่ในช่องแชท"): it goes in once, from the picks
    const msg = demoMessage({ description: stripAppBlocks(input), look: opts.look ?? null, styles, aiDesigns: opts.aiDesigns });
    if (opts.look) void saveProjectLookAction(projectId, opts.look).catch(() => {});
    markDemo(true);
    setDemoOpen(false);
    setLookOpen(false);
    setInput("");
    send(msg, { withImages: true });
  }

  // "ส่งรูปให้ดู": the box gets the demo request, the picker opens; the user sends with the pictures
  function demoFromImage() {
    if (needsIdea()) return;
    const styles = stylePicks.map((id) => STYLE_CATALOG.find((c) => c.id === id)).filter((x): x is StyleItem => !!x);
    setInput(demoMessage({ description: stripAppBlocks(input), look, styles, fromImage: true }));
    markDemo(true);
    setDemoOpen(false);
    fileRef.current?.click();
  }

  const pickLook = (patch: Partial<MockLook>) => setLook({ ...(look ?? DEFAULT_LOOK), ...patch });

  // the start chips: an empty project (or a demo waiting to become the real thing), nothing running
  const startChips = !busy && !hasFiles && (
    <div className="space-y-2" data-tour="start-chips">
      <p className="text-xs font-semibold text-muted">จะเริ่มแบบไหน</p>
      <div className="flex flex-wrap gap-1.5">
        <button type="button" onClick={buildNow} disabled={!engineReady} className="btn btn-primary btn-sm rounded-full">
          <SparklesIcon className="h-4 w-4" />
          เริ่มสร้างเลย
        </button>
        <button
          type="button"
          onClick={() => setDemoOpen((o) => !o)}
          aria-expanded={demoOpen}
          disabled={!engineReady}
          className="btn btn-soft tone-info btn-sm rounded-full"
        >
          <Squares2X2Icon className="h-4 w-4" />
          สร้างเดโม่ให้ดูก่อน
        </button>
        <button type="button" onClick={() => setWizardOpen(true)} className="btn btn-soft tone-ai btn-sm rounded-full">
          <QueueListIcon className="h-4 w-4" />
          ถามทีละข้อ
        </button>
      </div>
      {needIdea && <p className="callout callout-warn text-[13px]">เล่าสั้น ๆ ในช่องด้านล่างก่อนว่าอยากได้ระบบอะไร แล้วกดอีกครั้ง หรือหยิบตัวอย่างจากแท็บสไตล์</p>}

      {demoOpen && (
        <div className="card space-y-2 p-3">
          <div className="flex flex-wrap items-baseline gap-x-2">
            <span className="text-[13.5px] font-semibold">{stylePicks.length > 0 ? "ทำเดโม่จากสไตล์ที่เลือก" : "มีสไตล์ที่ชอบไหม"}</span>
            <span className="hint text-xs">เดโม่ = หน้าจออย่างเดียว ยังไม่ต่อข้อมูลจริง</span>
          </div>
          {stylePicks.length > 0 && (
            <div className="flex flex-wrap items-center gap-2 rounded-lg border border-accent bg-accent-soft/40 p-2.5">
              <span className="min-w-0 flex-1 text-[13px]">
                เลือกสไตล์ไว้แล้ว <b>{stylePicks.length} ชิ้น</b>{" "}
                <button type="button" onClick={() => requestAction("view:style")} className="link text-xs">
                  แก้ในแท็บสไตล์
                </button>
              </span>
              <button type="button" onClick={() => sendDemo({ look })} disabled={!engineReady} className="btn btn-primary btn-sm">
                <SparklesIcon className="h-4 w-4" />
                ทำเดโม่ตามนี้
              </button>
            </div>
          )}
          <div className={`rounded-lg border p-2.5 ${lookOpen ? "border-accent" : "border-line"}`}>
            <button type="button" onClick={() => setLookOpen((o) => !o)} aria-expanded={lookOpen} className="flex w-full items-center gap-2 text-left text-[13px] font-semibold">
              เลือกสี / ฟอนต์
              <span className="hint ml-auto text-xs font-normal">ตัวอย่างในแท็บสไตล์เปลี่ยนตาม</span>
            </button>
            {lookOpen && (
              <div className="mt-2 space-y-2">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="hint w-12 text-xs">สีหลัก</span>
                  {LOOK_COLORS.map((c) => {
                    const on = (look ?? DEFAULT_LOOK).color === c.hex;
                    return (
                      <button
                        key={c.id}
                        type="button"
                        aria-label={c.label}
                        aria-pressed={on}
                        title={c.label}
                        onClick={() => pickLook({ color: c.hex })}
                        className={`h-6 w-6 rounded-full border-2 border-surface ${on ? "ring-2 ring-accent" : "ring-1 ring-line-strong"}`}
                        style={{ background: c.hex }}
                      />
                    );
                  })}
                  <label className="flex items-center gap-1 text-xs text-muted">
                    <input type="color" value={(look ?? DEFAULT_LOOK).color} onChange={(e) => pickLook({ color: e.target.value })} className="h-6 w-7 cursor-pointer rounded border-0 bg-transparent p-0" aria-label="เลือกสีเอง" />
                    เลือกเอง
                  </label>
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="hint w-12 text-xs">ฟอนต์</span>
                  {LOOK_FONTS.map((f) => (
                    <button
                      key={f.family}
                      type="button"
                      aria-pressed={(look ?? DEFAULT_LOOK).font === f.family}
                      onClick={() => pickLook({ font: f.family })}
                      className="seg-item h-7 rounded-md border border-line-strong text-xs"
                    >
                      {f.family}
                    </button>
                  ))}
                </div>
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="hint w-12 text-xs">โทน</span>
                  <div className="seg">
                    <button type="button" aria-pressed={(look ?? DEFAULT_LOOK).tone === "light"} onClick={() => pickLook({ tone: "light" })} className="seg-item h-7 text-xs">
                      สว่าง
                    </button>
                    <button type="button" aria-pressed={(look ?? DEFAULT_LOOK).tone === "dark"} onClick={() => pickLook({ tone: "dark" })} className="seg-item h-7 text-xs">
                      มืด
                    </button>
                  </div>
                  <button type="button" onClick={() => sendDemo({ look: look ?? DEFAULT_LOOK })} className="btn btn-primary btn-sm ml-auto">
                    ทำเดโม่ด้วยสไตล์นี้
                  </button>
                </div>
              </div>
            )}
          </div>
          {/* the chat column is narrow (340px): one choice per line */}
          <div className="grid gap-1.5">
            <button type="button" onClick={demoFromImage} className="row-btn flex-col items-start gap-0.5 text-left">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <PhotoIcon className="h-4 w-4" />
                ส่งรูปให้ดู
              </span>
              <span className="hint text-xs">ภาพแอปที่ชอบ หรือวาดคร่าว ๆ</span>
            </button>
            {stylePicks.length === 0 && (
              <button type="button" onClick={() => requestAction("view:style")} className="row-btn flex-col items-start gap-0.5 text-left">
                <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                  <Squares2X2Icon className="h-4 w-4" />
                  เลือกจากสไตล์
                </span>
                <span className="hint text-xs">เปิดแท็บสไตล์ด้านขวา</span>
              </button>
            )}
            <button type="button" onClick={() => sendDemo({ look, aiDesigns: !look })} className="row-btn flex-col items-start gap-0.5 text-left">
              <span className="flex items-center gap-1.5 text-[13px] font-semibold">
                <SparklesIcon className="h-4 w-4 text-ai" />
                ให้ AI ออกแบบเลย
              </span>
              <span className="hint text-xs">เลือกให้เหมาะกับงานนี้</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );

  // a demo is on screen: make it the real thing, or keep shaping it
  const demoChips = !busy && hasFiles && demo && (
    <div className="flex flex-wrap items-center gap-1.5">
      <span className="hint mr-1 text-xs">นี่คือเดโม่ (ยังไม่ต่อข้อมูลจริง)</span>
      <button
        type="button"
        onClick={() => {
          markDemo(false);
          send(BUILD_FROM_DEMO);
        }}
        disabled={!engineReady}
        className="btn btn-primary btn-sm rounded-full"
      >
        <SparklesIcon className="h-4 w-4" />
        ใช้แบบนี้ สร้างระบบจริง
      </button>
      <button type="button" onClick={() => inputRef.current?.focus()} className="btn btn-secondary btn-sm rounded-full">
        ปรับเดโม่
      </button>
    </div>
  );

  // after an answer on a project with code: what to do next, as the APP's buttons (never read from the AI's text)
  const nextSteps = hasFiles && !busy && !demo && !pendingSpec && (
    <div className="space-y-1.5 pt-1">
      <p className="text-xs font-semibold text-muted">ทำอะไรต่อดี</p>
      <div className="flex flex-wrap items-center gap-1.5">
        <button type="button" onClick={() => requestAction("view:preview")} className="btn btn-secondary btn-sm">
          <EyeIcon className="h-4 w-4" />
          ดูพรีวิว
        </button>
        <button
          type="button"
          onClick={() => send("อธิบายว่าโค้ดในโปรเจกต์นี้ทำงานยังไง แบบสรุปสั้น ๆ เป็นข้อ ๆ")}
          disabled={!engineReady}
          title="ให้ AI สรุปเป็นข้อ ๆ ว่าโค้ดในโปรเจกต์นี้ทำงานอย่างไร อ่านอย่างเดียว ไม่แก้ไฟล์"
          className="btn btn-soft tone-info btn-sm"
        >
          <LightBulbIcon className="h-4 w-4" />
          อธิบายโค้ด
        </button>
        <button
          type="button"
          onClick={() => send("ตรวจโค้ดทั้งหมดหาบั๊กและจุดที่ไม่ตรง best practice ของ Google Apps Script แล้วแก้ให้เรียบร้อย")}
          disabled={!engineReady}
          title="ให้ AI ตรวจโค้ดทั้งหมดหาบั๊กและจุดที่ผิดหลัก Apps Script แล้วแก้ให้เลย ของเดิมย้อนได้จากประวัติ"
          className="btn btn-soft tone-warn btn-sm"
        >
          <BugAntIcon className="h-4 w-4" />
          ตรวจหาบั๊ก
        </button>
        <button type="button" onClick={() => requestAction("publish")} title="เผยแพร่ให้คนอื่นเปิดใช้ได้" className="btn btn-primary btn-sm">
          <RocketLaunchIcon className="h-4 w-4" />
          เผยแพร่
        </button>
      </div>
    </div>
  );

  // The one place the user types.
  const composer = (rows: number) => (
    <>
      {/* staged image attachments (≤4) */}
      {(images.length > 0 || attaching) && (
        <div className="mb-2 flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative h-14 w-14">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={img.dataUrl} alt="รูปแนบ" className="h-14 w-14 rounded-md border border-line object-cover" />
              <button
                onClick={() => setImages((cur) => cur.filter((_, j) => j !== i))}
                aria-label="เอารูปออก"
                className="absolute -right-1.5 -top-1.5 grid h-5 w-5 place-items-center rounded-full border border-line-strong bg-surface text-muted transition hover:text-danger"
              >
                <XMarkIcon className="h-3 w-3" />
              </button>
            </div>
          ))}
          {attaching && (
            <div className="grid h-14 w-14 place-items-center rounded-md border border-line text-faint">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-current border-t-transparent" />
            </div>
          )}
        </div>
      )}

      <div
        className={`composer flex flex-col gap-1.5 p-2 ${spot ? "is-spot" : ""}`}
        onFocusCapture={() => setSpot(false)}
        onPointerDownCapture={() => setSpot(false)}
      >
        <span className="flex items-center gap-1 px-1.5 pt-0.5 text-xs font-semibold text-ai">
          <SparklesIcon className="h-3.5 w-3.5" />
          สั่งงาน AI ตรงนี้
        </span>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/gif"
          multiple
          onChange={onPickFiles}
          className="hidden"
        />
        <textarea
          ref={inputRef}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              send();
            }
          }}
          placeholder={
            hasFiles
              ? "อยากเพิ่มหรือแก้อะไร เช่น “เพิ่มหน้ารายงานสรุปรายเดือน” หรือวาง error ที่เจอมาได้เลย"
              : "เล่าระบบที่อยากได้ เช่น “ระบบจองห้องประชุม ให้พนักงานจองผ่านมือถือ หัวหน้าอนุมัติ”"
          }
          aria-label="ข้อความถึง AI"
          disabled={busy}
          rows={rows}
          className="w-full resize-none bg-transparent px-1.5 pt-0.5 text-sm leading-relaxed outline-none placeholder:text-muted disabled:opacity-60"
        />
        <div className="flex items-center gap-2">
          <Tooltip label={images.length >= MAX_IMAGES ? `แนบได้สูงสุด ${MAX_IMAGES} รูป` : "แนบรูปอ้างอิง"} placement="top" className="shrink-0">
            <button
              onClick={() => fileRef.current?.click()}
              disabled={busy || images.length >= MAX_IMAGES}
              aria-label="แนบรูป"
              className="btn btn-ghost btn-sm btn-icon"
            >
              <PhotoIcon className="h-[18px] w-[18px]" />
            </button>
          </Tooltip>
          <AiPicker projectId={projectId} options={aiOptions} settingsHref={settingsHref} placement="top" disabled={busy} />
          <span className="flex-1" />
          <button onClick={() => send()} disabled={!canSend} className="btn btn-primary btn-sm shrink-0">
            ส่ง
            <PaperAirplaneIcon className="h-4 w-4" />
          </button>
        </div>
      </div>
      {footnote ? (
        <div className="mt-1 flex min-h-5 items-center text-xs">{footnote}</div>
      ) : (
        <p className="mt-1 px-1 text-xs text-faint">Enter ส่ง · Shift+Enter ขึ้นบรรทัดใหม่</p>
      )}
    </>
  );

  const engineCallout = !engineReady && (
    <div className="callout callout-warn items-center">
      <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
      <span className="min-w-0 flex-1">{engineHint ?? "ยังใช้ AI ไม่ได้"}</span>
      <Link href={settingsHref} className="btn btn-secondary btn-sm shrink-0">
        ตั้งค่า AI
      </Link>
    </div>
  );

  const examples = (list: string[], columns: string) => (
    <div>
      <p className="mb-1.5 text-xs font-semibold text-muted">
        ตัวอย่าง <span className="font-normal text-faint">· กดเพื่อใส่ในช่องพิมพ์</span>
      </p>
      <div className={`grid gap-1.5 ${columns}`}>
        {list.map((s) => (
          <button key={s} onClick={() => fillInput(s)} disabled={busy} className="row-btn text-[13px]">
            <PlusIcon className="h-4 w-4 shrink-0 text-accent-text" />
            <span className="min-w-0 flex-1">{s}</span>
          </button>
        ))}
      </div>
    </div>
  );

  const dialogs = (
    <>
      <ProjectStyleDialog
        open={styleOpen}
        projectId={projectId}
        value={projectStyle}
        inherited={styleDefaults}
        onClose={() => setStyleOpen(false)}
        onSaved={setProjectStyle}
      />
      <GuidedWizard
        open={wizardOpen}
        projectId={projectId}
        defaults={resolvePrefs(styleDefaults, projectStyle)}
        onClose={() => setWizardOpen(false)}
        onComplete={(msg, look) => {
          setWizardOpen(false);
          setProjectStyle((p) => ({ ...p, ...look }));
          send(msg);
        }}
      />
    </>
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      {/* no header: the rail says this is the chat, and ไลบรารีและฟอนต์ lives in the toolbar row */}
      {energyTank ? (
        <div className="flex-none px-3 pt-3">
          <EnergyBar used={energy} tank={energyTank} />
        </div>
      ) : null}

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-auto px-3 pb-3 pt-4">
        {engineCallout}
        {imported && <AuditCard projectId={projectId} />}

        {initialImages && initialImages.length > 0 && (
          <div className="rounded-lg border border-line bg-sunken p-2.5">
            <div className="mb-1.5 flex items-center gap-1.5 text-xs font-medium text-muted">
              <PhotoIcon className="h-3.5 w-3.5" />
              รูปอ้างอิงที่เคยแนบ ({initialImages.length})
            </div>
            <div className="flex flex-wrap gap-1.5">
              {initialImages.map((img, i) => (
                <a key={i} href={img.url} target="_blank" rel="noopener noreferrer">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={img.url} alt="รูปอ้างอิงเก่า" className="h-14 w-14 rounded-md border border-line object-cover transition hover:opacity-80" />
                </a>
              ))}
            </div>
          </div>
        )}

        {messages.length === 0 && (
          <div className="space-y-3 pt-1">
            <p className="hint">
              {hasFiles
                ? "โปรเจกต์นี้มีโค้ดอยู่แล้ว อยากเพิ่มหรือแก้ตรงไหนพิมพ์ในช่องด้านล่าง เจอ error ก็วางมาได้"
                : "โปรเจกต์นี้ยังว่าง เล่าสิ่งที่อยากได้ในช่องด้านล่าง หรือหยิบตัวอย่าง / สไตล์จากแท็บสไตล์มาใส่ก่อนก็ได้"}
            </p>
            {hasFiles ? examples(EDIT_SUGGESTIONS, "grid-cols-1") : startChips}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <span className={`flex items-center gap-1 text-xs font-medium ${m.role === "user" ? "text-faint" : "text-ai"}`}>
              {m.role === "user" ? (
                "คุณ"
              ) : (
                <>
                  <AiMark active={busy && i === messages.length - 1} />
                  AI
                </>
              )}
            </span>
            <div
              className={`max-w-full rounded-lg px-3 py-2 text-sm leading-relaxed ${
                m.role === "user" ? "bg-accent-soft text-fg" : "border border-line bg-surface text-fg"
              }`}
            >
              {m.images && m.images.length > 0 && (
                <div className="mb-1.5 flex flex-wrap gap-1.5">
                  {m.images.map((src, j) => (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img key={j} src={src} alt="รูปแนบ" className="h-16 w-16 rounded-md border border-line object-cover" />
                  ))}
                </div>
              )}
              {m.role === "assistant" && m.text.trim() ? (
                <ChatText text={m.text.trim()} />
              ) : (
                m.text.trimStart() ? (
                  <span className="whitespace-pre-wrap break-words">{m.text.trimStart()}</span>
                ) : busy && i === messages.length - 1 ? (
                  <TypingDots />
                ) : null
              )}
            </div>
          </div>
        ))}

        {verdict && (
          <div className={`callout items-center font-medium ${verdict.ok ? "border-transparent bg-accent-soft text-accent-text" : "callout-warn"}`}>
            {verdict.ok ? <CheckCircleIcon className="h-5 w-5 shrink-0" /> : <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />}
            <span>{verdict.text}</span>
          </div>
        )}

        {cameraGate && !busy && (
          <CameraGateCard
            state={cameraGate}
            settingsHref={`/settings?s=premium&from=${projectId}`}
            onUpgrade={() => setUpgradeOpen(true)}
          />
        )}
        <UpgradeDialog
          open={upgradeOpen}
          onClose={() => setUpgradeOpen(false)}
          reason="camera"
          onActivated={() => setCameraGate((cur) => (cur ? { ...cur, activated: true } : cur))}
        />

        <LessonOffers offers={lessonOffers} onResolved={(id) => setLessonOffers((cur) => cur.filter((o) => o.id !== id))} />

        {pendingSpec && (
          <div className="card p-3.5">
            <div className="text-xs font-semibold text-muted">สรุปสิ่งที่จะสร้าง</div>
            <p className="mt-1 text-[15px] font-semibold">{pendingSpec.title}</p>
            {pendingSpec.summary && <p className="hint">{pendingSpec.summary}</p>}
            {pendingSpec.features.length > 0 && (
              <ul className="mt-2 list-disc space-y-0.5 pl-5 text-[13px]">
                {pendingSpec.features.map((f, i) => (
                  <li key={i}>{f}</li>
                ))}
              </ul>
            )}
            <div className="hint mt-2 space-y-0.5">
              {pendingSpec.dataModel && pendingSpec.dataModel.length > 0 && <p>ข้อมูล: {pendingSpec.dataModel.join(" · ")}</p>}
              {pendingSpec.storage && <p>เก็บที่: {pendingSpec.storage}</p>}
              {pendingSpec.outputs && pendingSpec.outputs.length > 0 && <p>ผลลัพธ์: {pendingSpec.outputs.join(" · ")}</p>}
            </div>
            <button onClick={() => send("ยืนยัน สร้างเลยตาม spec ที่สรุปไว้")} disabled={busy} className="btn btn-primary mt-3 w-full">
              <SparklesIcon className="h-4 w-4" />
              สร้างตามนี้
            </button>
            <p className="hint mt-1.5 text-center">ยังไม่ตรงใจ พิมพ์บอกสิ่งที่อยากแก้ได้เลย</p>
          </div>
        )}

        {messages.length > 0 && !pendingSpec && startChips}
        {demoChips}
        {nextSteps}
      </div>

      <div className="relative flex-none border-t border-line p-3">
        {spot && (
          <button type="button" onClick={() => { setSpot(false); inputRef.current?.focus(); }} className="spot-bubble" aria-live="polite">
            <SparklesIcon className="spot-twinkle h-4 w-4 shrink-0" />
            เริ่มไอเดียของคุณที่นี่
          </button>
        )}
        {/* live status — what the AI is doing right now */}
        {busy && (
          <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-text" role="status">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="min-w-0 flex-1 truncate">{status || "AI กำลังทำงาน…"}</span>
          </div>
        )}

        {composer(3)}
      </div>

      {dialogs}
    </div>
  );
}

/**
 * The premium camera gate's card for the last turn: an upgrade offer, a "connect GitHub" pointer, or a
 * one-line note the first time a project is switched to GitHub Pages hosting. Rendered only on turns
 * with a gate state, so normal turns keep their layout.
 */
function CameraGateCard({
  state,
  settingsHref,
  onUpgrade,
}: {
  state: { gate: CameraGateState; first: boolean; activated?: boolean };
  settingsHref: string;
  onUpgrade: () => void;
}) {
  if (state.gate === "allowed") {
    if (!state.first) return null;
    return <p className="hint text-xs">หน้าเว็บของโปรเจกต์นี้จะเผยแพร่บน GitHub Pages ของคุณ (เรียก Google Apps Script เป็นระบบหลังบ้าน)</p>;
  }
  if (state.activated) {
    return (
      <div className="callout items-center">
        <CheckCircleIcon className="h-5 w-5 shrink-0" />
        <span>เปิดใช้ Pro แล้ว ส่งคำขอเดิมอีกครั้งได้เลย</span>
      </div>
    );
  }
  if (state.gate === "need-github") {
    return (
      <div className="callout callout-warn flex-wrap items-center">
        <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">ต้องเชื่อมต่อ GitHub ก่อน จึงจะสร้างฟีเจอร์กล้องได้</span>
        <Link href={settingsHref} className="btn btn-soft tone-warn btn-sm">
          เชื่อมต่อ GitHub
          <ChevronRightIcon className="h-4 w-4" />
        </Link>
      </div>
    );
  }
  return (
    <div className="callout callout-warn flex-wrap items-center">
      <ExclamationTriangleIcon className="h-5 w-5 shrink-0" />
      <span className="min-w-0 flex-1">
        <span className="font-medium">กล้องใช้ได้ในเวอร์ชัน Pro</span> หน้าเว็บจะเผยแพร่บน GitHub Pages ของคุณ ซึ่งเปิดกล้องได้
      </span>
      <button type="button" className="btn btn-soft tone-warn btn-sm" onClick={onUpgrade}>
        ดู Pro
        <ChevronRightIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
