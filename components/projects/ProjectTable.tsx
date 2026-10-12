"use client";

import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowTopRightOnSquareIcon,
  CheckIcon,
  ClipboardIcon,
  EllipsisHorizontalIcon,
  ListBulletIcon,
  Squares2X2Icon,
  FolderIcon,
  GlobeAltIcon,
  FolderOpenIcon,
  CodeBracketIcon,
  LinkIcon,
  MagnifyingGlassIcon,
  PencilSquareIcon,
  PlusIcon,
  ShareIcon,
  SparklesIcon,
  TableCellsIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { busyProjectsAction } from "@/app/projects/actions";
import { openProjectFolderAction } from "@/app/projects/import-actions";
import { CreateProjectDialog } from "./CreateProjectDialog";
import { DeleteProjectDialog } from "./DeleteProjectDialog";
import { RenameDialog } from "./RenameDialog";
import type { EgsProject } from "@/types/db";
import { USE_LIST, useOf } from "@/lib/project-use";

/** how often the list asks which projects the AI is working on (a local call) */
const BUSY_POLL_MS = 5000;

type Filter = "all" | "draft" | "live" | "google" | "cloned";
type Layout = "table" | "cards";
/** the list's look, remembered per browser (a convenience: the phone and the computer may differ) */
const LAYOUT_KEY = "egs:home-layout";

const VIEWS = [
  { mode: "new", href: "/projects", label: "โปรเจกต์ของฉัน", Icon: FolderIcon, tone: "text-accent-text" },
  { mode: "existing", href: "/projects?mode=existing", label: "สคริปต์ใน Google", Icon: ArrowDownTrayIcon, tone: "text-info" },
  { mode: "clone", href: "/projects?mode=clone", label: "จากลิงก์แชร์", Icon: LinkIcon, tone: "text-ai" },
  { mode: "shares", href: "/projects?mode=shares", label: "ที่คนแชร์", Icon: ShareIcon, tone: "text-accent-text" },
  { mode: "hub", href: "/projects?mode=hub", label: "ฮับ", Icon: GlobeAltIcon, tone: "text-info" },
] as const;

const kindLabel = (p: EgsProject) => USE_LIST.find((u) => u.id === useOf(p.kind, p.hosting))?.short ?? "";
const originLabel = (p: EgsProject) => (p.origin === "imported" ? "ดึงจาก Google" : p.origin === "cloned" ? "โคลนจากลิงก์" : null);

function when(iso: string): string {
  const d = new Date(iso);
  const today = new Date();
  const sameDay = d.toDateString() === today.toDateString();
  return sameDay
    ? `วันนี้ ${d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" })}`
    : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: d.getFullYear() === today.getFullYear() ? undefined : "2-digit" });
}

/**
 * The home screen's main area: every project in this app as one list — filter by state, search (Ctrl+K),
 * one click to open, ⋯ for rename / open folder / delete. The header carries the counts and the three ways
 * in: a new project (a name first — the AI comes after, on the code screen), a script from Google, a share link.
 */
