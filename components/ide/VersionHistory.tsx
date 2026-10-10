"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowUturnLeftIcon,
  ArrowsRightLeftIcon,
  ClockIcon,
  CloudArrowDownIcon,
  PencilSquareIcon,
  RocketLaunchIcon,
  SparklesIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { listVersionsAction, restoreVersionAction, versionDiffAction } from "@/app/projects/version-actions";
import { saveDirtyFiles } from "@/lib/client/save-files";
import type { VersionMeta, VersionSource } from "@/lib/versions";
import { defineEgsThemes, EGS_SCROLLBAR, egsTheme } from "@/lib/monaco-theme";

const DiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => <div className="hint grid h-full place-items-center">กำลังโหลด…</div>,
});

const SOURCE: Record<VersionSource, { label: string; Icon: typeof SparklesIcon; cls: string }> = {
  ai: { label: "AI สร้าง", Icon: SparklesIcon, cls: "text-accent-text" },
  manual: { label: "แก้เอง", Icon: PencilSquareIcon, cls: "text-muted" },
  deploy: { label: "เผยแพร่", Icon: RocketLaunchIcon, cls: "text-accent-text" },
  restore: { label: "กู้คืน", Icon: ArrowUturnLeftIcon, cls: "text-warn-text" },
  import: { label: "ต้นฉบับจาก Google", Icon: ArrowDownTrayIcon, cls: "text-info" },
  pull: { label: "ดึงจาก Google", Icon: CloudArrowDownIcon, cls: "text-info" },
};

