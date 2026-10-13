"use client";

import { DEFAULT_LICENSE, licensesAllowed, SHARE_LICENSES, type ShareLicense } from "@/lib/share/license";
import { useCallback, useEffect, useState } from "react";
import { Portal } from "@/components/ui/Portal";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, LinkIcon, SparklesIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { describeShareAction, shareDialogAction, shareProjectAction, unshareProjectAction } from "@/app/projects/share-actions";
import { useProjectStore } from "@/store/useProjectStore";
import type { ScanResult } from "@/lib/share/service";
import { describeChangesAction, forkChangesAction, ownerInfoAction, saveSupportAction } from "@/app/projects/share-owner-actions";
import { IssuesTab, ProposalsTab, ProposeForm, SupportPicker } from "@/components/share/ShareOwnerPanels";
import type { OwnerInfo } from "@/lib/share/owner";
import type { SupportMode } from "@/lib/share/v2";

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
 * the files first (credentials refuse, personal values warn), asks for a title and a few words (the name is the sharer's, Settings) to
 * show, then gives the link. A project shared before gets "อัปเดตเวอร์ชัน" and "ลบลิงก์" instead.
 * Opens from the button, Ctrl+K ("แชร์โปรเจกต์"), or the `egs:share-open` window event.
 */
export function ShareButton({ projectId, projectName, className = "" }: { projectId: string; projectName: string; className?: string }) {
  const [open, setOpen] = useState(false);
  const [data, setData] = useState<Data | null>(null);
  const [loadError, setLoadError] = useState("");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [busy, setBusy] = useState(false);
  const [license, setLicense] = useState<ShareLicense>(DEFAULT_LICENSE);
  const [describing, setDescribing] = useState(false);
  const [describeError, setDescribeError] = useState("");
  // share system 1.2: how the owner looks after it, the owner's issues / proposals, a new version's note
  const [support, setSupport] = useState<{ mode: SupportMode; note: string }>({ mode: "self", note: "" });
  const [savedSupport, setSavedSupport] = useState<string>("");
  const [owner, setOwner] = useState<OwnerInfo | null>(null);
  const [tab, setTab] = useState<"link" | "issues" | "proposals">("link");
  const [notes, setNotes] = useState("");
  const [fixes, setFixes] = useState<number[]>([]);
  // a fork: what it changed against the share it was cloned from (prefilled from the file diff)
  const [changes, setChanges] = useState("");
  const [changesBusy, setChangesBusy] = useState(false);
  const [proposeOpen, setProposeOpen] = useState(false);

  // "ให้ AI สรุป" for a fork's "what changed": the same path as the description, given the diffs
  async function describeChanges() {
    if (changes.trim() && !window.confirm("แทนที่ข้อความที่พิมพ์ไว้ด้วยคำสรุปจาก AI?")) return;
    setChangesBusy(true);
    setDescribeError("");
    const r = await describeChangesAction(projectId, useProjectStore.getState().aiChoice ?? undefined).catch(() => null);
    setChangesBusy(false);
    if (!r) return setDescribeError("AI สรุปไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์เอง");
    if (!r.ok) return setDescribeError(r.error);
    setChanges(r.data);
  }

  const loadOwner = useCallback(async () => {
    const r = await ownerInfoAction(projectId).catch(() => null);
    if (!r?.ok) return;
    setOwner(r.data);
    if (r.data.extra) {
      setSupport(r.data.extra.support);
      setSavedSupport(JSON.stringify(r.data.extra.support));
    }
  }, [projectId]);

  async function saveSupport() {
    setBusy(true);
    const r = await saveSupportAction(projectId, support).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" });
    setSavedSupport(JSON.stringify(support));
    setMsg({ ok: true, text: "บันทึกการดูแลแล้ว" });
  }

  // "ให้ AI สรุป": the AI picked in the chat writes the description; the user edits it before sending
  async function describe() {
    if (description.trim() && !window.confirm("แทนที่ข้อความที่พิมพ์ไว้ด้วยคำสรุปจาก AI?")) return;
    setDescribing(true);
    setDescribeError("");
    const r = await describeShareAction(projectId, useProjectStore.getState().aiChoice ?? undefined).catch(() => null);
    setDescribing(false);
    if (!r) return setDescribeError("AI สรุปไม่สำเร็จ ลองใหม่อีกครั้ง หรือพิมพ์เอง");
    if (!r.ok) return setDescribeError(r.error);
    setDescription(r.data);
  }
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    const r = await shareDialogAction(projectId).catch(() => null);
    if (!r) return setLoadError("อ่านข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setLoadError(r.error);
    setData(r.data);
    setTitle((t) => t || r.data.state.share?.title || projectName);
    if (r.data.state.share) void loadOwner();
    else if (r.data.state.clonedFrom)
      void forkChangesAction(projectId)
        .then((c) => c.ok && setChanges((cur) => cur || c.data))
        .catch(() => {});
    // the share's own terms; a clone starts from the original's (it may not go looser, the site checks too)
    setLicense(r.data.state.share?.license ?? r.data.state.clonedFrom?.license ?? DEFAULT_LICENSE);
  }, [projectId, projectName, loadOwner]);

  useEffect(() => {
    const on = () => setOpen(true);
    window.addEventListener("egs:share-open", on);
    return () => window.removeEventListener("egs:share-open", on);
  }, []);

  // load once per opening: `busy` must not be a dependency here, or pressing สร้างลิงก์แชร์ re-ran the load,
  // which cleared the dialog and wiped the answer (a refusal looked like the dialog bouncing back)
  useEffect(() => {
    if (!open) return;
    setData(null);
    setOwner(null);
    setTab("link");
    setNotes("");
    setFixes([]);
    setProposeOpen(false);
    setMsg(null); // the answer of the last publish stays until the dialog is opened again
    void load();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  async function publish() {
    setBusy(true);
    setMsg(null);
    const first = !data?.state.share;
    const fork = first && !!data?.state.clonedFrom;
    const r = await shareProjectAction(projectId, {
      title,
      description,
      license,
      parent: data?.state.clonedFrom?.slug ?? null,
      ...(first ? { support } : { notes, fixes }),
      ...(fork ? { changes } : {}),
    }).catch(() => null);
    setBusy(false);
    if (!r) return setMsg({ ok: false, text: "ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setMsg({ ok: true, text: r.data.version > 1 ? `แชร์เวอร์ชัน ${r.data.version} แล้ว ลิงก์เดิมใช้ได้ต่อ คนที่โคลนไปจะเห็นว่ามีของใหม่` : "สร้างลิงก์แล้ว คัดลอกไปแปะในกระทู้หรือส่งให้เพื่อนได้เลย" });
    setNotes("");
    setFixes([]);
    if (fork) setProposeOpen(true);
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
  const canPublish = !!scan && scan.blocked.length === 0 && title.trim().length >= 3 && !busy;

  return (
    <>
      <button type="button" onClick={() => setOpen(true)} title="แชร์โปรเจกต์เป็นลิงก์ให้คนอื่นโคลน" className={`btn btn-soft tone-info btn-sm ${className}`}>
        <LinkIcon className="h-4 w-4" />
        <span className="hidden md:inline">{share ? "ลิงก์แชร์" : "แชร์"}</span>
      </button>

      {open && (
        <Portal>
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

              {share && owner?.v2 && (
                // an own share on a website with share system 1.2: the link, the issues people reported, proposals from forks
                <div className="border-b border-line px-5 pt-2">
                  <div className="seg no-scrollbar mb-2 max-w-full overflow-x-auto" role="tablist" aria-label="ส่วนของลิงก์แชร์">
                    {(
                      [
                        ["link", "ลิงก์และเวอร์ชัน", 0],
                        ["issues", "ปัญหาที่แจ้ง", owner.issues.filter((i) => i.status === "open" || i.status === "looking").length],
                        ["proposals", "ข้อเสนอจากทางแยก", owner.proposals.filter((p) => p.status === "open").length],
                      ] as const
                    ).map(([id, label, n]) => (
                      <button key={id} type="button" role="tab" aria-selected={tab === id} onClick={() => setTab(id)} className="seg-item h-8 shrink-0 text-[13px]">
                        {label}
                        {n > 0 && <span className="text-xs tabular-nums text-faint">{n}</span>}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {share && owner && tab === "issues" ? (
                <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                  <IssuesTab projectId={projectId} issues={owner.issues} onChanged={() => void loadOwner()} />
                </div>
              ) : share && owner && tab === "proposals" ? (
                <div className="max-h-[70vh] overflow-y-auto px-5 py-4">
                  <ProposalsTab projectId={projectId} proposals={owner.proposals} onChanged={() => void loadOwner()} />
                </div>
              ) : (
              <div className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
                {loadError && <p className="callout callout-warn text-sm">{loadError}</p>}
                {!data && !loadError && <p className="hint">กำลังสแกนไฟล์…</p>}
                {proposeOpen && data?.state.clonedFrom && (
                  <ProposeForm projectId={projectId} parentTitle={data.state.clonedFrom.title} initialSummary={changes} onDone={() => setProposeOpen(false)} />
                )}

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
                      <span className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold">เล่าสั้น ๆ</span>
                        <button type="button" onClick={describe} disabled={describing || busy} className="btn btn-soft tone-ai btn-sm" title="ให้ AI ที่เลือกในแชตอ่านโค้ดแล้วเขียนคำอธิบายให้ แก้ต่อได้">
                          <SparklesIcon className="h-4 w-4" />
                          {describing ? "กำลังสรุป…" : "ให้ AI สรุป"}
                        </button>
                      </span>
                      <textarea
                        value={description}
                        onChange={(e) => setDescription(e.target.value)}
                        maxLength={4000}
                        rows={3}
                        className="field w-full"
                        placeholder="ทำอะไร ใช้กับงานไหน หลังโคลนต้องตั้งค่าอะไรเอง (เช่น ใส่ token ใน Script Properties) พิมพ์เอง หรือกด ให้ AI สรุป"
                      />
                      {describeError && <span className="mt-1 block text-xs font-semibold text-danger">{describeError}</span>}
                    </label>
                    {!share && (
                      // the sharer is the Google account signed in here (lib/share/author.ts): one name everywhere,
                      // changed only in Settings, never typed per share
                      <p className="text-sm">
                        <span className="font-semibold">แชร์ในชื่อ</span>{" "}
                        {data.author ? <b className="font-semibold text-accent-text">{data.author.display}</b> : <span className="text-muted">อีเมล Google ของคุณแบบปิดบางส่วน</span>}{" "}
                        <a href={`/settings?s=google&from=${projectId}`} className="link text-xs">
                          เปลี่ยนในตั้งค่า
                        </a>
                      </p>
                    )}
                    <fieldset className="text-sm">
                      <legend className="mb-1 font-semibold">เงื่อนไขการใช้โค้ด</legend>
                      <div className="space-y-1.5">
                        {SHARE_LICENSES.filter((l) => licensesAllowed(data.state.clonedFrom ? (data.state.clonedFrom.license ?? DEFAULT_LICENSE) : null).includes(l.id)).map((l) => (
                          <label key={l.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 ${license === l.id ? "border-accent bg-accent-soft/40" : "border-line"}`}>
                            <input type="radio" name="share-license" checked={license === l.id} onChange={() => setLicense(l.id)} className="mt-1" />
                            <span className="min-w-0">
                              <span className="block font-semibold">{l.label}</span>
                              <span className="hint block text-xs">{l.text}</span>
                            </span>
                          </label>
                        ))}
                      </div>
                      {data.state.clonedFrom && <p className="hint mt-1 text-xs">ต่อยอดจากระบบของคนอื่น เลือกได้เฉพาะเงื่อนไขเดียวกับต้นฉบับหรือเข้มกว่า</p>}
                    </fieldset>
                    {!share && data.state.clonedFrom && (
                      <label className="block text-sm">
                        <span className="mb-1 flex items-center justify-between gap-2">
                          <span className="font-semibold">เปลี่ยนอะไรจากต้นฉบับ</span>
                          <button type="button" onClick={describeChanges} disabled={changesBusy || busy} className="btn btn-soft tone-ai btn-sm" title="ให้ AI ที่เลือกในแชตอ่านความต่างจากต้นฉบับแล้วสรุปให้ แก้ต่อได้">
                            <SparklesIcon className="h-4 w-4" />
                            {changesBusy ? "กำลังสรุป…" : "ให้ AI สรุป"}
                          </button>
                        </span>
                        <textarea value={changes} onChange={(e) => setChanges(e.target.value)} maxLength={2000} rows={3} className="field w-full" placeholder="เช่น - เพิ่มหน้ารายงานรายเดือน" />
                        <span className="hint mt-1 block text-xs">
                          จะขึ้นเป็นทางแยกของ <b>{data.state.clonedFrom.title}</b> ({data.state.clonedFrom.author}) เวอร์ชัน {data.state.clonedFrom.version}
                        </span>
                      </label>
                    )}
                    {!share && <SupportPicker value={support} onChange={setSupport} />}
                    {share && owner?.v2 && (
                      <>
                        <label className="block text-sm">
                          <span className="mb-1 block font-semibold">มีอะไรใหม่ในเวอร์ชันนี้</span>
                          <textarea value={notes} onChange={(e) => setNotes(e.target.value)} maxLength={2000} rows={2} className="field w-full" placeholder="คนที่โคลนไปจะเห็นข้อความนี้ตอนมีอัปเดต" />
                        </label>
                        {owner.issues.some((i) => i.status === "open" || i.status === "looking") && (
                          <fieldset className="text-sm">
                            <legend className="mb-1 font-semibold">เวอร์ชันนี้แก้ปัญหาที่แจ้งไว้</legend>
                            <div className="space-y-1">
                              {owner.issues
                                .filter((i) => i.status === "open" || i.status === "looking")
                                .map((i) => (
                                  <label key={i.number} className="flex cursor-pointer items-start gap-2">
                                    <input
                                      type="checkbox"
                                      checked={fixes.includes(i.number)}
                                      onChange={(e) => setFixes((cur) => (e.target.checked ? [...cur, i.number] : cur.filter((n) => n !== i.number)))}
                                      className="mt-1"
                                    />
                                    <span className="min-w-0 [overflow-wrap:anywhere]">
                                      <span className="font-mono text-xs text-muted">#{i.number}</span> {i.title}
                                    </span>
                                  </label>
                                ))}
                            </div>
                          </fieldset>
                        )}
                        <SupportPicker value={support} onChange={setSupport} />
                        {JSON.stringify(support) !== savedSupport && (
                          <button type="button" onClick={saveSupport} disabled={busy} className="btn btn-secondary btn-sm">
                            บันทึกการดูแล
                          </button>
                        )}
                      </>
                    )}
                    <p className="hint">
                      ทุกคนที่มีลิงก์อ่านโค้ดและโคลนลงเครื่องตัวเองได้ ลิงก์ขึ้นในห้อง แชร์ระบบที่สร้าง เมื่อคุณตั้งกระทู้ · คนที่โคลนไปต้องใช้ตามเงื่อนไขที่คุณเลือกข้างบน
                    </p>
                  </>
                )}

                {msg && <p className={`text-sm font-semibold ${msg.ok ? "text-accent-text" : "text-danger"}`}>{msg.text}</p>}
              </div>
              )}

              {tab === "link" && (
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
                    {busy ? "กำลังส่ง…" : share ? "แชร์เวอร์ชันใหม่" : "สร้างลิงก์แชร์"}
                  </button>
                </span>
              </div>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
