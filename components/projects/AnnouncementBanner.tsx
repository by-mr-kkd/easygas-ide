"use client";

import { useEffect, useState } from "react";
import { ArrowTopRightOnSquareIcon, MegaphoneIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { appAnnouncementAction, dismissAnnouncementAction } from "@/app/projects/actions";
import type { Announcement } from "@/lib/announcement";

/**
 * The notices bar at the top of the home screen: what easygaside.tech announces (the landing page's "ประกาศ" pill and
 * a post ticked "ประกาศในโปรแกรม"), one row each. Asked after the page is on screen (never during render), links open
 * in the browser, and ✕ hides a notice on this computer (settings.app) until the website posts a new one.
 */
export function AnnouncementBanner() {
  const [items, setItems] = useState<Announcement[]>([]);
  useEffect(() => {
    let alive = true;
    appAnnouncementAction()
      .then((next) => {
        if (alive) setItems(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (items.length === 0) return null;

  const close = (id: string) => {
    setItems((list) => list.filter((a) => a.id !== id));
    dismissAnnouncementAction(id).catch(() => {});
  };

  return (
    <section aria-label="ประกาศ" className="overflow-hidden rounded-xl border border-line border-l-4 border-l-info bg-info-soft/50">
      {items.map((a, i) => (
        <div key={a.id} className={`flex items-start gap-3 py-2.5 pl-3 pr-2 ${i > 0 ? "border-t border-line" : ""}`}>
          <MegaphoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-info" aria-hidden="true" />
          <a href={a.url} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
            <span className="block text-[11px] font-semibold text-info">ประกาศจาก EasyGAS</span>
            <span className="block text-sm font-semibold text-fg group-hover:underline">{a.title}</span>
            {a.excerpt && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{a.excerpt}</span>}
            <span className="mt-0.5 inline-flex items-center gap-1 text-[13px] font-medium text-info">
              {a.kind === "post" ? "อ่านต่อ" : "เปิดลิงก์"}
              <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
            </span>
          </a>
          <button type="button" aria-label="ปิดประกาศนี้" title="ปิดประกาศนี้" className="btn btn-ghost btn-sm btn-icon shrink-0" onClick={() => close(a.id)}>
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
      ))}
    </section>
  );
}
