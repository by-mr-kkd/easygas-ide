"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  ArrowsRightLeftIcon,
  BellAlertIcon,
  BellIcon,
  BugAntIcon,
  ChevronLeftIcon,
  DocumentDuplicateIcon,
  StarIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { StarIcon as StarSolid } from "@heroicons/react/24/solid";
import { Portal } from "@/components/ui/Portal";
import { ThreeWayDiff, TakeSummary } from "@/components/share/ThreeWayDiff";
import {
  compareSourceAction,
  deleteSourceReviewAction,
  followSourceAction,
  previewIssueAction,
  reportIssueAction,
  reviewSourceAction,
  shareNoticesAction,
  sourceInfoAction,
  sourceReviewsAction,
  takeSourceUpdateAction,
} from "@/app/projects/share-source-actions";
import { saveDirtyFiles } from "@/lib/client/save-files";
import { supportLabel, type ShareReview } from "@/lib/share/v2";
import type { Compare, SourceInfo, TakeResult } from "@/lib/share/source";
import type { IssuePayload } from "@/lib/share/report";
import { useProjectStore } from "@/store/useProjectStore";

type View = "main" | "compare" | "report" | "review" | "taken";

const date = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

/** Show the chat (narrow windows show one pane at a time) — IdeShell listens. */
const showChat = () => window.dispatchEvent(new Event("egs:show-chat"));

/**
 * "ต้นฉบับ" (a project cloned from a share link): the share it came from — its newest version and what changed,
 * how its owner looks after it — and what to do about it: compare (base · latest · mine), take the update
 * (files the user never touched are replaced; files changed on both sides become ONE chat message the user
 * sends), report a problem, review, follow. A toolbar button with a small "มี vN" when the source moved on;
 * the chat box stays the most visible thing.
 */
