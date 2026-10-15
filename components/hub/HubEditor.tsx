"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowLeftIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ChartBarIcon,
  CheckIcon,
  ClipboardIcon,
  DevicePhoneMobileIcon,
  LinkIcon,
  PaintBrushIcon,
  ShareIcon,
  Squares2X2Icon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { hubGetAction, hubSaveAction } from "@/app/projects/hub-actions";
import { cleanHubDoc, HubDocError, type HubDoc } from "@/lib/hub/doc";
import type { HubEditorView } from "@/lib/hub/api";
import { HubLinks } from "./HubLinks";
import { HubLook } from "./HubLook";
import { HubShare } from "./HubShare";
import { HubStats } from "./HubStats";
import { HubTemplates } from "./HubTemplates";

type Tab = "links" | "templates" | "look" | "share" | "stats";
const TABS: { id: Tab; label: string; Icon: typeof LinkIcon }[] = [
  { id: "links", label: "ลิงก์", Icon: LinkIcon },
  { id: "templates", label: "เทมเพลต", Icon: Squares2X2Icon },
  { id: "look", label: "หน้าตา", Icon: PaintBrushIcon },
  { id: "share", label: "แชร์และตั้งค่า", Icon: ShareIcon },
  { id: "stats", label: "สถิติ", Icon: ChartBarIcon },
];
const SAVE_AFTER_MS = 1200;

export type EditorState = HubEditorView & { url: string };

/**
 * One hub being edited. The page document saves by itself a moment after each change (the website checks it
 * again); the live page beside it reloads after each save. Settings that change the address or who may see the
 * page (name, visibility, PIN, the EasyGAS line) save with their own button on the share tab.
 */