export function ProjectTable({
  projects,
  deployed,
  execs = {},
  busy: initialBusy = [],
  openCreate = false,
  mode = "new",
  children,
  pro = false,
  githubConnected = false,
}: {
  projects: EgsProject[];
  /** the link each project opens with (GitHub Pages · run.easygaside.tech · /exec · its Sheet) */
  deployed: Record<string, string | undefined>;
  /** Google's own /exec link, shown beside the sharing link */
  execs?: Record<string, string | undefined>;
  busy?: string[];
  /** `/projects?new=1`: open the create dialog on arrival */
  openCreate?: boolean;
  /** which panel the switch shows: the project list, the scripts in Google, or a share link */
  mode?: "new" | "existing" | "clone" | "shares" | "hub";
  /** the panel for the other views (rendered by the page: they need server data) */
  children?: ReactNode;
  /** for the create dialog's GitHub Pages choice */
  pro?: boolean;
  githubConnected?: boolean;
}) {
  const [filter, setFilter] = useState<Filter>("all");
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState<string[]>(initialBusy);
  // opened from an effect: the dialog portals into document.body, which the server render does not have
  const [creating, setCreating] = useState(false);
  const [renaming, setRenaming] = useState<EgsProject | null>(null);
  const [deleting, setDeleting] = useState<EgsProject | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [layout, setLayout] = useState<Layout>("table");
  useEffect(() => {
    try {
      if (localStorage.getItem(LAYOUT_KEY) === "cards") setLayout("cards");
    } catch {
      /* storage blocked: the table */
    }
  }, []);
  const pickLayout = (l: Layout) => {
    setLayout(l);
    try {
      localStorage.setItem(LAYOUT_KEY, l);
    } catch {
      /* not remembered */
    }
  };
  const searchRef = useRef<HTMLInputElement>(null);

  const liveCount = projects.filter((p) => deployed[p.id]).length;
  const googleCount = projects.filter((p) => p.origin === "imported").length;
  const clonedCount = projects.filter((p) => p.origin === "cloned").length;

  useEffect(() => {
    if (openCreate) setCreating(true);
  }, [openCreate]);

  useEffect(() => {
    const tick = () => {
      if (document.visibilityState !== "visible") return;
      busyProjectsAction()
        .then((ids) => setBusy((cur) => (cur.join() === ids.join() ? cur : ids)))
        .catch(() => {});
    };
    const t = setInterval(tick, BUSY_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, []);

  // Ctrl+K searches the list (in the IDE the same keys open the command palette)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === "k" && searchRef.current) {
        e.preventDefault();
        searchRef.current.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list = projects.filter((p) => {
      if (q && !p.name.toLowerCase().includes(q)) return false;
      if (filter === "draft") return !deployed[p.id];
      if (filter === "live") return !!deployed[p.id];
      if (filter === "google") return p.origin === "imported";
      if (filter === "cloned") return p.origin === "cloned";
      return true;
    });
    // working ones first, the rest keep their newest-first order
    return [...list.filter((p) => busy.includes(p.id)), ...list.filter((p) => !busy.includes(p.id))];
  }, [projects, deployed, filter, query, busy]);

  const FILTERS: { id: Filter; label: string; n: number; show: boolean }[] = [
    { id: "all", label: "ทั้งหมด", n: projects.length, show: true },
    { id: "draft", label: "ยังไม่เผยแพร่", n: projects.length - liveCount, show: true },
    { id: "live", label: "เผยแพร่แล้ว", n: liveCount, show: true },
    { id: "google", label: "ดึงจาก Google", n: googleCount, show: googleCount > 0 },
    { id: "cloned", label: "โคลนจากลิงก์", n: clonedCount, show: clonedCount > 0 },
  ];

  async function openFolder(p: EgsProject) {
    const r = await openProjectFolderAction(p.id).catch(() => null);
    if (!r?.ok) setNote(r?.error ?? "เปิดโฟลเดอร์ไม่สำเร็จ");
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="icon-chip tone-accent h-10 w-10 rounded-[10px]">
          <FolderIcon className="h-[22px] w-[22px]" aria-hidden />
        </span>
        <h1 className="text-2xl font-bold tracking-tight sm:text-[28px]">โปรเจกต์ของฉัน</h1>
        <div className="flex items-center gap-2" aria-label="สรุปจำนวน">
          <span className="inline-flex items-baseline gap-1.5 rounded-[10px] border border-line bg-sunken px-3 py-1.5">
            <span className="text-xl font-bold leading-none tabular-nums">{projects.length}</span>
            <span className="text-[12.5px] font-medium text-muted">ทั้งหมด</span>
          </span>
          <span className="inline-flex items-baseline gap-1.5 rounded-[10px] border border-[color-mix(in_srgb,var(--accent)_30%,transparent)] bg-accent-soft px-3 py-1.5 text-accent-text">
            <span className="text-xl font-bold leading-none tabular-nums">{liveCount}</span>
            <span className="text-[12.5px] font-medium">เผยแพร่แล้ว</span>
          </span>
        </div>
        <span className="flex-1" />
        <button type="button" onClick={() => setCreating(true)} data-tour="new-project" className="btn btn-primary">
          <PlusIcon className="h-4 w-4" />
          สร้างโปรเจกต์ใหม่
        </button>
      </div>

      {/* one page, three views: the switch keeps the header and the create button where they are */}
      <nav aria-label="มุมมอง" data-tour="other-starts" className="no-scrollbar -mb-1 flex items-center gap-1 overflow-x-auto border-b border-line">
        {VIEWS.map((v) => {
          const on = v.mode === mode;
          return (
            <Link
              key={v.mode}
              href={v.href}
              scroll={false}
              aria-current={on ? "page" : undefined}
              className={`-mb-px flex h-10 shrink-0 items-center gap-2 border-b-2 px-3 text-[14px] transition ${
                on ? "border-accent font-semibold text-fg" : "border-transparent text-muted hover:text-fg"
              }`}
            >
              <v.Icon className={`h-4 w-4 ${v.tone}`} aria-hidden />
              {v.label}
              {v.mode === "new" && <span className="text-xs tabular-nums text-faint">{projects.length}</span>}
            </Link>
          );
        })}
      </nav>

      {mode !== "new" ? (
        <div className="flex flex-col gap-1">{children}</div>
      ) : (
      <>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <div className="seg no-scrollbar max-w-full overflow-x-auto" role="tablist" aria-label="กรองโปรเจกต์">
          {FILTERS.filter((f) => f.show).map((f) => (
            <button
              key={f.id}
              type="button"
              role="tab"
              aria-selected={filter === f.id}
              onClick={() => setFilter(f.id)}
              className="seg-item h-8 shrink-0 text-[13px]"
            >
              {f.label}
              <span className="text-xs tabular-nums text-faint">{f.n}</span>
            </button>
          ))}
        </div>
        <span className="flex-1" />
        <div className="flex w-full items-center gap-2 sm:w-auto">
        <div className="seg shrink-0" role="radiogroup" aria-label="รูปแบบรายการ">
          {(
            [
              ["table", "ตาราง", ListBulletIcon],
              ["cards", "การ์ด", Squares2X2Icon],
            ] as const
          ).map(([id, label, Icon]) => (
            <button
              key={id}
              type="button"
              role="radio"
              aria-checked={layout === id}
              aria-selected={layout === id}
              onClick={() => pickLayout(id)}
              title={`แสดงแบบ${label}`}
              className="seg-item h-8 px-2"
            >
              <Icon className="h-4 w-4" aria-hidden />
              <span className="sr-only">{label}</span>
            </button>
          ))}
        </div>
        <label className="relative block min-w-0 flex-1 sm:w-64 sm:flex-none">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            ref={searchRef}
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหา…"
            aria-label="ค้นหาโปรเจกต์"
            className="field h-9 w-full pl-8 pr-14 text-[13.5px]"
          />
          <span className="kbd pointer-events-none absolute right-2 top-1/2 hidden -translate-y-1/2 sm:inline-flex">Ctrl+K</span>
        </label>
        </div>
      </div>

      {note && (
        <p role="alert" className="callout callout-warn">
          {note}
        </p>
      )}

      <section data-tour="projects" aria-label="รายการโปรเจกต์" className={layout === "cards" && shown.length > 0 ? "" : "card"}>
        {projects.length === 0 ? (
          <p className="hint px-4 py-6">ยังไม่มีโปรเจกต์ กด “สร้างโปรเจกต์ใหม่” ตั้งชื่อแล้วเข้าไปเล่าให้ AI ฟังได้เลย</p>
        ) : shown.length === 0 ? (
          <p className="hint px-4 py-6">{query.trim() ? `ไม่มีโปรเจกต์ที่ตรงกับ “${query.trim()}”` : "ไม่มีโปรเจกต์ในกลุ่มนี้"}</p>
        ) : layout === "cards" ? (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shown.map((p) => (
              <Card
                key={p.id}
                project={p}
                url={deployed[p.id]}
                exec={execs[p.id]}
                busy={busy.includes(p.id)}
                onRename={() => setRenaming(p)}
                onFolder={() => void openFolder(p)}
                onDelete={() => setDeleting(p)}
              />
            ))}
          </ul>
        ) : (
          <>
            <div className="hidden grid-cols-[minmax(0,1fr)_120px_130px_120px_96px] items-center gap-3 border-b border-line px-4 py-2 text-xs font-semibold text-muted md:grid">
              <span>ชื่อ</span>
              <span>ชนิด</span>
              <span>สถานะ</span>
              <span>แก้ล่าสุด</span>
              <span />
            </div>
            <ul>
              {shown.map((p) => (
                <Row
                  key={p.id}
                  project={p}
                  live={!!deployed[p.id]}
                  busy={busy.includes(p.id)}
                  onRename={() => setRenaming(p)}
                  onFolder={() => void openFolder(p)}
                  onDelete={() => setDeleting(p)}
                />
              ))}
            </ul>
          </>
        )}
      </section>
      </>
      )}

      {creating && <CreateProjectDialog existingNames={projects.map((p) => p.name)} pro={pro} githubConnected={githubConnected} onClose={() => setCreating(false)} />}
      {renaming && <RenameDialog project={renaming} onClose={() => setRenaming(null)} />}
      {deleting && <DeleteProjectDialog project={deleting} onClose={() => setDeleting(null)} />}
    </div>
  );
}