export function SourceButton({ projectId, className = "" }: { projectId: string; className?: string }) {
  const router = useRouter();
  const setDraft = useProjectStore((s) => s.setDraft);
  const [open, setOpen] = useState(false);
  const [view, setView] = useState<View>("main");
  const [behind, setBehind] = useState<number | null>(null);
  const [info, setInfo] = useState<SourceInfo | null>(null);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [compare, setCompare] = useState<Compare | null>(null);
  const [taken, setTaken] = useState<TakeResult | null>(null);
  const [following, setFollowing] = useState<{ on: boolean; n: number } | null>(null);

  // the toolbar badge: from the server's cached notices (a client effect, never at render)
  useEffect(() => {
    let live = true;
    shareNoticesAction()
      .then((r) => {
        if (live && r.ok) setBehind(r.data.behind[projectId] ?? null);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);

  const load = useCallback(async () => {
    setError("");
    setInfo(null);
    const r = await sourceInfoAction(projectId).catch(() => null);
    if (!r) return setError("ติดต่อเว็บไซต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setError(r.error);
    setInfo(r.data);
    setFollowing(r.data.extra ? { on: !!r.data.extra.me?.following, n: r.data.extra.followers } : null);
    setBehind(r.data.latest && r.data.latest > r.data.base ? r.data.latest : null);
  }, [projectId]);

  useEffect(() => {
    if (!open) return;
    setView("main");
    setTaken(null);
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

  async function openCompare() {
    setView("compare");
    setCompare(null);
    setError("");
    const r = await compareSourceAction(projectId).catch(() => null);
    if (!r || !r.ok) {
      setView("main");
      return setError(r && !r.ok ? r.error : "โหลดโค้ดต้นฉบับไม่สำเร็จ");
    }
    setCompare(r.data);
  }

  async function takeUpdate() {
    setBusy(true);
    setError("");
    await saveDirtyFiles(projectId); // the user's unsaved edits count as "mine"
    const r = await takeSourceUpdateAction(projectId).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setError(r && !r.ok ? r.error : "รับอัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
    setTaken(r.data);
    setView("taken");
    setBehind(null);
    if (r.data.draft) setDraft({ text: r.data.draft, mode: "append" });
    router.refresh(); // the editor shows the new files
  }

  async function toggleFollow() {
    if (!following) return;
    setBusy(true);
    const r = await followSourceAction(projectId, !following.on).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setError(r && !r.ok ? r.error : "ไม่สำเร็จ ลองใหม่อีกครั้ง");
    setFollowing({ on: r.data.following, n: r.data.followers });
  }

  const x = info?.extra ?? null;
  const canReport = !!x?.v2 && x.support.mode !== "self";
  const wide = view === "compare";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title={behind ? `ต้นฉบับมีเวอร์ชันใหม่ (v${behind})` : "ต้นฉบับที่โคลนมา: เทียบโค้ด รับอัปเดต แจ้งปัญหา รีวิว"}
        className={`btn btn-ghost btn-sm ${className}`}
      >
        <DocumentDuplicateIcon className="h-4 w-4 text-info" />
        <span className="hidden md:inline">ต้นฉบับ</span>
        {behind && <span className="badge badge-warn !px-1.5 !py-0 text-[10.5px]">มี v{behind}</span>}
      </button>

      {open && (
        <Portal>
          <div className="dialog-backdrop" onClick={() => !busy && setOpen(false)}>
            <div role="dialog" aria-modal="true" aria-label="ต้นฉบับ" className={`dialog flex max-h-[90vh] flex-col p-0 ${wide ? "max-w-6xl" : "max-w-xl"}`} onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3.5">
                <h3 className="flex min-w-0 items-center gap-2 text-[15px] font-semibold">
                  {view !== "main" && view !== "taken" ? (
                    <button type="button" onClick={() => setView("main")} aria-label="กลับ" className="btn btn-ghost btn-sm btn-icon">
                      <ChevronLeftIcon className="h-4 w-4" />
                    </button>
                  ) : (
                    <span className="icon-chip tone-info">
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    </span>
                  )}
                  <span className="truncate">
                    {view === "compare" ? "เทียบกับต้นฉบับ" : view === "report" ? "แจ้งปัญหาให้เจ้าของ" : view === "review" ? "รีวิวต้นฉบับ" : view === "taken" ? "รับอัปเดตแล้ว" : "ต้นฉบับ"}
                  </span>
                </h3>
                <button type="button" onClick={() => !busy && setOpen(false)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>

              {view === "compare" ? (
                compare ? (
                  <ThreeWayDiff base={compare.base} latest={compare.latest} mine={compare.mine} plans={compare.plans} />
                ) : (
                  <p className="hint px-5 py-10 text-center">กำลังโหลดโค้ดต้นฉบับ…</p>
                )
              ) : (
                <div className="min-h-0 space-y-4 overflow-y-auto px-5 py-4">
                  {error && <p className="callout callout-warn text-sm">{error}</p>}
                  {!info && !error && <p className="hint">กำลังดูต้นฉบับ…</p>}

                  {info && view === "main" && (
                    <>
                      <div>
                        <p className="text-[15px] font-semibold leading-snug [overflow-wrap:anywhere]">{info.title}</p>
                        <p className="hint mt-0.5">
                          โดย {info.author} · ใช้อยู่ v{info.base}
                          {info.latest !== null && ` · ล่าสุด v${info.latest}`}
                        </p>
                        {x?.v2 && (
                          <p className="mt-2 flex flex-wrap items-center gap-1.5 text-xs">
                            <span className="badge">{supportLabel(x.support.mode)}</span>
                            {x.rating.count > 0 && (
                              <span className="badge">
                                <StarSolid className="h-3.5 w-3.5 text-warn-text" aria-hidden />
                                {x.rating.avg} ({x.rating.count})
                              </span>
                            )}
                            {x.issues.open > 0 && <span className="badge">ปัญหาที่เปิดอยู่ {x.issues.open}</span>}
                          </p>
                        )}
                        {x?.support.note && <p className="hint mt-1 text-xs">{x.support.note}</p>}
                      </div>

                      {info.gone && <p className="callout callout-warn text-sm">ลิงก์ต้นฉบับถูกลบไปแล้ว โค้ดในโปรเจกต์นี้ยังใช้ได้ตามปกติ</p>}
                      {info.proLocked && <p className="callout callout-warn text-sm">ต้นฉบับเวอร์ชันนี้ใช้กล้องบน GitHub Pages เปิดให้เฉพาะ Pro ดูโค้ดและรับอัปเดต</p>}

                      {info.latest !== null && info.latest > info.base ? (
                        <section className="rounded-lg border border-line p-3">
                          <p className="text-sm font-semibold">ต้นฉบับมี v{info.latest} (คุณใช้ v{info.base})</p>
                          {info.newer.length > 0 ? (
                            <ul className="mt-2 space-y-2 text-[13px]">
                              {info.newer.slice(0, 8).map((v) => (
                                <li key={v.version}>
                                  <span className="font-semibold">v{v.version}</span>
                                  {v.createdAt && <span className="hint"> · {date(v.createdAt)}</span>}
                                  {v.notes && <span className="block whitespace-pre-wrap">{v.notes}</span>}
                                  {v.fixes.length > 0 && <span className="hint block text-xs">แก้ปัญหา {v.fixes.map((n) => `#${n}`).join(" ")}</span>}
                                </li>
                              ))}
                            </ul>
                          ) : (
                            <p className="hint mt-1">เจ้าของไม่ได้เขียนว่าเปลี่ยนอะไร ดูได้จากปุ่มเทียบกับต้นฉบับ</p>
                          )}
                          <div className="mt-3 flex flex-wrap gap-2">
                            <button type="button" onClick={takeUpdate} disabled={busy} className="btn btn-primary btn-sm">
                              <ArrowPathIcon className="h-4 w-4" />
                              {busy ? "กำลังรับอัปเดต…" : "รับอัปเดต"}
                            </button>
                            <button type="button" onClick={openCompare} disabled={busy} className="btn btn-secondary btn-sm">
                              <ArrowsRightLeftIcon className="h-4 w-4" />
                              เทียบกับต้นฉบับ
                            </button>
                          </div>
                          <p className="hint mt-2 text-xs">
                            เก็บโค้ดตอนนี้ไว้ในประวัติก่อน ไฟล์ที่คุณไม่ได้แก้รับของใหม่ทันที ไฟล์ที่คุณแก้ไว้คงเดิม ไฟล์ที่แก้ทั้งสองฝั่งจะเป็นข้อความให้ AI รวมในกล่องแชต (คุณกดส่งเอง)
                          </p>
                        </section>
                      ) : (
                        !info.gone &&
                        !info.proLocked && (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="hint">ใช้เวอร์ชันล่าสุดของต้นฉบับอยู่แล้ว</span>
                            <button type="button" onClick={openCompare} className="btn btn-secondary btn-sm">
                              <ArrowsRightLeftIcon className="h-4 w-4" />
                              เทียบกับต้นฉบับ
                            </button>
                          </div>
                        )
                      )}

                      {!info.gone && (
                        <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
                          {canReport && (
                            <button type="button" onClick={() => setView("report")} className="btn btn-soft tone-warn btn-sm">
                              <BugAntIcon className="h-4 w-4" />
                              แจ้งปัญหา
                            </button>
                          )}
                          {x?.v2 && (
                            <button type="button" onClick={() => setView("review")} className="btn btn-secondary btn-sm">
                              <StarIcon className="h-4 w-4" />
                              {x.me?.review ? "แก้รีวิวของฉัน" : "รีวิว"}
                            </button>
                          )}
                          {following && (
                            <button type="button" onClick={toggleFollow} disabled={busy} aria-pressed={following.on} className="btn btn-ghost btn-sm">
                              {following.on ? <BellAlertIcon className="h-4 w-4 text-info" /> : <BellIcon className="h-4 w-4" />}
                              {following.on ? "ติดตามอยู่" : "ติดตาม"}
                              <span className="text-xs tabular-nums text-faint">{following.n}</span>
                            </button>
                          )}
                          <span className="flex-1" />
                          <a href={info.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                            หน้าแชร์
                          </a>
                        </div>
                      )}
                      {x?.v2 && x.support.mode === "self" && <p className="hint text-xs">เจ้าของแจกโค้ดนี้ให้ปรับเอง ไม่ได้รับแจ้งบัค ถามในกระทู้ของลิงก์นี้แทน</p>}
                      {x && !x.v2 && <p className="hint text-xs">เว็บไซต์ยังไม่รองรับรีวิว การแจ้งปัญหา และการติดตาม</p>}
                    </>
                  )}

                  {info && view === "report" && <ReportForm projectId={projectId} onDone={() => setView("main")} />}
                  {info && view === "review" && <ReviewForm projectId={projectId} mine={x?.me?.review ?? null} onDone={() => void load().then(() => setView("main"))} />}
                  {view === "taken" && taken && (
                    <TakeSummary
                      r={taken}
                      onChat={() => {
                        setOpen(false);
                        showChat();
                      }}
                    />
                  )}
                </div>
              )}
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}

function ReportForm({ projectId, onDone }: { projectId: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [what, setWhat] = useState("");
  const [steps, setSteps] = useState("");
  const [err, setErr] = useState("");
  const [preview, setPreview] = useState<{ payload: IssuePayload; problem: string | null } | null>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const draft = { title, what, steps, error: err };

  async function look() {
    setBusy(true);
    setMsg(null);
    const r = await previewIssueAction(projectId, draft).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    setPreview(r.data);
  }

  async function send() {
    setBusy(true);
    const r = await reportIssueAction(projectId, draft).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" });
    setMsg({ ok: true, text: `ส่งแล้ว (#${r.data.number}) เมื่อเจ้าของเปลี่ยนสถานะ จะขึ้นแจ้งที่หน้าโปรเจกต์ของฉัน` });
    setPreview(null);
  }

  if (msg?.ok)
    return (
      <div className="space-y-3">
        <p className="text-sm font-semibold text-accent-text">{msg.text}</p>
        <button type="button" onClick={onDone} className="btn btn-secondary btn-sm">
          กลับ
        </button>
      </div>
    );

  if (preview)
    return (
      <div className="space-y-3 text-sm">
        <p className="font-semibold">สิ่งที่จะส่ง (ทุกคนที่เปิดลิงก์แชร์อ่านได้)</p>
        <dl className="space-y-2 rounded-lg border border-line bg-sunken p-3 text-[13px]">
          <div>
            <dt className="text-xs font-semibold text-muted">หัวข้อ</dt>
            <dd className="[overflow-wrap:anywhere]">{preview.payload.title}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">รายละเอียด</dt>
            <dd className="whitespace-pre-wrap [overflow-wrap:anywhere]">{preview.payload.body}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">เวอร์ชันที่ใช้</dt>
            <dd>{preview.payload.version ? `v${preview.payload.version}` : "-"}</dd>
          </div>
          <div>
            <dt className="text-xs font-semibold text-muted">ไฟล์ที่คุณแก้จากต้นฉบับ (ชื่อเท่านั้น ไม่ส่งโค้ด)</dt>
            <dd className="font-mono text-xs">{preview.payload.details.changedFiles.join(", ") || "ไม่ได้แก้"}</dd>
          </div>
          {preview.payload.details.errors && (
            <div>
              <dt className="text-xs font-semibold text-muted">ข้อความ error</dt>
              <dd className="whitespace-pre-wrap font-mono text-xs [overflow-wrap:anywhere]">{preview.payload.details.errors}</dd>
            </div>
          )}
        </dl>
        {preview.problem && <p className="callout callout-danger text-sm">{preview.problem}</p>}
        {msg && !msg.ok && <p className="text-sm font-semibold text-danger">{msg.text}</p>}
        <div className="flex gap-2">
          <button type="button" onClick={() => setPreview(null)} disabled={busy} className="btn btn-secondary btn-sm">
            แก้ไข
          </button>
          <button type="button" onClick={send} disabled={busy || !!preview.problem} className="btn btn-primary btn-sm">
            <BugAntIcon className="h-4 w-4" />
            {busy ? "กำลังส่ง…" : "ส่งให้เจ้าของ"}
          </button>
        </div>
      </div>
    );

  return (
    <div className="space-y-3 text-sm">
      <label className="block">
        <span className="mb-1 block font-semibold">หัวข้อ</span>
        <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className="field w-full" placeholder="เช่น กดบันทึกแล้วข้อมูลไม่ลงชีต" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">เกิดอะไรขึ้น</span>
        <textarea value={what} onChange={(e) => setWhat(e.target.value)} rows={3} maxLength={2500} className="field w-full" placeholder="เห็นอะไร คาดว่าจะเป็นอย่างไร" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">ทำอะไรก่อนเจอ</span>
        <textarea value={steps} onChange={(e) => setSteps(e.target.value)} rows={2} maxLength={1400} className="field w-full" placeholder="1. เปิดหน้า… 2. กด…" />
      </label>
      <label className="block">
        <span className="mb-1 block font-semibold">
          ข้อความ error <span className="font-normal text-muted">(ถ้ามี วางได้เลย)</span>
        </span>
        <textarea value={err} onChange={(e) => setErr(e.target.value)} rows={2} maxLength={2000} className="field w-full font-mono text-xs" />
      </label>
      <p className="hint text-xs">แอปแนบเวอร์ชันที่ใช้และชื่อไฟล์ที่คุณแก้ให้เอง ไม่ส่งโค้ด และตรวจหาคีย์ก่อนส่ง</p>
      {msg && !msg.ok && <p className="text-sm font-semibold text-danger">{msg.text}</p>}
      <button type="button" onClick={look} disabled={busy || title.trim().length < 3 || !what.trim()} className="btn btn-primary btn-sm">
        {busy ? "กำลังเตรียม…" : "ดูสิ่งที่จะส่ง"}
      </button>
    </div>
  );
}

function ReviewForm({ projectId, mine, onDone }: { projectId: string; mine: { stars: number; body: string } | null; onDone: () => void }) {
  const [stars, setStars] = useState(mine?.stars ?? 0);
  const [body, setBody] = useState(mine?.body ?? "");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [list, setList] = useState<{ avg: number | null; count: number; reviews: ShareReview[] } | null>(null);

  useEffect(() => {
    sourceReviewsAction(projectId)
      .then((r) => r.ok && r.data && setList(r.data))
      .catch(() => {});
  }, [projectId]);

  async function save() {
    setBusy(true);
    setMsg(null);
    const r = await reviewSourceAction(projectId, stars, body).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    onDone();
  }

  async function remove() {
    if (!window.confirm("ลบรีวิวของคุณ?")) return;
    setBusy(true);
    const r = await deleteSourceReviewAction(projectId).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "ไม่สำเร็จ ลองใหม่อีกครั้ง" });
    onDone();
  }

  return (
    <div className="space-y-3 text-sm">
      <div className="flex items-center gap-1" role="radiogroup" aria-label="จำนวนดาว">
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n} type="button" role="radio" aria-checked={stars === n} aria-label={`${n} ดาว`} onClick={() => setStars(n)} className="btn btn-ghost btn-sm btn-icon">
            {n <= stars ? <StarSolid className="h-5 w-5 text-warn-text" /> : <StarIcon className="h-5 w-5 text-muted" />}
          </button>
        ))}
      </div>
      <textarea value={body} onChange={(e) => setBody(e.target.value)} rows={3} maxLength={1000} className="field w-full" placeholder="ใช้กับงานอะไร ดีตรงไหน ควรปรับอะไร" />
      <p className="hint text-xs">รีวิวขึ้นในชื่อผู้แชร์ของคุณ (ตั้งค่า → บัญชี Google) · ถ้าเผยแพร่โปรเจกต์นี้แล้ว รีวิวจะมีป้าย “ใช้งานจริง”</p>
      {msg && !msg.ok && <p className="text-sm font-semibold text-danger">{msg.text}</p>}
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={save} disabled={busy || stars < 1} className="btn btn-primary btn-sm">
          {busy ? "กำลังบันทึก…" : mine ? "บันทึกรีวิว" : "ส่งรีวิว"}
        </button>
        {mine && (
          <button type="button" onClick={remove} disabled={busy} className="btn btn-ghost btn-sm text-danger">
            ลบรีวิว
          </button>
        )}
      </div>
      {list && list.reviews.length > 0 && (
        <ul className="space-y-2 border-t border-line pt-3">
          {list.reviews.slice(0, 6).map((r, i) => (
            <li key={i} className="text-[13px]">
              <span className="font-semibold">{r.author}</span> <span className="text-warn-text">{"★".repeat(r.stars)}</span>
              {r.verifiedUse && <span className="badge badge-ok ml-1 !py-0 text-[10.5px]">ใช้งานจริง</span>}
              {r.body && <span className="block whitespace-pre-wrap text-muted">{r.body}</span>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
