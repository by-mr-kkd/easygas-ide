"use client";

import { useMemo, useState } from "react";
import dynamic from "next/dynamic";
import type { CodeFile, FileClass } from "@/lib/share/merge";
import { defineEgsThemes, EGS_SCROLLBAR, egsTheme } from "@/lib/monaco-theme";

const DiffEditor = dynamic(() => import("@monaco-editor/react").then((m) => m.DiffEditor), {
  ssr: false,
  loading: () => <div className="hint grid h-full place-items-center">กำลังโหลด…</div>,
});

const langOf = (path: string) => (path.endsWith(".html") ? "html" : path.endsWith(".json") ? "json" : "javascript");

type Pair = "theirs" | "mine" | "now";

/** What each file is, in words, with the dot colour the version history uses. */
export const CLASS_LABEL: Record<FileClass, { label: string; dot: string }> = {
  same: { label: "เหมือนกัน", dot: "bg-line-strong" },
  take: { label: "ต้นฉบับแก้", dot: "bg-info" },
  mine: { label: "คุณแก้", dot: "bg-accent" },
  both: { label: "แก้ทั้งคู่", dot: "bg-warn-text" },
};

/**
 * "เทียบกับต้นฉบับ": per file, three texts — the base (the version this project is built on), the newer side
 * (the share's latest, or a fork's files) and mine — shown two at a time in Monaco's diff view.
 * `theirsLabel` names the newer side ("ต้นฉบับล่าสุด" / "ทางแยก").
 */
export function ThreeWayDiff({
  base,
  latest,
  mine,
  plans,
  theirsLabel = "ต้นฉบับล่าสุด",
}: {
  base: CodeFile[] | null;
  latest: CodeFile[];
  mine: CodeFile[];
  plans: { path: string; cls: FileClass }[];
  theirsLabel?: string;
}) {
  const shown = useMemo(() => [...plans.filter((p) => p.cls !== "same"), ...plans.filter((p) => p.cls === "same")], [plans]);
  const [file, setFile] = useState<string | null>(shown[0]?.path ?? null);
  const [pair, setPair] = useState<Pair>(base ? "theirs" : "now");
  const text = (list: CodeFile[] | null, path: string | null) => (path ? (list?.find((f) => f.path === path)?.content ?? "") : "");
  const dark = typeof document !== "undefined" && document.documentElement.classList.contains("dark");
  const pairs: { id: Pair; label: string; left: CodeFile[] | null; right: CodeFile[] | null }[] = [
    { id: "theirs", label: `เดิม ↔ ${theirsLabel}`, left: base, right: latest },
    { id: "mine", label: "เดิม ↔ ของฉัน", left: base, right: mine },
    { id: "now", label: `ของฉัน ↔ ${theirsLabel}`, left: mine, right: latest },
  ];
  const cur = pairs.find((p) => p.id === pair) ?? pairs[2];

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <div className="seg no-scrollbar max-w-full overflow-x-auto" role="tablist" aria-label="เทียบคู่ไหน">
          {pairs.map((p) => (
            <button key={p.id} type="button" role="tab" aria-selected={pair === p.id} disabled={!p.left} onClick={() => setPair(p.id)} className="seg-item h-8 shrink-0 text-[12.5px]">
              {p.label}
            </button>
          ))}
        </div>
        {!base && <span className="hint text-xs">ไม่พบโค้ดเดิมที่โคลนมา เทียบได้เฉพาะของคุณกับของใหม่</span>}
      </div>
      <div className="flex min-h-[55vh] flex-1">
        <ul className="w-36 shrink-0 overflow-y-auto border-r border-line p-2 text-sm md:w-56" aria-label="ไฟล์">
          {shown.map((f) => (
            <li key={f.path}>
              <button
                type="button"
                onClick={() => setFile(f.path)}
                className={`flex w-full items-center gap-2 rounded px-2 py-1.5 text-left ${file === f.path ? "bg-sunken font-medium" : "hover:bg-sunken"}`}
                title={CLASS_LABEL[f.cls].label}
              >
                <span className={`h-2 w-2 shrink-0 rounded-full ${CLASS_LABEL[f.cls].dot}`} aria-hidden />
                <span className="min-w-0 flex-1 truncate font-mono text-xs">{f.path}</span>
                <span className="hidden shrink-0 text-[10.5px] text-muted md:inline">{CLASS_LABEL[f.cls].label}</span>
              </button>
            </li>
          ))}
        </ul>
        <div className="min-w-0 flex-1">
          {file && (
            <DiffEditor
              key={`${file}:${pair}`}
              original={text(cur.left, file)}
              modified={text(cur.right, file)}
              language={langOf(file)}
              theme={egsTheme(dark)}
              beforeMount={defineEgsThemes}
              // the library disposes its models before the diff widget lets go of them on unmount ("TextModel got
              // disposed before DiffEditorWidget model got reset"); keep them, one fixed path per file and side
              keepCurrentOriginalModel
              keepCurrentModifiedModel
              originalModelPath={`egs-diff/${pair}/a/${file}`}
              modifiedModelPath={`egs-diff/${pair}/b/${file}`}
              options={{ readOnly: true, renderSideBySide: true, minimap: { enabled: false }, fontSize: 12, automaticLayout: true, scrollbar: EGS_SCROLLBAR }}
            />
          )}
        </div>
      </div>
    </div>
  );
}

/** After รับอัปเดต / รับเข้า: what the app did, and where the rest went (the chat box). */
export function TakeSummary({ r, onChat }: { r: { written: string[]; deleted: string[]; kept: string[]; conflicts: string[]; draft: string | null }; onChat: () => void }) {
  const line = (label: string, list: string[]) =>
    list.length > 0 && (
      <li>
        {label} {list.length} ไฟล์: <span className="font-mono text-xs">{list.join(", ")}</span>
      </li>
    );
  return (
    <div className="space-y-2 text-sm">
      <ul className="list-disc space-y-1 pl-5">
        {line("อัปเดตจากต้นฉบับ", r.written)}
        {line("ลบตามต้นฉบับ", r.deleted)}
        {line("เก็บที่คุณแก้ไว้", r.kept)}
        {!r.written.length && !r.deleted.length && !r.conflicts.length && <li>ไม่มีไฟล์ที่ต้องเปลี่ยน</li>}
      </ul>
      {r.conflicts.length > 0 && (
        <div className="callout callout-warn flex-col items-start gap-2">
          <span>
            <b>{r.conflicts.length} ไฟล์ถูกแก้ทั้งสองฝั่ง</b> ({r.conflicts.join(", ")}) — ใส่ข้อความให้ AI รวมไว้ในกล่องแชตแล้ว อ่านแล้วกดส่งเองเมื่อพร้อม
          </span>
          <button type="button" onClick={onChat} className="btn btn-soft tone-ai btn-sm">
            ไปที่กล่องแชต
          </button>
        </div>
      )}
      <p className="hint">เก็บโค้ดก่อนหน้าไว้ในประวัติแล้ว ย้อนกลับได้จากปุ่มประวัติ</p>
    </div>
  );
}