function Row({
  project: p,
  live,
  busy,
  onRename,
  onFolder,
  onDelete,
}: {
  project: EgsProject;
  live: boolean;
  busy: boolean;
  onRename: () => void;
  onFolder: () => void;
  onDelete: () => void;
}) {
  const KindIcon = busy ? SparklesIcon : p.kind === "bound" ? TableCellsIcon : CodeBracketIcon;
  const origin = originLabel(p);
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-3 border-b border-line px-4 py-2.5 last:border-b-0 hover:bg-sunken/60 md:grid-cols-[minmax(0,1fr)_120px_130px_120px_96px]">
      <Link href={`/projects/${p.id}`} className="flex min-w-0 items-center gap-2.5">
        <span className={`icon-chip shrink-0 ${busy ? "tone-ai animate-pulse" : live ? "tone-accent" : "tone-info"}`}>
          <KindIcon className="h-4 w-4" aria-hidden />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-[14px] font-medium text-fg">{p.name}</span>
          <span className="block truncate text-xs text-muted">
            {busy ? (
              <span className="font-medium text-ai">AI กำลังทำงานอยู่ · กดเพื่อดู</span>
            ) : (
              <>
                {/* a phone has no columns: the facts ride under the name */}
                <span className="md:hidden">
                  {live ? "เผยแพร่แล้ว" : "ยังไม่เผยแพร่"} · {kindLabel(p)} · {when(p.updated_at)}
                </span>
                {origin && <span className="hidden md:inline">{origin}</span>}
              </>
            )}
          </span>
        </span>
      </Link>
      <span className="hidden text-[13px] text-muted md:block">{kindLabel(p)}</span>
      <span className="hidden md:block">
        <span className={`badge ${live ? "badge-ok" : ""}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-line-strong"}`} aria-hidden />
          {live ? "เผยแพร่แล้ว" : "ยังไม่เผยแพร่"}
        </span>
      </span>
      <span className="hidden text-[13px] text-muted md:block">{when(p.updated_at)}</span>
      <span className="flex items-center justify-end gap-1">
        <Link href={`/projects/${p.id}`} className="btn btn-ghost btn-sm hidden sm:inline-flex">
          เปิด
        </Link>
        <RowMenu name={p.name} onRename={onRename} onFolder={onFolder} onDelete={onDelete} />
      </span>
    </li>
  );
}

