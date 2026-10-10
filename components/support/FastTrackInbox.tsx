"use client";

import { useCallback, useEffect, useState } from "react";
import { ArrowLeftIcon, ArrowPathIcon, ArrowTopRightOnSquareIcon, CheckCircleIcon, CodeBracketIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { getTicketAction, listTicketsAction, replyTicketAction } from "@/app/settings/support-actions";
import type { Ticket, TicketDetail } from "@/lib/support/fast-track";
import { AttachCode, type ProjectOption } from "./AttachCode";

function when(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/** One question with its conversation, read and answered inside the app (code can be attached again). */
function TicketThread({ id, projects, fixedProject, onBack }: { id: string; projects: ProjectOption[]; fixedProject?: ProjectOption; onBack: () => void }) {
  const [ticket, setTicket] = useState<TicketDetail | null>(null);
  const [error, setError] = useState("");
  const [body, setBody] = useState("");
  const [projectId, setProjectId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [sendError, setSendError] = useState("");

  const load = useCallback(async () => {
    const r = await getTicketAction(id).catch(() => null);
    if (r?.ok) {
      setTicket(r.ticket);
      setError("");
    } else setError(r?.error ?? "โหลดคำถามไม่สำเร็จ");
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setSendError("");
    const r = await replyTicketAction({ id, body, projectId }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setSendError(r?.error ?? "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
    setBody("");
    setProjectId(null);
    void load();
  }

  return (
    <div>
      <div className="flex flex-wrap items-center gap-2 border-b border-line px-3 py-2">
        <button type="button" onClick={onBack} className="btn btn-ghost btn-sm">
          <ArrowLeftIcon className="h-4 w-4" />
          คำถามทั้งหมด
        </button>
        {ticket && (
          <a href={ticket.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm ml-auto">
            เปิดบนเว็บ
            <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        )}
      </div>
      {error ? (
        <p className="px-4 py-6 text-sm text-danger">{error}</p>
      ) : !ticket ? (
        <p className="hint px-4 py-6">กำลังโหลด…</p>
      ) : (
        <div className="space-y-3 p-4">
          <h3 className="text-[15px] font-semibold [overflow-wrap:anywhere]">{ticket.title}</h3>
          <ol className="space-y-2.5">
            {ticket.messages.map((m) => (
              <li key={m.id} className={`rounded-xl border px-3.5 py-2.5 ${m.admin ? "border-accent/40 bg-accent-soft/50" : "border-line bg-surface"}`}>
                <p className="text-[12px] text-muted">
                  <b className="text-fg">{m.admin ? "แอดมิน" : m.author}</b> · {when(m.at)}
                </p>
                <p className="mt-1 whitespace-pre-wrap text-sm [overflow-wrap:anywhere]">{m.body}</p>
                {m.code && (
                  <p className="mt-1.5 inline-flex items-center gap-1 rounded-md bg-info-soft px-2 py-0.5 text-[12px] text-info">
                    <CodeBracketIcon className="h-3.5 w-3.5" aria-hidden />
                    แนบโค้ด “{m.code.project}” {m.code.files} ไฟล์
                  </p>
                )}
              </li>
            ))}
          </ol>
          {ticket.locked ? (
            <p className="hint">คำถามนี้ปิดการตอบแล้ว</p>
          ) : (
            <form onSubmit={send} className="space-y-2.5 border-t border-line pt-3">
              <label className="block">
                <span className="label">ตอบกลับแอดมิน</span>
                <textarea value={body} onChange={(e) => setBody(e.target.value)} required rows={3} maxLength={7000} placeholder="ลองแล้วเป็นอย่างไร มีอะไรถามต่อ" className="field mt-1 w-full" />
              </label>
              <AttachCode projects={fixedProject ? [fixedProject] : projects} projectId={projectId} onChange={setProjectId} fixed={!!fixedProject} />
              {sendError && (
                <p role="alert" className="text-sm text-danger">
                  {sendError}
                </p>
              )}
              <button type="submit" disabled={busy} className="btn btn-primary btn-sm">
                <PaperAirplaneIcon className="h-4 w-4" />
                {busy ? "กำลังส่ง…" : "ส่งข้อความ"}
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}

/**
 * "คำถามของฉัน": this licence's Fast Track questions; a click opens the conversation here (read + answer,
 * with code), the website copy stays one click away. `refresh` changes after a new question is sent.
 */
export function FastTrackInbox({
  projects,
  fixedProject,
  refresh = 0,
  openId,
}: {
  projects: ProjectOption[];
  fixedProject?: ProjectOption;
  refresh?: number;
  /** open this ticket right away (the one just sent) */
  openId?: string | null;
}) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [error, setError] = useState("");
  const [open, setOpen] = useState<string | null>(openId ?? null);

  const load = useCallback(async () => {
    const r = await listTicketsAction().catch(() => null);
    if (r?.ok) {
      setTickets(r.tickets);
      setError("");
    } else setError(r?.error ?? "โหลดรายการไม่สำเร็จ");
  }, []);

  useEffect(() => {
    void load();
  }, [load, refresh]);

  if (open) {
    return (
      <TicketThread
        id={open}
        projects={projects}
        fixedProject={fixedProject}
        onBack={() => {
          setOpen(null);
          void load();
        }}
      />
    );
  }

  return (
    <div>
      <div className="flex items-center justify-between border-b border-line px-4 py-2.5">
        <p className="text-sm font-semibold">คำถามของฉัน</p>
        <button type="button" onClick={() => void load()} className="btn btn-ghost btn-sm">
          <ArrowPathIcon className="h-4 w-4" />
          โหลดใหม่
        </button>
      </div>
      {error ? (
        <p className="px-4 py-6 text-sm text-danger">{error}</p>
      ) : tickets === null ? (
        <p className="hint px-4 py-6">กำลังโหลด…</p>
      ) : tickets.length === 0 ? (
        <p className="hint px-4 py-6">ยังไม่เคยส่งคำถาม</p>
      ) : (
        <ul className="divide-y divide-line">
          {tickets.map((t) => (
            <li key={t.id}>
              <button type="button" onClick={() => setOpen(t.id)} className="flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-sunken">
                {t.answered ? (
                  <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" />
                ) : (
                  <span className="mt-1.5 h-2.5 w-2.5 shrink-0 rounded-full bg-warn-line" aria-hidden />
                )}
                <span className="min-w-0 flex-1">
                  <span className="block text-sm font-semibold [overflow-wrap:anywhere]">{t.title}</span>
                  <span className="hint">
                    {t.answered ? "แอดมินตอบแล้ว" : t.adminRepliedAt ? "รอแอดมินตอบต่อ" : "รอแอดมินตอบ"} · ส่งเมื่อ {when(t.createdAt)} · {t.replies} ข้อความ
                  </span>
                </span>
                {t.unread && <span className="badge badge-ok shrink-0">ใหม่</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
