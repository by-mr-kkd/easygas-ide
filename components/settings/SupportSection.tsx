"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, BoltIcon, ChatBubbleLeftRightIcon, CheckCircleIcon } from "@heroicons/react/24/outline";
import { listTicketsAction, sendTicketAction, ticketOpenedAction } from "@/app/settings/support-actions";
import type { Ticket } from "@/lib/support/fast-track";

const BOARD = "https://easygaside.tech/board";
const NAME_KEY = "egs:support-name";

function when(iso: string): string {
  return new Date(iso).toLocaleString("th-TH", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

/**
 * Settings → ช่วยเหลือ. Pro: Fast Track — ask the owner directly from here; the question becomes a private
 * thread only you and the owner see, and the app tells you when it is answered. Free: the public webboard.
 */
export function SupportSection({ pro, machineInfo }: { pro: boolean; machineInfo: string }) {
  const [tickets, setTickets] = useState<Ticket[] | null>(null);
  const [listError, setListError] = useState("");
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attach, setAttach] = useState(true);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  const load = useCallback(async () => {
    const r = await listTicketsAction();
    if (r.ok) {
      setTickets(r.tickets);
      setListError("");
    } else setListError(r.error);
  }, []);

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* type it */
    }
    if (pro) void load();
  }, [pro, load]);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* not remembered */
    }
    const r = await sendTicketAction({ title, body: attach ? `${body.trim()}\n\n— ข้อมูลเครื่อง —\n${machineInfo}` : body, name });
    setBusy(false);
    if (!r.ok) return setMsg({ ok: false, text: r.error });
    setTitle("");
    setBody("");
    setMsg({ ok: true, text: "ส่งถึงแอดมินแล้ว ตอบเมื่อไหร่โปรแกรมจะเด้งบอก", url: r.url });
    void load();
  }

  if (!pro) {
    return (
      <div className="space-y-4">
        <div className="card p-5">
          <p className="flex items-center gap-2 font-semibold">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-info" />
            เว็บบอร์ดถามตอบ (ฟรี)
          </p>
          <p className="hint mt-1">ติดตรงไหน ตั้งกระทู้ถามได้เลย ไม่ต้องสมัครสมาชิก มีคนในชุมชนและแอดมินช่วยตอบ</p>
          <a href={BOARD} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm mt-3">
            เปิดเว็บบอร์ด <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>
        <div className="card border-dashed p-5">
          <p className="flex items-center gap-2 font-semibold">
            <BoltIcon className="h-5 w-5 text-warn-text" />
            Fast Track สำหรับ Pro
          </p>
          <p className="hint mt-1">ส่งคำถามตรงถึงแอดมินจากหน้านี้ ตอบก่อนกระทู้ทั่วไป เห็นแค่คุณกับแอดมิน และโปรแกรมเด้งบอกเมื่อมีคำตอบ</p>
          <Link href="/settings?s=premium" className="btn btn-secondary btn-sm mt-3">
            ดู Pro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <form onSubmit={send} className="card space-y-3 p-5">
        <p className="flex items-center gap-2 font-semibold">
          <BoltIcon className="h-5 w-5 text-warn-text" />
          ส่งคำถาม Fast Track
        </p>
        <p className="hint -mt-1">ถึงแอดมินทันที ตอบก่อนกระทู้ทั่วไป เห็นแค่คุณกับแอดมิน ห้ามใส่รหัสผ่านหรือคีย์ลงในข้อความ</p>
        <label className="block">
          <span className="label">ชื่อที่ให้แอดมินเรียก</span>
          <input value={name} onChange={(e) => setName(e.target.value)} maxLength={40} placeholder="ผู้ใช้ Pro" className="field mt-1 w-full sm:max-w-xs" />
        </label>
        <label className="block">
          <span className="label">หัวข้อ</span>
          <input value={title} onChange={(e) => setTitle(e.target.value)} required minLength={4} maxLength={140} placeholder="เช่น เผยแพร่แล้วหน้าเว็บขาว" className="field mt-1 w-full" />
        </label>
        <label className="block">
          <span className="label">รายละเอียด</span>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            required
            rows={6}
            maxLength={7000}
            placeholder="ทำอะไรอยู่ เห็นข้อความอะไร โปรเจกต์ไหน"
            className="field mt-1 w-full"
          />
        </label>
        <label className="flex items-start gap-2 text-sm">
          <input type="checkbox" checked={attach} onChange={(e) => setAttach(e.target.checked)} className="mt-1" />
          <span>
            แนบข้อมูลเครื่อง <span className="hint">({machineInfo})</span>
          </span>
        </label>
        {msg && (
          <p className={`text-sm font-medium ${msg.ok ? "text-accent-text" : "text-danger"}`}>
            {msg.text}{" "}
            {msg.url && (
              <a href={msg.url} target="_blank" rel="noopener noreferrer" className="link">
                เปิดกระทู้
              </a>
            )}
          </p>
        )}
        <button type="submit" disabled={busy} className="btn btn-primary">
          {busy ? "กำลังส่ง…" : "ส่งถึงแอดมิน"}
        </button>
      </form>

      <div className="card overflow-hidden">
        <div className="flex items-center justify-between border-b border-line px-4 py-3">
          <p className="text-sm font-semibold">คำถามของฉัน</p>
          <button type="button" onClick={() => void load()} className="btn btn-ghost btn-sm">
            โหลดใหม่
          </button>
        </div>
        {listError ? (
          <p className="px-4 py-6 text-sm text-danger">{listError}</p>
        ) : tickets === null ? (
          <p className="hint px-4 py-6">กำลังโหลด…</p>
        ) : tickets.length === 0 ? (
          <p className="hint px-4 py-6">ยังไม่เคยส่งคำถาม</p>
        ) : (
          <ul className="divide-y divide-line">
            {tickets.map((t) => (
              <li key={t.id}>
                <a
                  href={t.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={() => {
                    if (t.unread) {
                      void ticketOpenedAction(t.id, t.adminRepliedAt).then(load);
                    }
                  }}
                  className="flex items-start gap-3 px-4 py-3 transition hover:bg-sunken"
                >
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
                  <ArrowTopRightOnSquareIcon className="mt-0.5 h-4 w-4 shrink-0 text-faint" />
                </a>
              </li>
            ))}
          </ul>
        )}
      </div>

      <p className="hint">
        คำถามทั่วไปที่คนอื่นอ่านแล้วได้ประโยชน์ ตั้งใน{" "}
        <a href={BOARD} target="_blank" rel="noopener noreferrer" className="link">
          เว็บบอร์ด
        </a>{" "}
        ก็ได้
      </p>
    </div>
  );
}
