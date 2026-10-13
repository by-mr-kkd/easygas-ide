"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowTopRightOnSquareIcon, ArrowsRightLeftIcon, CheckIcon, InboxArrowDownIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Portal } from "@/components/ui/Portal";
import { ThreeWayDiff, TakeSummary } from "@/components/share/ThreeWayDiff";
import { compareProposalAction, proposeToParentAction, setIssueStatusAction, setProposalAction, takeProposalAction } from "@/app/projects/share-owner-actions";
import { saveDirtyFiles } from "@/lib/client/save-files";
import type { CodeFile, FileClass } from "@/lib/share/merge";
import { ISSUE_STATUSES, issueStatusLabel, SUPPORT_MODES, SUPPORT_NOTE_MAX, type IssueStatus, type ShareIssue, type ShareProposal, type SupportMode } from "@/lib/share/v2";
import { useProjectStore } from "@/store/useProjectStore";

const date = (iso: string) => {
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "" : d.toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "2-digit" });
};

const STATUS_TONE: Record<IssueStatus, string> = { open: "badge-warn", looking: "", fixed: "badge-ok", wontfix: "" };

/** How the owner looks after the share (share system 1.2): three choices + a short note. */
export function SupportPicker({ value, onChange }: { value: { mode: SupportMode; note: string }; onChange: (v: { mode: SupportMode; note: string }) => void }) {
  return (
    <fieldset className="text-sm">
      <legend className="mb-1 font-semibold">ดูแลหลังแชร์</legend>
      <div className="space-y-1.5">
        {SUPPORT_MODES.map((m) => (
          <label key={m.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border px-3 py-2 ${value.mode === m.id ? "border-accent bg-accent-soft/40" : "border-line"}`}>
            <input type="radio" name="share-support" checked={value.mode === m.id} onChange={() => onChange({ ...value, mode: m.id })} className="mt-1" />
            <span className="min-w-0">
              <span className="block font-semibold">{m.label}</span>
              <span className="hint block text-xs">{m.text}</span>
            </span>
          </label>
        ))}
      </div>
      {value.mode !== "self" && (
        <input
          value={value.note}
          onChange={(e) => onChange({ ...value, note: e.target.value })}
          maxLength={SUPPORT_NOTE_MAX}
          className="field mt-2 w-full"
          placeholder={value.mode === "service" ? "เช่น ดูแลรายเดือน ติดต่อทางเพจ…" : "เช่น ตอบภายในสัปดาห์ (ไม่บังคับ)"}
        />
      )}
    </fieldset>
  );
}

/** The owner's list of reported issues: read, then set a status (+ a note the reporter sees). */
export function IssuesTab({ projectId, issues, onChanged }: { projectId: string; issues: ShareIssue[]; onChanged: () => void }) {
  const [openNo, setOpenNo] = useState<number | null>(null);
  const [status, setStatus] = useState<IssueStatus>("open");
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const [showClosed, setShowClosed] = useState(false);

  const shown = issues.filter((i) => showClosed || i.status === "open" || i.status === "looking");
  const closed = issues.length - issues.filter((i) => i.status === "open" || i.status === "looking").length;

  function expand(i: ShareIssue) {
    if (openNo === i.number) return setOpenNo(null);
    setOpenNo(i.number);
    setStatus(i.status);
    setNote(i.ownerNote);
    setErr("");
  }

  async function save(n: number) {
    setBusy(true);
    setErr("");
    const r = await setIssueStatusAction(projectId, n, status, note).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setErr(r && !r.ok ? r.error : "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    setOpenNo(null);
    onChanged();
  }

  if (issues.length === 0) return <p className="hint">ยังไม่มีใครแจ้งปัญหา</p>;
  return (
    <div className="space-y-2">
      <ul className="divide-y divide-line rounded-lg border border-line">
        {shown.map((i) => (
          <li key={i.number} className="text-sm">
            <button type="button" onClick={() => expand(i)} aria-expanded={openNo === i.number} className="row-btn flex w-full items-start gap-2 px-3 py-2 text-left">
              <span className="shrink-0 font-mono text-xs text-muted">#{i.number}</span>
              <span className="min-w-0 flex-1">
                <span className="block font-medium [overflow-wrap:anywhere]">{i.title}</span>
                <span className="hint block text-xs">
                  {i.author} · {date(i.createdAt)}
                  {i.version ? ` · ใช้ v${i.version}` : ""}
                </span>
              </span>
              <span className={`badge shrink-0 text-[11px] ${STATUS_TONE[i.status]}`}>
                {issueStatusLabel(i.status)}
                {i.status === "fixed" && i.fixedIn ? ` v${i.fixedIn}` : ""}
              </span>
            </button>
            {openNo === i.number && (
              <div className="space-y-2 border-t border-line bg-sunken/50 px-3 py-2">
                {i.body && <p className="whitespace-pre-wrap text-[13px] [overflow-wrap:anywhere]">{i.body}</p>}
                {i.details.changedFiles.length > 0 && <p className="hint text-xs">ไฟล์ที่เขาแก้จากของคุณ: {i.details.changedFiles.join(", ")}</p>}
                {i.details.errors && <pre className="max-h-40 overflow-auto rounded border border-line bg-surface p-2 text-[11.5px]">{i.details.errors}</pre>}
                <div className="flex flex-wrap items-center gap-2">
                  <select value={status} onChange={(e) => setStatus(e.target.value as IssueStatus)} className="field h-8 text-[13px]" aria-label="สถานะ">
                    {ISSUE_STATUSES.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                  <input value={note} onChange={(e) => setNote(e.target.value)} maxLength={500} className="field h-8 min-w-0 flex-1 text-[13px]" placeholder="บอกคนแจ้ง (ไม่บังคับ)" />
                  <button type="button" onClick={() => save(i.number)} disabled={busy} className="btn btn-secondary btn-sm">
                    <CheckIcon className="h-4 w-4" />
                    บันทึก
                  </button>
                </div>
                <p className="hint text-xs">แก้ในเวอร์ชันใหม่: ติ๊กข้อนี้ตอน “แชร์เวอร์ชันใหม่” สถานะจะเป็นแก้แล้วพร้อมเลขเวอร์ชันเอง</p>
                {err && <p className="text-xs font-semibold text-danger">{err}</p>}
              </div>
            )}
          </li>
        ))}
        {shown.length === 0 && <li className="hint px-3 py-2">ไม่มีปัญหาที่เปิดอยู่</li>}
      </ul>
      {closed > 0 && (
        <button type="button" onClick={() => setShowClosed((v) => !v)} className="link text-xs">
          {showClosed ? "ซ่อนที่ปิดแล้ว" : `ดูที่ปิดแล้ว (${closed})`}
        </button>
      )}
    </div>
  );
}

type ProposalDiff = { base: CodeFile[] | null; latest: CodeFile[]; mine: CodeFile[]; plans: { path: string; cls: FileClass }[]; title: string };

/** Proposals from forks: look at the diff, take it in (same path as รับอัปเดต), then mark merged / declined. */
export function ProposalsTab({ projectId, proposals, onChanged }: { projectId: string; proposals: ShareProposal[]; onChanged: () => void }) {
  const router = useRouter();
  const setDraft = useProjectStore((s) => s.setDraft);
  const [diff, setDiff] = useState<ProposalDiff | null>(null);
  const [loading, setLoading] = useState<string | null>(null);
  const [err, setErr] = useState("");
  const [taken, setTaken] = useState<{ id: string; r: { written: string[]; deleted: string[]; kept: string[]; conflicts: string[]; draft: string | null } } | null>(null);

  async function look(p: ShareProposal) {
    setLoading(p.id);
    setErr("");
    const r = await compareProposalAction(projectId, p.id).catch(() => null);
    setLoading(null);
    if (!r || !r.ok) return setErr(r && !r.ok ? r.error : "โหลดโค้ดของทางแยกไม่สำเร็จ");
    setDiff(r.data);
  }

  async function take(p: ShareProposal) {
    if (!window.confirm(`รับการเปลี่ยนแปลงจาก "${p.title}" เข้าโปรเจกต์นี้? โค้ดตอนนี้จะถูกเก็บในประวัติก่อน`)) return;
    setLoading(p.id);
    setErr("");
    await saveDirtyFiles(projectId);
    const r = await takeProposalAction(projectId, p.id).catch(() => null);
    setLoading(null);
    if (!r || !r.ok) return setErr(r && !r.ok ? r.error : "รับเข้าไม่สำเร็จ ลองใหม่อีกครั้ง");
    setTaken({ id: p.id, r: r.data });
    if (r.data.draft) setDraft({ text: r.data.draft, mode: "append" });
    router.refresh();
  }

  async function mark(p: ShareProposal, status: "merged" | "declined") {
    setLoading(p.id);
    setErr("");
    const r = await setProposalAction(projectId, p.id, status).catch(() => null);
    setLoading(null);
    if (!r || !r.ok) return setErr(r && !r.ok ? r.error : "ไม่สำเร็จ ลองใหม่อีกครั้ง");
    onChanged();
  }

  if (proposals.length === 0) return <p className="hint">ยังไม่มีทางแยกที่เสนอการเปลี่ยนแปลงกลับมา</p>;
  return (
    <div className="space-y-2">
      {err && <p className="text-sm font-semibold text-danger">{err}</p>}
      <ul className="space-y-2">
        {proposals.map((p) => (
          <li key={p.id} className="rounded-lg border border-line p-3 text-sm">
            <div className="flex items-start gap-2">
              <span className="min-w-0 flex-1">
                <span className="block font-semibold [overflow-wrap:anywhere]">{p.title}</span>
                <span className="hint block text-xs">
                  {p.author} · {date(p.createdAt)}
                  {p.forkVersion ? ` · v${p.forkVersion}` : ""}
                </span>
              </span>
              <span className={`badge shrink-0 text-[11px] ${p.status === "merged" ? "badge-ok" : ""}`}>{p.status === "merged" ? "รับแล้ว" : p.status === "declined" ? "ไม่รับ" : "รอดู"}</span>
            </div>
            {p.summary && <p className="mt-1.5 whitespace-pre-wrap text-[13px] text-muted">{p.summary}</p>}
            {taken?.id === p.id ? (
              <div className="mt-2 space-y-2">
                <TakeSummary r={taken.r} onChat={() => window.dispatchEvent(new Event("egs:show-chat"))} />
                <div className="flex gap-2">
                  <button type="button" onClick={() => mark(p, "merged")} disabled={loading === p.id} className="btn btn-secondary btn-sm">
                    ทำเครื่องหมายว่ารับแล้ว
                  </button>
                </div>
              </div>
            ) : (
              <div className="mt-2 flex flex-wrap gap-2">
                <button type="button" onClick={() => look(p)} disabled={loading === p.id} className="btn btn-secondary btn-sm">
                  <ArrowsRightLeftIcon className="h-4 w-4" />
                  {loading === p.id ? "กำลังโหลด…" : "ดูความต่าง"}
                </button>
                {p.status === "open" && (
                  <>
                    <button type="button" onClick={() => take(p)} disabled={loading === p.id} className="btn btn-soft tone-ai btn-sm">
                      <InboxArrowDownIcon className="h-4 w-4" />
                      รับเข้า
                    </button>
                    <button type="button" onClick={() => mark(p, "declined")} disabled={loading === p.id} className="btn btn-ghost btn-sm">
                      ไม่รับ
                    </button>
                  </>
                )}
                <a href={`https://easygaside.tech/s/${p.forkSlug}`} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  หน้าทางแยก
                </a>
              </div>
            )}
          </li>
        ))}
      </ul>

      {diff && (
        <Portal>
          <div className="dialog-backdrop" onClick={() => setDiff(null)}>
            <div role="dialog" aria-modal="true" aria-label="ความต่างของทางแยก" className="dialog flex max-h-[90vh] max-w-6xl flex-col p-0" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-center justify-between gap-3 border-b border-line px-5 py-3">
                <h3 className="truncate text-[15px] font-semibold">ทางแยก “{diff.title}” เทียบกับของคุณ</h3>
                <button type="button" onClick={() => setDiff(null)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <ThreeWayDiff base={diff.base} latest={diff.latest} mine={diff.mine} plans={diff.plans} theirsLabel="ทางแยก" />
            </div>
          </div>
        </Portal>
      )}
    </div>
  );
}