/** One project as a card: what it is, whether it is live, and the two ways in (the code screen, the live app). */
function Card({
  project: p,
  url,
  exec,
  busy,
  onRename,
  onFolder,
  onDelete,
}: {
  project: EgsProject;
  url?: string;
  exec?: string;
  busy: boolean;
  onRename: () => void;
  onFolder: () => void;
  onDelete: () => void;
}) {
  const live = !!url;
  // published as a web app but the owner's first Allow is not seen yet: the app only shows Google's error
  const needsAllow = !!p.deployment?.exec_url && !p.backend_authorized_at && p.hosting !== "github";
  const runLink = url?.startsWith("https://run.easygaside.tech/") ? url : null;
  const KindIcon = busy ? SparklesIcon : p.kind === "bound" ? TableCellsIcon : CodeBracketIcon;
  const origin = originLabel(p);
  const sheet = p.kind === "bound" && !p.deployment?.exec_url;
  return (
    <li className="card flex min-w-0 flex-col gap-3 p-4 transition hover:border-line-strong">
      <div className="flex items-start gap-3">
        <span className={`icon-chip h-10 w-10 shrink-0 rounded-[10px] ${busy ? "tone-ai animate-pulse" : live ? "tone-accent" : "tone-info"}`}>
          <KindIcon className="h-5 w-5" aria-hidden />
        </span>
        <Link href={`/projects/${p.id}`} className="min-w-0 flex-1">
          <span className="block truncate text-[15px] font-semibold text-fg">{p.name}</span>
          <span className="block truncate text-xs text-muted">
            {busy ? <span className="font-medium text-ai">AI กำลังทำงานอยู่ · กดเพื่อดู</span> : `แก้ล่าสุด ${when(p.updated_at)}`}
          </span>
        </Link>
        <RowMenu name={p.name} onRename={onRename} onFolder={onFolder} onDelete={onDelete} />
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        <span className={`badge ${live ? "badge-ok" : ""}`}>
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-accent" : "bg-line-strong"}`} aria-hidden />
          {live ? "เผยแพร่แล้ว" : "ยังไม่เผยแพร่"}
        </span>
        <span className="badge">{kindLabel(p)}</span>
        {origin && <span className="badge">{origin}</span>}
      </div>
      {live && (
        <div className="flex flex-col gap-1.5">
          {runLink && <CopyLink label="แชร์" hint="ลิงก์สำหรับแชร์: เปิดได้ทุกเครื่อง แม้ล็อกอิน Google หลายบัญชี" url={runLink} />}
          {exec && <CopyLink label="Google" hint="ลิงก์ Google ตัวจริง: ใช้ตอนกดอนุญาตครั้งแรก หรือฝังในเว็บอื่น" url={exec} />}
          {!runLink && !exec && <CopyLink label="ลิงก์" hint="ลิงก์ของแอป" url={url!} />}
        </div>
      )}
      {needsAllow && <p className="callout callout-warn !py-1.5 text-xs">ยังไม่ได้กดอนุญาตครั้งแรก เข้าโปรเจกต์แล้วกด “เปิดหน้าอนุญาต” (แนะนำที่คอม)</p>}
      <div className="mt-auto flex flex-wrap items-center gap-2">
        <Link href={`/projects/${p.id}`} className="btn btn-secondary btn-sm">
          <CodeBracketIcon className="h-4 w-4" />
          เปิดโปรเจกต์
        </Link>
        {live && !needsAllow && (
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
            {sheet ? "เปิดชีต" : "เปิดเว็บแอป"}
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        )}
      </div>
    </li>
  );
}

