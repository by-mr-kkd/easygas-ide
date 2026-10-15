"use client";

import { DEFAULT_LICENSE, licensesAllowed, SHARE_LICENSES, type ShareLicense } from "@/lib/share/license";
import { useCallback, useEffect, useRef, useState, type CSSProperties } from "react";
import { Portal } from "@/components/ui/Portal";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, ClipboardDocumentIcon, ExclamationTriangleIcon, LinkIcon, ShareIcon, SparklesIcon, TrashIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { describeShareAction, shareDialogAction, shareImagesAction, shareProjectAction, unshareProjectAction } from "@/app/projects/share-actions";
import { compressImage, splitDataUrl, type CompressedImage } from "@/lib/client/image-compress";
import { PhotoIcon, PlusIcon } from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import type { ScanResult } from "@/lib/share/service";
import { boardLinkAction, describeChangesAction, forkChangesAction, ownerInfoAction, saveSupportAction } from "@/app/projects/share-owner-actions";
import { IssuesTab, ProposalsTab, ProposeForm, SupportPicker } from "@/components/share/ShareOwnerPanels";
import type { OwnerInfo } from "@/lib/share/owner";
import type { SupportMode } from "@/lib/share/v2";

type Loaded = Awaited<ReturnType<typeof shareDialogAction>>;
type Data = Extract<Loaded, { ok: true }>["data"];

/** a picture on the share page: already on the website (url) or picked here and not sent yet (data) */
type Pic = { url: string } | { data: CompressedImage };
const PHOTOS_MAX = 4;
const picSrc = (p: Pic): string => ("url" in p ? p.url : p.data.dataUrl);
const picInput = (p: Pic): { url: string } | { data: string } => ("url" in p ? { url: p.url } : { data: p.data.dataBase64 });

