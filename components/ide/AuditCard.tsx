"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ChevronDownIcon, ClipboardDocumentCheckIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { dismissAuditAction, getAuditAction, markAuditSentAction, runAuditAction } from "@/app/projects/audit-actions";
import { buildAuditFixPrompt, type AuditItem, type AuditSeverity, type AuditState } from "@/lib/audit-items";
import { saveDirtyFiles } from "@/lib/client/save-files";
import { useProjectStore } from "@/store/useProjectStore";

const SEV: Record<AuditSeverity, { label: string; cls: string }> = {
  high: { label: "สำคัญ", cls: "bg-danger-soft text-danger" },
  medium: { label: "ควรแก้", cls: "bg-warn-soft text-warn-text" },
  low: { label: "เล็กน้อย", cls: "bg-sunken text-muted" },
};

/** `code` in the AI's Thai text → a monospace span (the audit prompt asks for backticks around code names). */
function Prose({ text }: { text: string }) {
  return (
    <>
      {text.split(/(`[^`]+`)/).map((part, i) =>
        part.startsWith("`") && part.endsWith("`") ? (
          <code key={i} className="rounded bg-sunken px-1 font-mono text-[12px] [overflow-wrap:anywhere]">
            {part.slice(1, -1)}
          </code>
        ) : (
          <span key={i}>{part}</span>
        ),
      )}
    </>
  );
}

function summary(items: AuditItem[]): string {
  const high = items.filter((i) => i.severity === "high").length;
  const sent = items.filter((i) => i.sentAt).length;
  return [`พบ ${items.length} ข้อ`, high && `สำคัญ ${high}`, sent && `ส่งให้ AI แก้แล้ว ${sent}`].filter(Boolean).join(" · ");
}

/**
 * "วิเคราะห์โค้ด" for a script imported from Google, at the top of the chat: offers the analysis once,
 * then keeps the findings. Each finding opens to say what is wrong, how it would be fixed and what gets
 * better; the user ticks the ones to fix (or all) and they go to the AI as one chat message.
 */
export function AuditCard({ projectId }: { projectId: string }) {
  const aiChoice = useProjectStore((s) => s.aiChoice);
  const runAgent = useProjectStore((s) => s.runAgent);
  const addEnergy = useProjectStore((s) => s.addEnergy);
  const [state, setState] = useState<AuditState | null | undefined>(undefined); // undefined = loading
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [open, setOpen] = useState(false);

  useEffect(() => {
    getAuditAction(projectId).then(setState).catch(() => setState(null));
  }, [projectId]);

  async function analyze() {
    setRunning(true);
    setError("");
    try {
      const r = await runAuditAction(projectId, aiChoice ?? undefined);
      if (!r.ok) return setError(r.error);
      setState(r.data.state);
      addEnergy(r.data.tokens);
      if (r.data.state.items.length) setOpen(true);
    } catch {
      setError("วิเคราะห์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setRunning(false);
    }
  }

  async function dismiss() {
    setState({ status: "dismissed", at: new Date().toISOString(), items: [] });
    await dismissAuditAction(projectId).catch(() => {});
  }

  async function fix(items: AuditItem[]) {
    setOpen(false);
    // unsaved edits first, so the snapshot taken before the AI works holds exactly what the user sees
    await saveDirtyFiles(projectId).catch(() => {});
    const next = await markAuditSentAction(projectId, items.map((i) => i.id)).catch(() => null);
    if (next) setState(next);
    runAgent("send", buildAuditFixPrompt(items));
  }

  if (state === undefined) return null;

  if (running) {
    return (
      <div className="flex items-center gap-2.5 rounded-lg border border-line bg-surface p-3 text-sm">
        <span className="h-4 w-4 shrink-0 animate-spin rounded-full border-2 border-current border-t-transparent text-ai" />
        <span>กำลังวิเคราะห์โค้ดทั้งหมด อาจใช้เวลา 1–2 นาที</span>
      </div>
    );
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-sm text-danger">
      {error}
    </p>
  );

  if (!state) {
    return (
      <div className="rounded-lg border border-line bg-surface p-3">
        <div className="flex items-start gap-2.5">
          <span className="icon-chip tone-info shrink-0">
            <ClipboardDocumentCheckIcon className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <p className="text-sm font-semibold text-fg">วิเคราะห์โค้ดเดิมก่อนไหม</p>
            <p className="hint mt-0.5">
              AI จะอ่านโค้ดทั้งหมดเทียบกับหลักที่ EasyGAS ใช้สร้างระบบ แล้วแยกจุดที่ควรแก้ออกมาเป็นข้อ ๆ
              แต่ละข้อบอกว่าปัญหาคืออะไร แก้ยังไง แก้แล้วดีขึ้นตรงไหน คุณเลือกเองว่าจะแก้ข้อไหน (ใช้ AI 1 ครั้ง)
            </p>
          </div>
        </div>
        <div className="mt-3 flex gap-2">
          <button onClick={analyze} className="btn btn-primary btn-sm">
            <SparklesIcon className="h-4 w-4" />
            วิเคราะห์โค้ด
          </button>
          <button onClick={dismiss} className="btn btn-ghost btn-sm">
            ไม่ต้อง
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  if (state.status === "dismissed") {
    return (
      <div>
        <button onClick={analyze} className="btn btn-ghost btn-sm text-muted">
          <ClipboardDocumentCheckIcon className="h-4 w-4 text-info" />
          วิเคราะห์โค้ดตามหลักของ EasyGAS
        </button>
        {errorLine}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line bg-surface p-3">
      <div className="flex items-center gap-2.5">
        <span className="icon-chip tone-info shrink-0">
          <ClipboardDocumentCheckIcon className="h-4 w-4" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">ผลวิเคราะห์โค้ด</p>
          <p className="hint">
            {state.items.length ? summary(state.items) : "ไม่พบจุดที่ต้องแก้ตามหลักของ EasyGAS"}
            {state.by && ` · โดย ${state.by}`}
          </p>
        </div>
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {state.items.length > 0 && (
          <button onClick={() => setOpen(true)} className="btn btn-primary btn-sm">
            ดูรายการและเลือกแก้
          </button>
        )}
        <button onClick={analyze} className="btn btn-ghost btn-sm">
          วิเคราะห์ใหม่
        </button>
      </div>
      {errorLine}
      {open && <AuditDialog items={state.items} by={state.by} onFix={fix} onClose={() => setOpen(false)} />}
    </div>
  );
}

function AuditDialog({
  items,
  by,
  onFix,
  onClose,
}: {
  items: AuditItem[];
  by?: string;
  onFix: (items: AuditItem[]) => void;
  onClose: () => void;
}) {
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const allPicked = picked.size === items.length;
  const chosen = useMemo(() => items.filter((i) => picked.has(i.id)), [items, picked]);

  const toggle = (set: Set<string>, id: string): Set<string> => {
    const next = new Set(set);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    return next;
  };

  return createPortal(
    <div className="dialog-backdrop" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="ผลวิเคราะห์โค้ด"
        className="dialog flex max-h-[88vh] w-full max-w-2xl flex-col p-0"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-line p-5">
          <div>
            <h3 className="text-[15px] font-semibold text-fg">ผลวิเคราะห์โค้ด · {summary(items)}</h3>
            <p className="hint mt-1">กดที่หัวข้อเพื่ออ่านรายละเอียด ติ๊กข้อที่อยากให้ AI แก้ แล้วกดปุ่มด้านล่าง</p>
            <p className="hint mt-1 text-faint">
              {by ? `วิเคราะห์โดย ${by} · ` : ""}
              AI แต่ละตัวมองไม่เหมือนกัน ผลจึงต่างกันได้ อยากเทียบก็สลับ AI ในช่องพิมพ์แล้วกด “วิเคราะห์ใหม่”
            </p>
          </div>
          <button onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <label className="flex cursor-pointer items-center gap-3 border-b border-line px-5 py-2.5 text-sm font-medium">
          <input
            type="checkbox"
            checked={allPicked}
            onChange={() => setPicked(allPicked ? new Set() : new Set(items.map((i) => i.id)))}
            className="h-4 w-4 accent-[var(--color-accent)]"
          />
          เลือกทั้งหมด ({items.length} ข้อ)
        </label>

        <ul className="min-h-0 flex-1 divide-y divide-line overflow-y-auto overflow-x-hidden">
          {items.map((i, n) => {
            const isOpen = expanded.has(i.id);
            return (
              <li key={i.id}>
                <div className="flex items-start gap-3 px-5 py-3">
                  <input
                    type="checkbox"
                    aria-label={`เลือกข้อ ${n + 1}`}
                    checked={picked.has(i.id)}
                    onChange={() => setPicked((s) => toggle(s, i.id))}
                    className="mt-1 h-4 w-4 shrink-0 accent-[var(--color-accent)]"
                  />
                  <button
                    onClick={() => setExpanded((s) => toggle(s, i.id))}
                    aria-expanded={isOpen}
                    className="flex min-w-0 flex-1 items-start gap-2 text-left"
                  >
                    <span className="min-w-0 flex-1">
                      <span className="flex flex-wrap items-center gap-1.5">
                        <span className={`rounded px-1.5 py-0.5 text-xs font-semibold leading-none ${SEV[i.severity].cls}`}>
                          {SEV[i.severity].label}
                        </span>
                        {i.sentAt && <span className="badge tone-info">ส่งให้ AI แก้แล้ว</span>}
                      </span>
                      <span className="mt-1 block text-sm font-medium text-fg">
                        {n + 1}. <Prose text={i.title} />
                      </span>
                      <span className="block font-mono text-xs text-muted">
                        {i.file}
                        {i.line ? `:${i.line}` : ""}
                      </span>
                    </span>
                    <ChevronDownIcon className={`mt-1 h-4 w-4 shrink-0 text-muted transition ${isOpen ? "rotate-180" : ""}`} />
                  </button>
                </div>
                {isOpen && (
                  <dl className="min-w-0 space-y-2.5 px-5 pb-4 pl-12 text-sm leading-relaxed [overflow-wrap:anywhere]">
                    <div>
                      <dt className="text-xs font-semibold text-danger">ปัญหาคืออะไร</dt>
                      <dd className="text-fg">
                        <Prose text={i.problem} />
                      </dd>
                    </div>
                    {i.fix && (
                      <div>
                        <dt className="text-xs font-semibold text-info">แนวทางแก้</dt>
                        <dd className="text-fg">
                          <Prose text={i.fix} />
                        </dd>
                      </div>
                    )}
                    {i.benefit && (
                      <div>
                        <dt className="text-xs font-semibold text-accent-text">แก้แล้วดีขึ้นยังไง</dt>
                        <dd className="text-fg">
                          <Prose text={i.benefit} />
                        </dd>
                      </div>
                    )}
                  </dl>
                )}
              </li>
            );
          })}
        </ul>

        <div className="flex flex-wrap items-center gap-2 border-t border-line p-4">
          <p className="hint min-w-0 flex-1">โค้ดตอนนี้ถูกเก็บในประวัติ ถ้าไม่ชอบผลที่แก้ กดย้อนกลับได้</p>
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            ปิด
          </button>
          <button onClick={() => onFix(chosen)} disabled={chosen.length === 0} className="btn btn-primary btn-sm">
            <SparklesIcon className="h-4 w-4" />
            {chosen.length ? `ให้ AI แก้ ${chosen.length} ข้อที่เลือก` : "เลือกข้อที่จะแก้"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
