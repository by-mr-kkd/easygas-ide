"use client";

import { useEffect, useState } from "react";
import { MegaphoneIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { appAnnouncementAction } from "@/app/projects/actions";
import type { Announcement } from "@/lib/announcement";

const DISMISSED = "egs:announce-dismissed";

/**
 * News from easygaside.tech under the start panel on the home screen: the newest post an admin marked
 * "ประกาศในโปรแกรม". A tinted strip with an accent edge (not a card, no shadow) so it reads as a note
 * beside the work, not part of it. Asked after the page is on screen (never during render), opens in the
 * browser, and stays closed once dismissed until a new announcement replaces it.
 */
export function AnnouncementBanner() {
  const [a, setA] = useState<Announcement | null>(null);
  useEffect(() => {
    let alive = true;
    appAnnouncementAction()
      .then((next) => {
        if (!alive || !next) return;
        let closed: string | null = null;
        try {
          closed = localStorage.getItem(DISMISSED);
        } catch {
          /* show it */
        }
        if (closed !== next.id) setA(next);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, []);
  if (!a) return null;

  return (
    <aside
      aria-label="ประกาศ"
      className="mt-4 flex items-start gap-3 rounded-xl border border-l-4 border-line border-l-accent bg-accent-soft/40 py-3 pl-3 pr-2"
    >
      <MegaphoneIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" />
      <a href={a.url} target="_blank" rel="noopener noreferrer" className="group min-w-0 flex-1">
        <span className="block text-[11px] font-semibold text-accent-text">ประกาศจาก EasyGAS</span>
        <span className="block text-sm font-semibold text-fg group-hover:underline">{a.title}</span>
        {a.excerpt && <span className="mt-0.5 block text-[13px] leading-snug text-muted">{a.excerpt}</span>}
        <span className="mt-1 inline-block text-[13px] font-medium text-accent-text">อ่านต่อ ↗</span>
      </a>
      <button
        type="button"
        aria-label="ปิดประกาศนี้"
        className="btn btn-ghost btn-sm btn-icon shrink-0"
        onClick={() => {
          setA(null);
          try {
            localStorage.setItem(DISMISSED, a.id);
          } catch {
            /* closed for this visit only */
          }
        }}
      >
        <XMarkIcon className="h-4 w-4" />
      </button>
    </aside>
  );
}
