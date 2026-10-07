"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { importScriptAction, listGoogleScriptsAction, publishInfoAction } from "@/app/projects/import-actions";
import type { PublishInfo } from "@/lib/publish-info";
import type { GoogleScript } from "@/lib/import";
import { ScriptRow } from "./ScriptRow";

type Filter = "all" | "published" | "unpublished" | "local";
const FILTERS: { key: Filter; label: string }[] = [
  { key: "all", label: "ทั้งหมด" },
  { key: "published", label: "เผยแพร่แล้ว" },
  { key: "unpublished", label: "ยังไม่เผยแพร่" },
  { key: "local", label: "มีในเครื่อง" },
];
const STATUS_BATCH = 12;

function matches(f: Filter, s: GoogleScript, info: PublishInfo | null | undefined): boolean {
  if (f === "local") return !!s.projectId;
  if (f === "published") return !!info && info.kind !== "none";
  if (f === "unpublished") return info?.kind === "none";
  return true;
}

/**
 * The scripts in the user's Google account (Drive trash left out), newest edit first, with whether each
 * one is published. Hidden scripts stay out of the way until "แสดงที่ซ่อนไว้". A sheet-bound script is not
 * listed by Google, so its editor link can be pasted at the bottom.
 */
export function GoogleScriptsList() {
  const router = useRouter();
  const [scripts, setScripts] = useState<GoogleScript[] | null>(null);
  const [publish, setPublish] = useState<Record<string, PublishInfo | null>>({});
  const [error, setError] = useState("");
  const [query, setQuery] = useState("");
  const [filter, setFilter] = useState<Filter>("all");
  const [showHidden, setShowHidden] = useState(false);
  const [pasted, setPasted] = useState("");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const run = useRef(0); // a reload makes an earlier load's late answers stale

  const load = useCallback(async () => {
    const mine = ++run.current;
    setError("");
    setScripts(null);
    setPublish({});
    const r = await listGoogleScriptsAction().catch(() => null);
    if (mine !== run.current) return;
    if (!r) return setError("ติดต่อ Google ไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setError(r.error);
    setScripts(r.data);
    // publish status a batch at a time, visible scripts first, so the badges fill in while the user reads
    const order = [...r.data.filter((s) => !s.hidden), ...r.data.filter((s) => s.hidden)].map((s) => s.id);
    for (let i = 0; i < order.length; i += STATUS_BATCH) {
      const part = await publishInfoAction(order.slice(i, i + STATUS_BATCH)).catch(() => null);
      if (!part || mine !== run.current) break;
      setPublish((p) => ({ ...p, ...part }));
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const hiddenCount = (scripts ?? []).filter((s) => s.hidden).length;
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return (scripts ?? []).filter(
      (s) => (showHidden || !s.hidden) && (!q || s.name.toLowerCase().includes(q)) && matches(filter, s, publish[s.id]),
    );
  }, [scripts, query, filter, showHidden, publish]);

  const count = (f: Filter) => (scripts ?? []).filter((s) => !s.hidden && matches(f, s, publish[s.id])).length;
  const update = (id: string, patch: Partial<GoogleScript>) =>
    setScripts((list) => (list ? list.map((s) => (s.id === id ? { ...s, ...patch } : s)) : list));

  function take(input: string, name?: string, key = input) {
    setError("");
    setBusyId(key);
    start(async () => {
      const r = await importScriptAction(input, name);
      setBusyId(null);
      if (!r.ok) return setError(r.error);
      router.push(`/projects/${r.data.projectId}`);
    });
  }

  return (
    <div className="mt-4 overflow-hidden rounded-lg border border-line bg-surface">
      <div className="flex flex-col gap-3 border-b border-line p-4">
        <div className="flex gap-2">
          <label className="sr-only" htmlFor="scripts-search">ค้นหาชื่อสคริปต์</label>
          <div className="relative min-w-0 flex-1">
            <MagnifyingGlassIcon className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted" />
            <input
              id="scripts-search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="ค้นหาชื่อสคริปต์"
              className="field w-full pl-9"
            />
          </div>
          <button type="button" onClick={load} disabled={scripts === null && !error} className="btn btn-ghost btn-sm shrink-0" title="โหลดรายชื่อใหม่">
            <ArrowPathIcon className={`h-4 w-4 ${scripts === null && !error ? "animate-spin" : ""}`} />
            <span className="hidden sm:inline">โหลดใหม่</span>
          </button>
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {FILTERS.map((f) => (
            <button
              key={f.key}
              type="button"
              aria-pressed={filter === f.key}
              onClick={() => setFilter(f.key)}
              className={`btn btn-sm ${filter === f.key ? "btn-soft tone-info" : "btn-ghost"}`}
            >
              {f.label}
              {scripts && <span className="text-xs text-muted">{count(f.key)}</span>}
            </button>
          ))}
          {hiddenCount > 0 && (
            <label className="ml-auto flex cursor-pointer items-center gap-1.5 text-xs text-muted">
              <input type="checkbox" checked={showHidden} onChange={(e) => setShowHidden(e.target.checked)} className="h-3.5 w-3.5" />
              แสดงที่ซ่อนไว้ ({hiddenCount})
            </label>
          )}
        </div>
      </div>

      {!scripts && !error && <p className="hint p-5">กำลังโหลดรายชื่อจาก Google…</p>}
      {scripts && shown.length === 0 && (
        <p className="hint p-5">{query || filter !== "all" ? "ไม่พบสคริปต์ที่ตรงกับที่เลือก" : "ยังไม่มีสคริปต์ในบัญชีนี้"}</p>
      )}
      <ul className="divide-y divide-line">
        {shown.map((s) => (
          <ScriptRow
            key={s.id}
            script={s}
            publish={s.id in publish ? publish[s.id] : undefined}
            busy={pending}
            importing={busyId === s.id}
            onImport={() => take(s.id, s.name, s.id)}
            onOpen={() => router.push(`/projects/${s.projectId}`)}
            onHiddenChange={(hidden) => update(s.id, { hidden })}
            onLocalRemoved={() => update(s.id, { projectId: null, badge: null })}
          />
        ))}
      </ul>

      <div className="border-t border-line p-4">
        <p className="text-sm font-medium text-fg">สคริปต์ที่ผูกกับ Google Sheet</p>
        <p className="hint mt-0.5">
          Google ไม่แสดงสคริปต์แบบนี้ในรายชื่อ เปิดชีต → ส่วนขยาย → Apps Script แล้วคัดลอกลิงก์ของหน้าแก้โค้ดมาวาง
        </p>
        <div className="mt-2 flex gap-2">
          <label className="sr-only" htmlFor="scripts-paste">ลิงก์หรือรหัสสคริปต์</label>
          <input
            id="scripts-paste"
            value={pasted}
            onChange={(e) => setPasted(e.target.value)}
            placeholder="https://script.google.com/…/edit หรือรหัสสคริปต์"
            className="field min-w-0 flex-1"
          />
          <button type="button" onClick={() => take(pasted.trim(), undefined, "pasted")} disabled={pending || !pasted.trim()} className="btn btn-primary shrink-0">
            {busyId === "pasted" ? "กำลังดึง…" : "ดึงมาแก้"}
          </button>
        </div>
      </div>
      {error && (
        <p role="alert" className="border-t border-line p-4 text-sm text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