export function HubEditor({ id, onBack, onDeleted }: { id: string; onBack: () => void; onDeleted: () => void }) {
  const [hub, setHub] = useState<EditorState | null>(null);
  const [doc, setDoc] = useState<HubDoc | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<Tab>("links");
  const [save, setSave] = useState<{ state: "saved" | "dirty" | "saving" | "error"; message?: string; pro?: boolean }>({ state: "saved" });
  const [previewKey, setPreviewKey] = useState(0);
  const [phonePreview, setPhonePreview] = useState(false);
  const [copied, setCopied] = useState(false);
  const updatedAt = useRef<string>("");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pending = useRef<HubDoc | null>(null);

  const load = useCallback(() => {
    setError(null);
    hubGetAction(id)
      .then((r) => {
        if (!r.ok) return setError(r.error);
        setHub(r.data);
        setDoc(r.data.doc);
        updatedAt.current = r.data.updatedAt;
        setSave({ state: "saved" });
      })
      .catch(() => setError("โหลดฮับไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }, [id]);

  useEffect(load, [load]);

  const flush = useCallback(async () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    const next = pending.current;
    if (!next) return;
    pending.current = null;
    // the same rules the website applies: show the problem here instead of a round trip
    try {
      cleanHubDoc(next, () => true);
    } catch (e) {
      setSave({ state: "error", message: e instanceof HubDocError ? e.message : "ข้อมูลไม่ถูกต้อง" });
      return;
    }
    setSave({ state: "saving" });
    const r = await hubSaveAction(id, { doc: next, updatedAt: updatedAt.current }).catch(() => null);
    if (!r) return setSave({ state: "error", message: "บันทึกไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วลองใหม่" });
    if (!r.ok) return setSave({ state: "error", message: r.error, pro: r.pro });
    updatedAt.current = r.data.updatedAt;
    setSave(pending.current ? { state: "dirty" } : { state: "saved" });
    setPreviewKey((k) => k + 1);
  }, [id]);

  const change = useCallback(
    (next: HubDoc) => {
      setDoc(next);
      pending.current = next;
      setSave({ state: "dirty" });
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => void flush(), SAVE_AFTER_MS);
    },
    [flush],
  );

  // leaving the editor (or the page) with a change in the air: send it now
  useEffect(() => {
    const before = () => void flush();
    window.addEventListener("beforeunload", before);
    return () => {
      window.removeEventListener("beforeunload", before);
      void flush();
    };
  }, [flush]);

  async function copyLink() {
    if (!hub) return;
    try {
      await navigator.clipboard.writeText(hub.url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  if (error)
    return (
      <div className="card flex flex-col gap-3 p-5">
        <p className="text-sm text-danger">{error}</p>
        <div className="flex gap-2">
          <button type="button" onClick={onBack} className="btn btn-secondary btn-sm">
            <ArrowLeftIcon className="h-4 w-4" /> กลับ
          </button>
          <button type="button" onClick={load} className="btn btn-primary btn-sm">
            <ArrowPathIcon className="h-4 w-4" /> ลองใหม่
          </button>
        </div>
      </div>
    );
  if (!hub || !doc) return <p className="hint px-1">กำลังโหลดฮับ…</p>;

  const readOnly = !!hub.disabledReason;
  const previewSrc = `${hub.url}?preview=1&v=${previewKey}`; // preview=1: not counted as a view

  return (
    <div className="flex flex-col gap-4">
      {/* top: back · name · save state · open / copy / preview */}
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" onClick={() => void flush().then(onBack)} className="btn btn-ghost btn-sm" aria-label="กลับไปรายการฮับ">
          <ArrowLeftIcon className="h-4 w-4" />
          ฮับทั้งหมด
        </button>
        <span className="min-w-0 flex-1 truncate text-[15px] font-semibold">{doc.title}</span>
        <SaveBadge state={save.state} />
        <button type="button" onClick={copyLink} className="btn btn-ghost btn-sm" title={hub.url}>
          {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
          <span className="max-sm:hidden">{copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}</span>
        </button>
        <button type="button" onClick={() => setPhonePreview(true)} className="btn btn-soft tone-info btn-sm lg:hidden">
          <DevicePhoneMobileIcon className="h-4 w-4" />
          ดูตัวอย่าง
        </button>
        <a href={hub.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
          เปิดหน้า <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </a>
      </div>
      {readOnly && <p className="callout callout-danger">หน้านี้ถูกปิดโดยผู้ดูแล: {hub.disabledReason} แก้ไขไม่ได้ ติดต่อทีม EasyGAS ในกลุ่ม Facebook</p>}
      {save.state === "error" && save.message && (
        <p className={`callout ${save.pro ? "callout-warn" : "callout-danger"} flex-wrap items-center`}>
          <span className="min-w-0 flex-1">{save.message}</span>
          {save.message.includes("โหลดใหม่") && (
            <button type="button" onClick={load} className="btn btn-secondary btn-sm">
              โหลดใหม่
            </button>
          )}
        </p>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_340px]">
        <div className="flex min-w-0 flex-col gap-4">
          <div className="seg no-scrollbar max-w-full overflow-x-auto self-start" role="tablist" aria-label="ส่วนของฮับ">
            {TABS.map((t) => (
              <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} onClick={() => setTab(t.id)} className="seg-item h-9 shrink-0 text-[13px]">
                <t.Icon className="h-4 w-4" aria-hidden />
                {t.label}
              </button>
            ))}
          </div>
          <fieldset disabled={readOnly} className="min-w-0">
            {tab === "links" && <HubLinks hubId={hub.id} doc={doc} onChange={change} pro={hub.proActive} />}
            {tab === "templates" && <HubTemplates doc={doc} onChange={change} onApplied={() => setTab("links")} />}
            {tab === "look" && <HubLook hubId={hub.id} doc={doc} onChange={change} />}
            {tab === "share" && (
              <HubShare
                hub={hub}
                updatedAt={updatedAt}
                onSaved={(slug, url, at, patch) => {
                  updatedAt.current = at;
                  setHub((h) => (h ? { ...h, ...patch, slug, url } : h));
                  setPreviewKey((k) => k + 1);
                }}
                beforeSave={flush}
                onDeleted={onDeleted}
                onReload={load}
              />
            )}
            {tab === "stats" && <HubStats hub={hub} doc={doc} />}
          </fieldset>
        </div>

        {/* the live page, as a phone sees it */}
        <aside className="hidden lg:block">
          <div className="sticky top-4">
            <PhoneFrame src={previewSrc} />
            <p className="hint mt-2 text-center text-xs">หน้าจริงบน easygaside.tech อัปเดตหลังบันทึก</p>
          </div>
        </aside>
      </div>

      {phonePreview && (
        <div className="fixed inset-0 z-50 flex flex-col bg-black/60 p-3" role="dialog" aria-modal="true" aria-label="ตัวอย่างหน้าฮับ">
          <div className="mb-2 flex justify-end">
            <button type="button" onClick={() => setPhonePreview(false)} className="btn btn-secondary btn-sm">
              <XMarkIcon className="h-4 w-4" /> ปิดตัวอย่าง
            </button>
          </div>
          <iframe key={previewKey} src={previewSrc} title="ตัวอย่างหน้าฮับ" className="min-h-0 w-full flex-1 rounded-2xl border-0 bg-white" />
        </div>
      )}
    </div>
  );
}

function PhoneFrame({ src }: { src: string }) {
  return (
    <div className="mx-auto w-[320px] rounded-[2.2rem] border-[10px] border-[#111827] bg-[#111827] shadow-xl">
      <iframe key={src} src={src} title="ตัวอย่างหน้าฮับ" className="h-[600px] w-full rounded-[1.5rem] border-0 bg-white" />
    </div>
  );
}

function SaveBadge({ state }: { state: "saved" | "dirty" | "saving" | "error" }) {
  const map = {
    saved: { text: "บันทึกแล้ว", cls: "badge-ok" },
    dirty: { text: "ยังไม่บันทึก…", cls: "" },
    saving: { text: "กำลังบันทึก…", cls: "" },
    error: { text: "บันทึกไม่สำเร็จ", cls: "badge-warn" },
  }[state];
  return (
    <span className={`badge ${map.cls}`} aria-live="polite">
      {map.text}
    </span>
  );
}