/** After sharing a fork: offer its changes to the share it was cloned from. */
export function ProposeForm({ projectId, parentTitle, initialSummary, onDone }: { projectId: string; parentTitle: string; initialSummary: string; onDone: () => void }) {
  const [title, setTitle] = useState("");
  const [summary, setSummary] = useState(initialSummary);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  async function send() {
    setBusy(true);
    setMsg(null);
    const r = await proposeToParentAction(projectId, title, summary).catch(() => null);
    setBusy(false);
    if (!r || !r.ok) return setMsg({ ok: false, text: r && !r.ok ? r.error : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" });
    setMsg({ ok: true, text: "ส่งข้อเสนอแล้ว เจ้าของต้นฉบับจะเห็นในหน้าต่างแชร์ของเขา" });
  }

  if (msg?.ok)
    return (
      <div className="space-y-2">
        <p className="text-sm font-semibold text-accent-text">{msg.text}</p>
        <button type="button" onClick={onDone} className="btn btn-secondary btn-sm">
          ปิด
        </button>
      </div>
    );
  return (
    <div className="space-y-2 rounded-lg border border-line p-3 text-sm">
      <p className="font-semibold">เสนอให้ต้นฉบับ “{parentTitle}”</p>
      <p className="hint text-xs">เจ้าของต้นฉบับดูความต่างแล้วเลือกรับเข้าได้ ข้อเสนอใช้โค้ดของลิงก์แชร์นี้</p>
      <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={140} className="field w-full" placeholder="หัวข้อ เช่น เพิ่มหน้ารายงานรายเดือน" />
      <textarea value={summary} onChange={(e) => setSummary(e.target.value)} rows={3} maxLength={2000} className="field w-full" placeholder="เปลี่ยนอะไร ทำไม" />
      {msg && !msg.ok && <p className="text-xs font-semibold text-danger">{msg.text}</p>}
      <div className="flex gap-2">
        <button type="button" onClick={send} disabled={busy || title.trim().length < 3} className="btn btn-primary btn-sm">
          {busy ? "กำลังส่ง…" : "ส่งข้อเสนอ"}
        </button>
        <button type="button" onClick={onDone} disabled={busy} className="btn btn-ghost btn-sm">
          ไว้ทีหลัง
        </button>
      </div>
    </div>
  );
}
