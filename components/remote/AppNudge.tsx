"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import { XMarkIcon } from "@heroicons/react/24/outline";

const CLOSED_KEY = "egs:push-nudge-closed";
const PRO_APP = "https://easygaside.tech/app";

/**
 * Pro, on a paired phone without notifications (lib/remote/nudge.ts decides): install the EasyGAS app from
 * easygaside.tech/app. The app is where the home-screen icon and the notifications live (they belong to
 * that origin; this tunnel address changes). `strip` = one line atop the IDE chat; otherwise a card.
 * Closed once, it stays closed on this phone.
 */
export function AppNudge({ strip = false }: { strip?: boolean }) {
  const [closed, setClosed] = useState(true);
  useEffect(() => {
    try {
      setClosed(localStorage.getItem(CLOSED_KEY) === "1");
    } catch {
      setClosed(false);
    }
  }, []);
  if (closed) return null;

  function close() {
    setClosed(true);
    try {
      localStorage.setItem(CLOSED_KEY, "1");
    } catch {
      /* fine: it shows again next time */
    }
  }

  const closeButton = (
    <button type="button" aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon shrink-0" onClick={close}>
      <XMarkIcon className="h-4 w-4" />
    </button>
  );

  if (strip) {
    // a floating card inside the chat, not one more full-width bar under the header
    return (
      <div className="mx-3 mt-3 flex flex-none items-center gap-3 rounded-xl border border-line bg-surface py-2.5 pl-3 pr-1.5 shadow-sm [@media(max-height:520px)]:hidden">
        <Image src="/icon/android-icon-192x192.png" alt="" width={36} height={36} className="shrink-0 rounded-[10px]" />
        <p className="min-w-0 flex-1 text-[13px] leading-snug">
          <b className="block font-semibold text-fg">
            ติดตั้งแอป <span className="whitespace-nowrap">EasyGAS</span>
          </b>
          <span className="text-muted">
            <span className="whitespace-nowrap">เด้งเตือนเมื่อ AI</span> <span className="whitespace-nowrap">ทำเสร็จหรือถามกลับ</span>
          </span>
        </p>
        <a href={PRO_APP} className="btn btn-primary btn-sm shrink-0">
          ติดตั้ง
        </a>
        {closeButton}
      </div>
    );
  }

  return (
    <div className="card flex items-center gap-3 py-3 pl-3 pr-1.5">
      <Image src="/icon/android-icon-192x192.png" alt="" width={44} height={44} className="shrink-0 rounded-xl" />
      <div className="min-w-0 flex-1">
        {/* Thai has no spaces: keep phrases whole so a line never breaks inside a word (มือ|ถือ) */}
        <p className="text-sm font-semibold">
          ติดตั้งแอป <span className="whitespace-nowrap">EasyGAS</span>
        </p>
        <p className="hint mt-0.5">
          <span className="whitespace-nowrap">เปิดคอมเครื่องนี้ได้ในแตะเดียว</span>{" "}
          <span className="whitespace-nowrap">และเด้งเตือนเมื่อ AI</span> <span className="whitespace-nowrap">ทำเสร็จหรือถามกลับ</span>
        </p>
      </div>
      <a href={PRO_APP} className="btn btn-primary btn-sm shrink-0">
        ติดตั้ง
      </a>
      {closeButton}
    </div>
  );
}
