"use client";

import { useEffect, useState } from "react";
import { BoltIcon, PaperAirplaneIcon } from "@heroicons/react/24/outline";
import { sendTicketAction } from "@/app/settings/support-actions";
import { AttachCode, type ProjectOption } from "./AttachCode";

const NAME_KEY = "egs:support-name";

/**
 * The Fast Track question form (Settings → ช่วยเหลือ, and the help button in the editor). `fixedProject` =
 * the editor's open project: its code is offered (ticked) without a project list.
 */
export function FastTrackForm({
  machineInfo,
  projects,
  fixedProject,
  onSent,
  compact = false,
}: {
  machineInfo: string;
  projects: ProjectOption[];
  fixedProject?: ProjectOption;
  onSent?: (ticket: { id: string; url: string }) => void;
  compact?: boolean;
}) {
  const [name, setName] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [attachInfo, setAttachInfo] = useState(true);
  const [projectId, setProjectId] = useState<string | null>(fixedProject?.id ?? null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ ok: boolean; text: string; url?: string } | null>(null);

  useEffect(() => {
    try {
      setName(localStorage.getItem(NAME_KEY) ?? "");
    } catch {
      /* type it */
    }
  }, []);

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setMsg(null);
    try {
      localStorage.setItem(NAME_KEY, name.trim());
    } catch {
      /* not remembered */
    }
    const text = attachInfo ? `${body.trim()}\n\n— ข้อมูลเครื่อง —\n${machineInfo}` : body;
    const r = await sendTicketAction({ title, body: text, name, projectId }).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ ok: false, text: r?.error ?? "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" });
    setTitle("");
    setBody("");
    setMsg({ ok: true, text: "ส่งถึงแอดมินแล้ว ตอบเมื่อไหร่โปรแกรมจะเด้งบอก", url: r.url });
    onSent?.({ id: r.id, url: r.url });
  }

  const options = fixedProject ? [fixedProject] : projects;

  return (
    <form onSubmit={send} className="space-y-3">
      {!compact && (
        <>
          <p className="flex items-center gap-2 font-semibold">
            <BoltIcon className="h-5 w-5 text-warn-text" />
            ส่งคำถาม Fast Track
          </p>
          <p className="hint -mt-1">ถึงแอดมินทันที ตอบก่อนกระทู้ทั่วไป เห็นแค่คุณกับแอดมิน ห้ามใส่รหัสผ่านหรือคีย์ลงในข้อความ</p>
        </>
      )}
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
          rows={compact ? 5 : 6}
          maxLength={7000}
          placeholder="ทำอะไรอยู่ เห็นข้อความอะไร อยากให้เป็นแบบไหน"
          className="field mt-1 w-full"
        />
      </label>
      <AttachCode projects={options} projectId={projectId} onChange={setProjectId} fixed={!!fixedProject} />
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={attachInfo} onChange={(e) => setAttachInfo(e.target.checked)} className="mt-1" />
        <span>
          แนบข้อมูลเครื่อง <span className="hint">({machineInfo})</span>
        </span>
      </label>
      {msg && (
        <p role={msg.ok ? "status" : "alert"} className={`text-sm font-medium ${msg.ok ? "text-accent-text" : "text-danger"}`}>
          {msg.text}{" "}
          {msg.url && (
            <a href={msg.url} target="_blank" rel="noopener noreferrer" className="link">
              เปิดบนเว็บ
            </a>
          )}
        </p>
      )}
      <button type="submit" disabled={busy} className="btn btn-primary">
        <PaperAirplaneIcon className="h-4 w-4" />
        {busy ? "กำลังส่ง…" : "ส่งถึงแอดมิน"}
      </button>
    </form>
  );
}
