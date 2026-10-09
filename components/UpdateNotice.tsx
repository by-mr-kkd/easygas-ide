"use client";

import { useEffect, useState } from "react";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { updateNoticeAction } from "@/app/update-actions";

const CHECK_MS = 5 * 60_000;
const CLOSED_KEY = "egs:update-notice-closed";

/**
 * A small corner note once a new version has been downloaded: closing and reopening the app installs it.
 * Closed once, it stays closed for that version in this window.
 */
export function UpdateNotice() {
  const [version, setVersion] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    const check = () =>
      updateNoticeAction()
        .then((r) => {
          if (!alive || !r) return;
          let closed: string | null = null;
          try {
            closed = sessionStorage.getItem(CLOSED_KEY);
          } catch {
            /* show it */
          }
          setVersion(closed === r.version ? null : r.version);
        })
        .catch(() => {});
    void check();
    const timer = setInterval(check, CHECK_MS);
    return () => {
      alive = false;
      clearInterval(timer);
    };
  }, []);

  if (!version) return null;

  function close() {
    try {
      sessionStorage.setItem(CLOSED_KEY, version ?? "");
    } catch {
      /* it comes back on the next check */
    }
    setVersion(null);
  }

  return (
    <div role="status" className="fixed bottom-10 right-4 z-50 flex max-w-xs items-center gap-2.5 rounded-xl border border-line bg-surface py-2 pl-3 pr-1.5 text-[13px] shadow-lg">
      <span className="icon-chip tone-accent shrink-0">
        <ArrowPathIcon className="h-4 w-4" />
      </span>
      <p className="min-w-0 leading-snug">
        <b className="block font-semibold text-fg">อัปเดต {version} พร้อมแล้ว</b>
        <span className="text-muted">ปิดแล้วเปิดโปรแกรมใหม่เพื่ออัปเดต</span>
      </p>
      <button type="button" onClick={close} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon shrink-0">
        <XMarkIcon className="h-4 w-4" />
      </button>
    </div>
  );
}