/** One address with a short tag, its use in the tooltip, and a copy button. */
function CopyLink({ label, hint, url }: { label: string; hint: string; url: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <div className="flex min-w-0 items-center gap-1.5 rounded-lg bg-sunken py-1 pl-2 pr-1" title={hint}>
      <span className="shrink-0 rounded bg-surface px-1.5 py-px text-[10.5px] font-semibold text-muted">{label}</span>
      <span className="min-w-0 flex-1 truncate font-mono text-[11px] text-muted">{url.replace(/^https:\/\//, "")}</span>
      <button type="button" onClick={copy} aria-label={`คัดลอกลิงก์ ${label}`} title="คัดลอก" className="btn btn-ghost btn-sm btn-icon shrink-0">
        {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
      </button>
    </div>
  );
}

function RowMenu({ name, onRename, onFolder, onDelete }: { name: string; onRename: () => void; onFolder: () => void; onDelete: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (!ref.current?.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => {
      document.removeEventListener("mousedown", away);
      document.removeEventListener("keydown", esc);
    };
  }, [open]);
  const item = "flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-[13px] transition hover:bg-sunken";
  const pick = (fn: () => void) => () => {
    setOpen(false);
    fn();
  };
  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`เมนูของ ${name}`}
        className="btn btn-ghost btn-sm btn-icon"
      >
        <EllipsisHorizontalIcon className="h-5 w-5" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 top-full z-30 mt-1 w-48 rounded-lg border border-line bg-surface p-1 shadow-[var(--shadow-pop)]">
          <button type="button" role="menuitem" onClick={pick(onRename)} className={item}>
            <PencilSquareIcon className="h-4 w-4 text-muted" />
            เปลี่ยนชื่อ
          </button>
          <button type="button" role="menuitem" onClick={pick(onFolder)} className={item}>
            <FolderOpenIcon className="h-4 w-4 text-muted" />
            เปิดโฟลเดอร์
          </button>
          <button type="button" role="menuitem" onClick={pick(onDelete)} className={`${item} text-danger hover:bg-danger-soft`}>
            <TrashIcon className="h-4 w-4" />
            ลบ
          </button>
        </div>
      )}
    </div>
  );
}