function timeAgo(iso: string): string {
  const m = Math.floor((Date.now() - new Date(iso).getTime()) / 60000);
  if (m < 1) return "เมื่อสักครู่";
  if (m < 60) return `${m} นาทีที่แล้ว`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} ชม.ที่แล้ว`;
  return `${Math.floor(h / 24)} วันที่แล้ว`;
}

function changeLine(c: VersionMeta["changes"]): string {
  const parts = [
    c.modified.length && `แก้ ${c.modified.length}`,
    c.added.length && `เพิ่ม ${c.added.length}`,
    c.removed.length && `ลบ ${c.removed.length}`,
  ].filter(Boolean);
  return parts.length ? `${parts.join(" · ")} ไฟล์` : "ไม่มีไฟล์เปลี่ยน";
}

const langOf = (path: string) => (path.endsWith(".html") ? "html" : path.endsWith(".json") ? "json" : "javascript");

type Diff = { versionId: string; label: string; version: { path: string; content: string }[]; current: { path: string; content: string }[] };

/**
 * "ประวัติ": every snapshot with what it changed (like a commit), a side-by-side diff against the current
 * code, and restore (the current code is snapshotted first, so a restore is undoable too). For a script
 * imported from Google, the untouched original is always listed.
 */
export function VersionHistory({ projectId }: { projectId: string }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<VersionMeta[] | null>(null);
  const [restoring, setRestoring] = useState<string | null>(null);
  const [diff, setDiff] = useState<Diff | null>(null);
  const [diffFile, setDiffFile] = useState<string | null>(null);

  async function openPanel() {
    setOpen(true);
    setDiff(null);
    setVersions(null);
    setVersions(await listVersionsAction(projectId));
  }

  async function restore(id: string) {
    if (restoring) return;
    if (!confirm("กู้คืนโค้ดเป็นเวอร์ชันนี้?\nโค้ดปัจจุบันถูกบันทึกเป็นเวอร์ชันไว้แล้ว ย้อนกลับได้")) return;
    setRestoring(id);
    await saveDirtyFiles(projectId); // keep the user's current edits as a version before overwriting
    const r = await restoreVersionAction(id);
    setRestoring(null);
    if (r.ok) {
      setOpen(false);
      router.refresh(); // re-fetch files → IdeShell setInitial → editor shows restored code
    }
  }

  async function showDiff(v: VersionMeta) {
    const r = await versionDiffAction(v.id);
    if (!r.ok) return;
    const label = `${v.label ?? (SOURCE[v.source] ?? SOURCE.manual).label} · ${timeAgo(v.created_at)}`;
    setDiff({ versionId: v.id, label, version: r.version, current: r.current });
    const firstChanged = [...new Set([...r.version.map((f) => f.path), ...r.current.map((f) => f.path)])].find(
      (p) => r.version.find((f) => f.path === p)?.content !== r.current.find((f) => f.path === p)?.content,
    );
    setDiffFile(firstChanged ?? r.current[0]?.path ?? null);
  }

  const diffPaths = useMemo(() => {
    if (!diff) return [];
    const paths = [...new Set([...diff.version.map((f) => f.path), ...diff.current.map((f) => f.path)])].sort();
    return paths.map((p) => {
      const a = diff.version.find((f) => f.path === p)?.content;
      const b = diff.current.find((f) => f.path === p)?.content;
      return { path: p, state: a === b ? "same" : a === undefined ? "added" : b === undefined ? "removed" : "changed" };
    });
  }, [diff]);

  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");

  return (
    <>
      <button onClick={openPanel} className="btn btn-ghost btn-sm shrink-0">
        <ClockIcon className="h-4 w-4" />
        ประวัติ
      </button>

      {open && (
        <div className="dialog-backdrop" onClick={() => setOpen(false)}>
          <div
            role="dialog"
            aria-modal="true"
            aria-label="ประวัติโค้ด"
            className={`dialog flex max-h-[85vh] flex-col overflow-hidden ${diff ? "w-[min(1100px,95vw)] max-w-none" : "max-w-md"}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 border-b border-line px-4 py-2.5">
              {diff ? (
                <>
                  <button onClick={() => setDiff(null)} className="btn btn-ghost btn-sm">← กลับ</button>
                  <h3 className="truncate text-[15px] font-semibold">เทียบ “{diff.label}” กับโค้ดตอนนี้</h3>
                </>
              ) : (
                <h3 className="text-[15px] font-semibold">ประวัติโค้ด</h3>
              )}
              <span className="flex-1" />
              {diff && (
                <button onClick={() => restore(diff.versionId)} disabled={restoring !== null} className="btn btn-secondary btn-sm">
                  <ArrowUturnLeftIcon className="h-4 w-4" />
                  กู้คืนเวอร์ชันนี้
                </button>
              )}
              <button onClick={() => setOpen(false)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
                <XMarkIcon className="h-4 w-4" />
              </button>
            </div>

            {diff ? (
              <div className="flex min-h-[60vh] flex-1">
                <ul className="w-36 shrink-0 overflow-y-auto border-r border-line p-2 text-sm md:w-56">
                  {diffPaths.map((f) => (
                    <li key={f.path}>
                      <button
                        onClick={() => setDiffFile(f.path)}
                        className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${diffFile === f.path ? "bg-sunken font-medium" : "hover:bg-sunken"}`}
                      >
                        <span
                          className={`h-2 w-2 shrink-0 rounded-full ${f.state === "same" ? "bg-line-strong" : f.state === "added" ? "bg-accent" : f.state === "removed" ? "bg-danger" : "bg-warn-text"}`}
                          aria-hidden="true"
                        />
                        <span className="truncate font-mono text-xs">{f.path}</span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="min-w-0 flex-1">
                  {diffFile && (
                    <DiffEditor
                      key={diffFile}
                      original={diff.version.find((f) => f.path === diffFile)?.content ?? ""}
                      modified={diff.current.find((f) => f.path === diffFile)?.content ?? ""}
                      language={langOf(diffFile)}
                      theme={egsTheme(dark)}
                      beforeMount={defineEgsThemes}
                      options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, automaticLayout: true, scrollbar: EGS_SCROLLBAR }}
                    />
                  )}
                </div>
              </div>
            ) : (
              <div className="min-h-0 flex-1 overflow-y-auto p-2">
                {versions === null ? (
                  <p className="hint py-10 text-center">กำลังโหลด…</p>
                ) : versions.length === 0 ? (
                  <p className="hint px-4 py-10 text-center">ยังไม่มีประวัติ แอปจะเก็บเวอร์ชันไว้ให้ทุกครั้งที่ AI สร้าง คุณแก้เอง หรือเผยแพร่</p>
                ) : (
                  <ul className="flex flex-col gap-1">
                    {versions.map((v) => {
                      const s = SOURCE[v.source] ?? SOURCE.manual;
                      return (
                        <li key={v.id} className="flex items-center gap-3 rounded-md px-3 py-2 transition hover:bg-sunken">
                          <s.Icon className={`h-5 w-5 shrink-0 ${s.cls}`} />
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5 text-sm font-medium text-fg">
                              {v.label ?? s.label}
                              {v.source === "import" && <span className="badge tone-info">ต้นฉบับ</span>}
                            </div>
                            <div className="text-xs text-muted">
                              {timeAgo(v.created_at)} · {v.source === "import" ? `${v.fileCount} ไฟล์` : changeLine(v.changes)}
                            </div>
                          </div>
                          <button onClick={() => showDiff(v)} className="btn btn-ghost btn-sm shrink-0" title="ดูความต่างกับโค้ดตอนนี้">
                            <ArrowsRightLeftIcon className="h-4 w-4" />
                            <span className="sr-only">ดูความต่าง</span>
                          </button>
                          <button onClick={() => restore(v.id)} disabled={restoring !== null} className="btn btn-secondary btn-sm shrink-0">
                            <ArrowUturnLeftIcon className="h-4 w-4" />
                            {restoring === v.id ? "กำลังกู้คืน…" : "กู้คืน"}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
