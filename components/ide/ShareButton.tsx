"use client";

import { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, LinkIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { shareDialogAction, shareProjectAction, unshareProjectAction } from "@/app/projects/share-actions";
import type { ScanResult } from "@/lib/share/service";

type Loaded = Awaited<ReturnType<typeof shareDialogAction>>;
type Data = Extract<Loaded, { ok: true }>["data"];

const BOARD_NEW = "https://easygaside.tech/board/new?share=";
const kb = (n: number): string => (n < 1000 ? `${n} B` : `${Math.round(n / 100) / 10} KB`);

function Findings({ scan }: { scan: ScanResult }) {
  if (scan.blocked.length) {
    return (
      <div className="callout callout-danger items-start text-[13px]">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <b>แชร์ไม่ได้จนกว่าจะเอาคีย์ออก</b> — ย้ายไป Script Properties แล้วอ่านด้วย PropertiesService
          <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-xs">
            {scan.blocked.slice(0, 8).map((f, i) => (
              <li key={i}>
                {f.kind} · {f.file}:{f.line} · {f.sample}
              </li>
            ))}
          </ul>
        </div>
      </div>
    );
  }
  if (scan.warnings.length) {
    return (
      <div className="callout callout-warn items-start text-[13px]">
        <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0">
          <b>มีค่าที่เป็นของคุณติดอยู่ในโค้ด</b> — คนที่โคลนไปต้องเปลี่ยนเอง (จะโชว์เตือนไว้ใต้ลิงก์)
          <ul className="mt-1 list-disc space-y-0.5 pl-4 font-mono text-xs">
            {scan.warnings.slice(0, 6).map((f, i) => (
              <li key={i}>
                {f.kind} · {f.file}:{f.line} · {f.sample}
              </li>
            ))}
            {scan.warnings.length > 6 && <li>และอีก {scan.warnings.length - 6} จุด</li>}
          </ul>
        </div>
      </div>
    );
  }
  return (
    <p className="flex items-center gap-1.5 text-[13px] text-accent-text">
      <CheckCircleIcon className="h-4 w-4" /> สแกนแล้ว ไม่พบคีย์หรือข้อมูลส่วนตัวใน {scan.fileCount} ไฟล์ ({kb(scan.bytes)})
    </p>
  );
}

/**
 * "แชร์โปรเจกต์": publish this project as an EasyGAS link others clone into their own IDE. The dialog scans
 * the files first (credentials refuse, personal values warn), asks for a title, a few words and the name to
 * show, then gives the link. A project shared before gets "อัปเดตเวอร์ชัน" and "ลบลิงก์" instead.
 * Opens from the button, Ctrl+K ("แชร์โปรเจกต์"), or the `egs:share-open` window event.
 */
export function ShareButton({ projectId, projectName, className = "" }: { projectId: string; projectName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    setMsg(null);
    const r = await shareDialogAction(projectId).catch(() => null);
    if (!r) return setLoadError("อ่านข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setLoadError(r.error);
    setData(r.data);
    setTitle((t) => t || r.data.state.share?.title || projectName);
    setName((n) => n || r.data.name);
  }, [projectId, projectName]);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("egs:share-open", on);
    return () => window.removeEventListener("egs:share-open", on);
  }, []);

  useEffect(() => {
    if (!open) return;
    setData(null);
    void load();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, load, busy]);

  async function publish() {
    setBusy(true);
    setMsg(null);
    const r = await shareProjectAction(projectId, { title, description, name, parent: data?.state.clonedFrom?.slug ?? null }).catch(() => null);
    setBusy(false);
    if (!r) return setMsg({ ok: false, text: "ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.data.version > 1 ? `อัปเดตเป็นเวอร์ชัน ${r.data.version} แล้ว ลิงก์เดิมใช้ได้ต่อ` : "สร้างลิงก์แล้ว คัดลอกไปแปะในกระทู้หรือส่งให้เพื่อนได้เลย" });
    await load();
  }

  async function remove() {
    setBusy(true);
    const r = await unshareProjectAction(projectId).catch(() => null);
    setBusy(false);
    setConfirmRemove(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "ลบไม่สำเร็จ ลองใหม่อีกครั้ง" });
    setMsg({ ok: true, text: "ลบลิงก์แล้ว คนที่มีลิงก์เดิมจะโคลนไม่ได้อีก" });
    await load();
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1800);
    } catch {
      /* select by hand */
    }
  }

  const share = data?.state.share ?? null;
  const scan = data?.scan ?? null;
  const canPublish = !!scan && scan.blocked.length === 0 && title.trim().length >= 3 && name.trim().length > 0 && !busy;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="แชร์โปรเจกต์เป็นลิงก์ให้คนอื่นโคลน" className={`btn btn-soft tone-info btn-sm ${className}`}>
        <LinkIcon className="h-4 w-4" />
        <span className="hidden md:inline">{share ? "ลิงก์แชร์" : "แชร์"}</span>
      </button>

      {open &&
        createPortal(
          <div className="dialog-backdrop" onClick={() => !busy && setOpen(false)}>
            <div role="dialog" aria-modal="true" aria-label="แชร์โปรเจกต์" className="dialog max-w-lg p-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                  <span className="icon-chip tone-info">
                    <LinkIcon className="h-4 w-4" />
                  </span>
                  {share ? "ลิงก์แชร์ของโปรเจกต์นี้" : "แชร์โปรเจกต์เป็นลิงก์"}
                </h3>
                <button type="button" onClick={() => !busy && setOpen(false)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
                {loadError && <p className="callout callout-warn text-sm">{loadError}</p>}
                {!data && !loadError && <p className="hint">กำลังสแกนไฟล์…</p>}

                {share && (
                  <div className="rounded-lg border border-line bg-sunken p-3">
                    <p className="hint">ลิงก์แชร์ · เวอร์ชัน {share.version}</p>
                    <div className="mt-1 flex flex-wrap items-center gap-2">
                      <code className="min-w-0 flex-1 truncate font-mono text-[13px]">{share.url}</code>
                      <button type="button" onClick={() => copy(share.url)} className="btn btn-secondary btn-sm">
                        <ClipboardDocumentIcon className="h-4 w-4" />
                        {copied ? "คัดลอกแล้ว" : "คัดลอก"}
                      </button>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <a href={share.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        เปิดหน้าแชร์
                      </a>
                      <a href={`${BOARD_NEW}${share.slug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        ตั้งกระทู้บนเว็บบอร์ด
                      </a>
                    </div>
                  </div>
                )}

                {data?.scanError && <p className="callout callout-warn text-sm">{data.scanError}</p>}
                {scan && <Findings scan={scan} />}

                {data && !data.scanError && (
                  <>
                    <label className="block text-sm">
                      <span className="mb-1 block font-semibold">ชื่อระบบ</span>
                      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} className="field w-full" placeholder="เช่น ระบบจองห้องประชุม + LINE แจ้งเตือน" />
                    </label>
                    <label className="block text-sm">
                      <span className="mb-1 block font-semibold">เล่าสั้น ๆ</span>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={4000}
                        rows={3}
                        className="field w-full"
                        placeholder="ทำอะไร ใช้กับงานไหน หลังโคลนต้องตั้งค่าอะไรเอง (เช่น ใส่ token ใน Script Properties)"
                      />
                    </label>
                    {!share && (
                      <label className="block text-sm">
                        <span className="mb-1 block font-semibold">ชื่อที่แสดงบนลิงก์</span>
                        <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} className="field w-full sm:max-w-xs" placeholder="เช่น ต้นกล้า" />
                      </label>
                    )}
                    {!share && data.state.clonedFrom && (
                      <p className="hint">
                        จะระบุว่าต่อยอดจาก <b>{data.state.clonedFrom.title}</b> ของ {data.state.clonedFrom.author}
                      </p>
                    )}
                    <p className="hint">
                      ทุกคนที่มีลิงก์อ่านโค้ดและโคลนลงเครื่องตัวเองได้ ลิงก์ขึ้นในห้อง แชร์ระบบที่สร้าง เมื่อคุณตั้งกระทู้ · โค้ดที่โคลนไปเป็นของผู้โคลน แก้ได้ ขายต่อไม่ได้
                    </p>
                  </>
                )}

                {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-accent-text" : "text-danger"}`}>{msg.text}</p>}
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-5 py-3.5">
                {share ? (
                  confirmRemove ? (
                    <span className="flex items-center gap-2 text-sm">
                      ลบลิงก์นี้ออกจากเว็บ?
                      <button type="button" onClick={remove} disabled={busy} className="btn btn-secondary btn-sm text-danger">
                        ลบเลย
                      </button>
                      <button type="button" onClick={() => setConfirmRemove(false)} className="btn btn-ghost btn-sm">
                        ไม่ลบ
                      </button>
                    </span>
                  ) : (
                    <button type="button" onClick={() => setConfirmRemove(true)} disabled={busy} className="btn btn-ghost btn-sm text-danger">
                      <TrashIcon className="h-4 w-4" />
                      ลบลิงก์
                    </button>
                  )
                ) : (
                  <span />
                )}
                <span className="flex gap-2">
                  <button type="button" onClick={() => setOpen(false)} disabled={busy} className="btn btn-secondary">
                    ปิด
                  </button>
                  <button type="button" onClick={publish} disabled={!canPublish} className="btn btn-primary">
                    <LinkIcon className="h-4 w-4" />
                    {busy ? "กำลังส่ง…" : share ? "อัปเดตเวอร์ชัน" : "สร้างลิงก์แชร์"}
                  </button>
                </span>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
