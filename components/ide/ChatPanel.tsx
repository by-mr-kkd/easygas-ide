"use client";

import { ChatText } from "./ChatText";
import { useEffect, useRef, useState, type ReactNode } from "react";
import Link from "next/link";
import {
  BoltIcon,
  BugAntIcon,
  ChatBubbleLeftRightIcon,
  CheckCircleIcon,
  ChevronRightIcon,
  ExclamationTriangleIcon,
  LightBulbIcon,
  PaperAirplaneIcon,
  PlusIcon,
  PhotoIcon,
  QueueListIcon,
  SparklesIcon,
  Squares2X2Icon,
  SwatchIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { getProjectPrefsAction, projectRunningAction } from "@/app/projects/actions";
import { useProjectStore } from "@/store/useProjectStore";
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

// Full sentences, never truncated: an example the user cannot read to the end teaches nothing.
const SUGGESTIONS = [
  "ระบบจองคิวร้านตัดผม ลูกค้ากรอกฟอร์มแล้วได้อีเมลยืนยัน",
  "ระบบรับเข้าและตัดสต๊อกสินค้า แจ้งเตือนเมื่อของใกล้หมด",
  "ส่งอีเมลอัตโนมัติถึงรายชื่อใน Google Sheet",
  "แดชบอร์ดสรุปยอดขายรายวันจาก Google Sheet",
];

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
  start = false,
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
  /** Empty project, nothing said yet: render the centred start screen instead of the side panel. */
  start?: boolean;
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

  // the shell swaps the start screen for the panes as soon as the conversation begins
  useEffect(() => {
    setChatActive(messages.length > 0 || busy);
  }, [messages.length, busy, setChatActive]);
  useEffect(() => () => setChatActive(false), [setChatActive]);

  // Hand-offs from the screen the user came from, stashed in sessionStorage right before navigating
  // here (one-shot, so a refresh never replays them):
  //   egs:kickoff        a prompt — from the style picker (prefilled, the user reviews it first) or
  //   egs:kickoff-auto   from the projects home, where the user already pressed "เริ่มสร้าง" (sent now)
  //   egs:wizard         the user chose "ถามทีละข้อ" on the projects home
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

  async function send(text?: string) {
    const msg = (text ?? input).trim();
    // staged images attach only to a composer send (no explicit text arg from chips/spec/wizard)
    const attached = text === undefined ? images : [];
    if ((!msg && attached.length === 0) || busy) return;
    if (text === undefined) {
      setInput("");
      setImages([]);
    }
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

  // The one place the user types. Same block on the start screen and in the side panel.
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

      <div className="field flex flex-col gap-1.5 p-2">
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
          placeholder={hasFiles ? "อยากเพิ่มหรือแก้อะไร พิมพ์มาได้เลย" : "อยากได้ระบบแบบไหน พิมพ์มาได้เลย"}
          aria-label="ข้อความถึง AI"
          disabled={busy}
          rows={rows}
          className="w-full resize-none bg-transparent px-1.5 pt-1 text-sm leading-relaxed outline-none placeholder:text-faint disabled:opacity-60"
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
          <AiPicker projectId={projectId} options={aiOptions} settingsHref={settingsHref} placement={start ? "bottom" : "top"} disabled={busy} />
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

  // START SCREEN — an empty project: one question, one place to type, and the other ways to begin
  if (start) {
    return (
      <div className="h-full w-full overflow-auto">
        <div className="mx-auto flex min-h-full w-full max-w-2xl flex-col justify-center gap-6 px-4 py-8 sm:px-6">
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">อยากได้ระบบอะไร?</h1>
            <p className="hint mt-1">เล่าเป็นภาษาพูดได้ AI จะเขียนโค้ดและทำหน้าจอตัวอย่างให้ดูก่อน</p>
          </div>

          {engineCallout}
          <div>{composer(4)}</div>

          <div>
            <p className="mb-1.5 text-xs font-semibold text-muted">หรือเริ่มแบบอื่น</p>
            <div className="grid gap-1.5 sm:grid-cols-2">
              <button onClick={() => setWizardOpen(true)} className="row-btn">
                <span className="icon-chip tone-ai h-9 w-9">
                  <QueueListIcon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">ถามทีละข้อ</span>
                  <span className="block text-[13px] text-muted">ตอบคำถามสั้น ๆ 5 ข้อ แล้ว AI สรุปโจทย์ให้</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
              </button>
              <Link href={`/styleshopping?project=${projectId}`} className="row-btn">
                <span className="icon-chip tone-info h-9 w-9">
                  <Squares2X2Icon className="h-5 w-5" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-medium">เลือกจากตัวอย่างสไตล์</span>
                  <span className="block text-[13px] text-muted">ดูตัวอย่างหน้าจอ แล้วเลือกแบบที่ชอบ</span>
                </span>
                <ChevronRightIcon className="h-4 w-4 shrink-0 text-faint" />
              </Link>
            </div>
          </div>

          {examples(SUGGESTIONS, "sm:grid-cols-2")}
        </div>
        {dialogs}
      </div>
    );
  }

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
        <span className="icon-chip tone-ai">
          <ChatBubbleLeftRightIcon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">แชตกับ AI</h2>
        <span className="flex-1" />
        <Tooltip label="ไลบรารีและหน้าตาที่ AI ใช้กับโปรเจกต์นี้" placement="bottom">
          <button onClick={openStyle} className="btn btn-ghost btn-sm">
            <SwatchIcon className="h-4 w-4 text-info" />
            สไตล์โปรเจกต์
          </button>
        </Tooltip>
      </div>

      {energyTank ? (
        <div className="flex-none px-3 pt-3">
          <EnergyBar used={energy} tank={energyTank} />
        </div>
      ) : null}

      <div ref={bodyRef} className="min-h-0 flex-1 space-y-3 overflow-auto px-3 py-3">
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
                : "พิมพ์สิ่งที่อยากได้ในช่องด้านล่าง"}
            </p>
            {examples(hasFiles ? EDIT_SUGGESTIONS : SUGGESTIONS, "grid-cols-1")}
          </div>
        )}

        {messages.map((m, i) => (
          <div key={i} className={`flex flex-col gap-1 ${m.role === "user" ? "items-end" : "items-start"}`}>
            <span className={`flex items-center gap-1 text-xs font-medium ${m.role === "user" ? "text-faint" : "text-ai"}`}>
              {m.role === "user" ? (
                "คุณ"
              ) : (
                <>
                  <SparklesIcon className="h-3.5 w-3.5" />
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
                <span className="whitespace-pre-wrap break-words">{m.text.trimStart() || (busy && i === messages.length - 1 ? "…" : "")}</span>
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
      </div>

      <div className="flex-none border-t border-line p-3">
        {/* live status — what the AI is doing right now */}
        {busy && (
          <div className="mb-2 flex items-center gap-2.5 rounded-lg bg-accent-soft px-3 py-2 text-[13px] font-medium text-accent-text" role="status">
            <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent" />
            <span className="min-w-0 flex-1 truncate">{status || "AI กำลังทำงาน…"}</span>
          </div>
        )}

        {/* shortcuts for a project that already has code */}
        {hasFiles && !busy && (
          <div className="mb-2 flex flex-wrap items-center gap-1.5 [@media(max-height:520px)]:hidden">
            <button
              onClick={() => send("อธิบายว่าโค้ดในโปรเจกต์นี้ทำงานยังไง แบบสรุปสั้น ๆ เป็นข้อ ๆ")}
              title="ให้ AI สรุปเป็นข้อ ๆ ว่าโค้ดในโปรเจกต์นี้ทำงานอย่างไร อ่านอย่างเดียว ไม่แก้ไฟล์"
              className="btn btn-soft tone-info btn-sm"
            >
              <LightBulbIcon className="h-4 w-4" />
              อธิบายโค้ด
            </button>
            <button
              onClick={() => send("ตรวจโค้ดทั้งหมดหาบั๊กและจุดที่ไม่ตรง best practice ของ Google Apps Script แล้วแก้ให้เรียบร้อย")}
              title="ให้ AI ตรวจโค้ดทั้งหมดหาบั๊กและจุดที่ผิดหลัก Apps Script แล้วแก้ให้เลย ของเดิมย้อนได้จากประวัติ"
              className="btn btn-soft tone-warn btn-sm"
            >
              <BugAntIcon className="h-4 w-4" />
              ตรวจหาบั๊ก
            </button>
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