/** One picture slot: the picture with a remove button, or an "add" button. */
function PictureSlot({ pic, label, wide, disabled, onPick, onRemove }: { pic: Pic | null; label: string; wide?: boolean; disabled?: boolean; onPick: () => void; onRemove: () => void }) {
  const box = wide ? "h-20 w-36" : "h-20 w-20";
  if (!pic)
    return (
      <button type="button" onClick={onPick} disabled={disabled} className={`field flex ${box} flex-col items-center justify-center gap-1 text-xs text-muted`} title={label}>
        <PlusIcon className="h-4 w-4" />
        {label}
      </button>
    );
  return (
    <span className={`relative ${box} overflow-hidden rounded-lg border border-line`}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img src={picSrc(pic)} alt={label} className="h-full w-full object-cover" />
      <button type="button" onClick={onRemove} disabled={disabled} aria-label={`เอา${label}ออก`} className="absolute right-1 top-1 rounded-full bg-black/60 p-0.5 text-white">
        <XMarkIcon className="h-3.5 w-3.5" />
      </button>
    </span>
  );
}

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
  // pictures for the share page: a cover and up to PHOTOS_MAX photos; sent after the link exists
  const [cover, setCover] = useState<Pic | null>(null);
  const [photos, setPhotos] = useState<Pic[]>([]);
  const [savedPics, setSavedPics] = useState("");
  const [picsBusy, setPicsBusy] = useState(false);
  const [picsError, setPicsError] = useState("");
  const picRef = useRef<HTMLInputElement>(null);
  const picKindRef = useRef<"cover" | "photo">("photo");
  const picsKey = (c: Pic | null, ps: Pic[]) => JSON.stringify([c ? picSrc(c).slice(0, 200) : "", ps.map((p) => picSrc(p).slice(0, 200))]);
  const picsDirty = picsKey(cover, photos) !== savedPics;

  function pickPicture(kind: "cover" | "photo") {
    picKindRef.current = kind;
    if (picRef.current) {
      picRef.current.value = "";
      picRef.current.click();
    }
  }
  async function onPictureFiles(files: FileList | null) {
    if (!files?.length) return;
    setPicsError("");
    try {
      if (picKindRef.current === "cover") setCover({ data: await compressImage(files[0]) });
      else {
        const room = Math.max(0, PHOTOS_MAX - photos.length);
        const added: Pic[] = [];
        for (const f of Array.from(files).slice(0, room)) added.push({ data: await compressImage(f) });
        setPhotos((cur) => [...cur, ...added].slice(0, PHOTOS_MAX));
      }
    } catch {
      setPicsError("เปิดไฟล์รูปนี้ไม่ได้ ลองรูปอื่น (JPG, PNG, WebP)");
    }
  }
  /** Send the pictures as they are now; true when the website took them. */
  async function savePictures(): Promise<boolean> {
    setPicsBusy(true);
    setPicsError("");
    const r = await shareImagesAction(projectId, { cover: cover ? picInput(cover) : null, images: photos.map(picInput) }).catch(() => null);
    setPicsBusy(false);
    if (!r || !r.ok) {
      setPicsError(r && !r.ok ? r.error : "ส่งรูปไม่สำเร็จ ลองใหม่อีกครั้ง");
      return false;
    }
    const c = r.data.cover ? { url: r.data.cover } : null;
    const ps = r.data.images.map((url) => ({ url }));
    setCover(c);
    setPhotos(ps);
    setSavedPics(picsKey(c, ps));
    useProjectStore.getState().setSharePics({ cover: null, photos: [] }); // the chat's picks are on the website now
    return true;
  }

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
  // a successful share shows a full-dialog "done" card first (on a phone the line at the bottom sat under the fold);
  // tapping it reveals the dialog scrolled to the top, where the link is
  const [celebrate, setCelebrate] = useState<{ title: string; text: string } | null>(null);
  const bodyRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLParagraphElement>(null);
  useEffect(() => {
    if (msg && !msg.ok) msgRef.current?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [msg]);
  function closeCelebrate() {
    setCelebrate(null);
    bodyRef.current?.scrollTo({ top: 0, behavior: "smooth" });
  }
  const [copied, setCopied] = useState(false);
  const [confirmRemove, setConfirmRemove] = useState(false);

  const load = useCallback(async () => {
    setLoadError("");
    const r = await shareDialogAction(projectId).catch(() => null);
    if (!r) return setLoadError("อ่านข้อมูลไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setLoadError(r.error);
    setData(r.data);
    setTitle((t) => t || r.data.state.share?.title || projectName);
    // what the chat's "เตรียมแชร์" made (ShareKit): the AI's description fills an empty box, its pictures take the free slots
    const kit = useProjectStore.getState();
    setDescription((d) => d || kit.shareDraft || "");
    {
      const c = r.data.state.share?.cover ? { url: r.data.state.share.cover } : null;
      const ps = (r.data.state.share?.images ?? []).map((url) => ({ url }));
      setSavedPics(picsKey(c, ps));
      setCover(kit.sharePics.cover ? { data: splitDataUrl(kit.sharePics.cover) } : c);
      setPhotos([...ps, ...kit.sharePics.photos.map((d) => ({ data: splitDataUrl(d) }))].slice(0, PHOTOS_MAX));
    }
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
    setCelebrate(null);
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
    // the pictures ride after the link exists (the website keys them by the share)
    const picsOk = picsDirty ? await savePictures() : true;
    setCelebrate({
      title: r.data.version > 1 ? `แชร์เวอร์ชัน ${r.data.version} แล้ว` : "แชร์สำเร็จ",
      text:
        (r.data.version > 1 ? "ลิงก์เดิมใช้ได้ต่อ คนที่โคลนไปจะเห็นว่ามีของใหม่" : "ขึ้นเป็นกระทู้ในห้อง แชร์ระบบที่สร้าง ให้เองแล้ว คัดลอกลิงก์ส่งให้เพื่อนได้เลย") +
        (picsOk ? "" : " · รูปยังไม่ได้ส่ง กดบันทึกรูปอีกครั้ง"),
    });
    setNotes("");
    setFixes([]);
    if (fork) setProposeOpen(true);
    useProjectStore.getState().setShareDraft(null); // the description went with the share
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
  // the thread link that opens it as its poster (edit the post, add pictures); fetched once the dialog shows a share
  const [boardUrl, setBoardUrl] = useState<string | null>(null);
  const shareSlug = share?.slug ?? null;
  useEffect(() => {
    setBoardUrl(null);
    if (!open || !shareSlug) return;
    let live = true;
    void boardLinkAction(projectId)
      .then((r) => live && r.ok && setBoardUrl(r.data))
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [open, shareSlug, projectId]);
  const scan = data?.scan ?? null;
  const canPublish = !!scan && scan.blocked.length === 0 && title.trim().length >= 3 && !busy;

  return (
    <>
      {/* a share icon, not a link one: the app-link bar below the toolbar already shows a link icon for "copy the link" */}
      <button type="button" onClick={() => setOpen(true)} title="แชร์โปรเจกต์เป็นลิงก์ให้คนอื่นโคลน" aria-label="แชร์โปรเจกต์" className={`btn btn-soft tone-info btn-sm ${className}`}>
        <ShareIcon className="h-4 w-4" />
        <span className="hidden md:inline">{share ? "ลิงก์แชร์" : "แชร์"}</span>
      </button>

      {open && (
        <Portal>
          <div className="dialog-backdrop" onClick={() => !busy && setOpen(false)}>
            <div role="dialog" aria-modal="true" aria-label="แชร์โปรเจกต์" className="dialog relative max-w-lg overflow-hidden p-0" onClick={(e) => e.stopPropagation()}>
              {celebrate && (
                <button
                  type="button"
                  onClick={closeCelebrate}
                  aria-live="polite"
                  className="share-done absolute inset-0 z-20 flex flex-col items-center justify-center gap-3 bg-surface px-8 text-center"
                >
                  <span className="share-done-burst" aria-hidden="true">
                    {Array.from({ length: 8 }, (_, i) => (
                      <i key={i} style={{ "--a": `${i * 45}deg` } as CSSProperties} />
                    ))}
                  </span>
                  <span className="share-done-check grid h-16 w-16 place-items-center rounded-full bg-accent text-on-accent">
                    <CheckCircleIcon className="h-10 w-10" />
                  </span>
                  <span className="text-lg font-semibold">{celebrate.title}</span>
                  <span className="max-w-xs text-sm text-muted">{celebrate.text}</span>
                  <span className="btn btn-primary mt-2">
                    <LinkIcon className="h-4 w-4" />
                    ดูลิงก์และคัดลอก
                  </span>
                </button>
              )}
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                  <span className="icon-chip tone-info">
                    <ShareIcon className="h-4 w-4" />
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
              <div ref={bodyRef} className="max-h-[70vh] space-y-4 overflow-y-auto px-5 py-4">
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
                      {/* the website makes the share's thread in แชร์ระบบที่สร้าง by itself; /board opens it */}
                      <a href={boardUrl ?? `${share.url.replace(/\/+$/, "")}/board`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm" title="เปิดในฐานะเจ้าของ แก้ไขโพสต์และแนบรูปได้">
                        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        ดูกระทู้ในเว็บบอร์ด
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
                    <div className="text-sm">
                      <span className="mb-1 flex items-center justify-between gap-2">
                        <span className="font-semibold">
                          รูปปกและรูปประกอบ <span className="font-normal text-muted">(ไม่บังคับ · รูปประกอบไม่เกิน {PHOTOS_MAX} รูป)</span>
                        </span>
                        {share && picsDirty && (
                          <button type="button" onClick={() => void savePictures()} disabled={picsBusy || busy} className="btn btn-secondary btn-sm">
                            <PhotoIcon className="h-4 w-4" />
                            {picsBusy ? "กำลังส่งรูป…" : "บันทึกรูป"}
                          </button>
                        )}
                      </span>
                      <div className="flex flex-wrap gap-2">
                        <PictureSlot pic={cover} label="รูปปก" wide disabled={picsBusy || busy} onPick={() => pickPicture("cover")} onRemove={() => setCover(null)} />
                        {photos.map((p, i) => (
                          <PictureSlot key={picSrc(p).slice(-40) + i} pic={p} label={`รูปที่ ${i + 1}`} disabled={picsBusy || busy} onPick={() => {}} onRemove={() => setPhotos((cur) => cur.filter((_, j) => j !== i))} />
                        ))}
                        {photos.length < PHOTOS_MAX && <PictureSlot pic={null} label="เพิ่มรูป" disabled={picsBusy || busy} onPick={() => pickPicture("photo")} onRemove={() => {}} />}
                      </div>
                      <input ref={picRef} type="file" accept="image/*" multiple className="hidden" onChange={(e) => void onPictureFiles(e.target.files)} />
                      {!share && picsDirty && <span className="hint mt-1 block text-xs">รูปจะถูกส่งขึ้นเว็บหลังสร้างลิงก์แชร์</span>}
                      {picsError && <span className="mt-1 block text-xs font-semibold text-danger">{picsError}</span>}
                    </div>
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
                      ทุกคนที่มีลิงก์อ่านโค้ดและโคลนลงเครื่องตัวเองได้ ระบบตั้งกระทู้ในห้อง แชร์ระบบที่สร้าง ให้เองตอนสร้างลิงก์ (คนอื่นถามตอบในกระทู้นั้นได้ กด "ดูกระทู้ในเว็บบอร์ด" เพื่อแก้โพสต์หรือแนบรูป) · คนที่โคลนไปต้องใช้ตามเงื่อนไขที่คุณเลือกข้างบน
                    </p>
                  </>
                )}

                {msg && (
                  <p ref={msgRef} className={`text-sm font-semibold ${msg.ok ? "text-accent-text" : "text-danger"}`}>
                    {msg.text}
                  </p>
                )}
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
