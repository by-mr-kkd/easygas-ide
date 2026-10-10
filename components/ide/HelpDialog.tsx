"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { BoltIcon, InboxIcon, LifebuoyIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { FastTrackForm } from "@/components/support/FastTrackForm";
import { FastTrackInbox } from "@/components/support/FastTrackInbox";

type Tab = "ask" | "inbox";

/**
 * The editor's help button (Pro): Fast Track without leaving the project — ask the owner with this project's
 * code attached (ticked, can be unticked), or read and answer earlier questions. Same pieces as Settings →
 * ช่วยเหลือ. `unread` = answers not opened yet (a dot on the button).
 */
export function HelpButton({ project, machineInfo, unread = 0 }: { project: { id: string; name: string }; machineInfo: string; unread?: number }) {
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<Tab>(unread > 0 ? "inbox" : "ask");
  const [sent, setSent] = useState<{ n: number; id: string | null }>({ n: 0, id: null });

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="ช่วยเหลือ · ถามแอดมิน (Fast Track)"
        aria-label="ช่วยเหลือ ถามแอดมิน"
        className="btn btn-ghost btn-sm btn-icon relative"
      >
        <LifebuoyIcon className="h-[18px] w-[18px] text-warn-text" />
        {unread > 0 && <span className="absolute right-1 top-1 h-2 w-2 rounded-full bg-danger" aria-hidden />}
      </button>
      {open &&
        createPortal(
          <div className="dialog-backdrop" onClick={() => setOpen(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="ช่วยเหลือ Fast Track"
              className="dialog flex max-h-[min(88vh,760px)] w-full max-w-xl flex-col overflow-hidden p-0"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-line px-4 py-3">
                <BoltIcon className="h-5 w-5 text-warn-text" aria-hidden />
                <h2 className="text-[15px] font-semibold">ถามแอดมิน · Fast Track</h2>
                <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon ml-auto">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="flex gap-1 border-b border-line bg-sunken px-3 py-2">
                <div className="seg" role="tablist">
                  <button type="button" role="tab" aria-selected={tab === "ask"} aria-pressed={tab === "ask"} onClick={() => setTab("ask")} className="seg-item">
                    <BoltIcon className="h-4 w-4" />
                    ถามใหม่
                  </button>
                  <button type="button" role="tab" aria-selected={tab === "inbox"} aria-pressed={tab === "inbox"} onClick={() => setTab("inbox")} className="seg-item">
                    <InboxIcon className="h-4 w-4" />
                    คำถามของฉัน
                    {unread > 0 && <span className="badge badge-ok h-5">{unread}</span>}
                  </button>
                </div>
              </div>
              <div className="min-h-0 flex-1 overflow-y-auto">
                {tab === "ask" ? (
                  <div className="p-4">
                    <p className="hint mb-3">ถึงแอดมินทันที เห็นแค่คุณกับแอดมิน แนบโค้ดโปรเจกต์นี้ไปด้วยได้ คีย์และรหัสในโค้ดจะถูกซ่อนให้ก่อนส่ง</p>
                    <FastTrackForm
                      compact
                      machineInfo={machineInfo}
                      projects={[project]}
                      fixedProject={project}
                      onSent={(t) => {
                        setSent((s) => ({ n: s.n + 1, id: t.id }));
                        setTab("inbox");
                      }}
                    />
                  </div>
                ) : (
                  <FastTrackInbox key={sent.n} projects={[project]} fixedProject={project} refresh={sent.n} openId={sent.id} />
                )}
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
