"use client";

import { useEffect, useState } from "react";
import { DevicePhoneMobileIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { RemoteView } from "@/app/settings/remote-actions";

/** { shown: how many times, next: not before (ms) } — this computer's browser storage, per install */
const INVITE_KEY = "egs:phone-invite";
/** about a minute into the coding page: the user has settled in, not on arrival */
const INVITE_DELAY_MS = 60_000;
/** another dialog is open at that moment: try again a little later */
const BUSY_RETRY_MS = 15_000;
const SNOOZE_MS = 7 * 24 * 60 * 60 * 1000;
const MAX_SHOWS = 2;
/** "ลองเลย" or the cross: never again */
const DONE = MAX_SHOWS;

type Seen = { shown: number; next: number };

function readSeen(): Seen | null {
  try {
    const raw = JSON.parse(localStorage.getItem(INVITE_KEY) ?? "null") as Partial<Seen> | null;
    return { shown: Number(raw?.shown) || 0, next: Number(raw?.next) || 0 };
  } catch {
    return null; // no storage: stay quiet rather than ask on every visit
  }
}

function writeSeen(s: Seen): void {
  try {
    localStorage.setItem(INVITE_KEY, JSON.stringify(s));
  } catch {
    /* not remembered: it may ask again next time */
  }
}

/**
 * When to invite: remote access is off, no phone has ever been paired, about a minute has passed on this page,
 * no other dialog is open, and the user has not said no — at most twice, a week apart.
 */
export function usePhoneInvite(v: RemoteView | null): { show: boolean; accept: () => void; later: () => void; never: () => void } {
  const [show, setShow] = useState(false);
  const eligible = !!v && !v.enabled && v.devices.length === 0;

  useEffect(() => {
    if (!eligible) {
      setShow(false);
      return;
    }
    const seen = readSeen();
    if (!seen || seen.shown >= MAX_SHOWS || seen.next > Date.now()) return;
    let t: ReturnType<typeof setTimeout>;
    const attempt = () => {
      if (document.querySelector('[aria-modal="true"]') || document.visibilityState !== "visible") {
        t = setTimeout(attempt, BUSY_RETRY_MS);
        return;
      }
      writeSeen({ shown: seen.shown + 1, next: Date.now() + SNOOZE_MS });
      setShow(true);
    };
    t = setTimeout(attempt, INVITE_DELAY_MS);
    return () => clearTimeout(t);
  }, [eligible]);

  const done = () => {
    writeSeen({ shown: DONE, next: 0 });
    setShow(false);
  };
  return { show, accept: done, later: () => setShow(false), never: done };
}

/**
 * The one-time "did you know" card beside the phone button: above it at the bottom-right of a wide window,
 * under the top bar on a narrow one. It slides in softly and takes no focus, so typing carries on.
 */
export function PhoneInvite({ placement, onAccept, onLater, onNever }: { placement: "bottom" | "top"; onAccept: () => void; onLater: () => void; onNever: () => void }) {
  return (
    <div
      role="status"
      aria-label="ชวนใช้จากมือถือ"
      className={`phone-invite fixed right-3 z-40 w-[min(340px,calc(100vw-1.5rem))] rounded-xl border border-line bg-surface p-4 shadow-[var(--shadow-pop)] ${
        placement === "bottom" ? "bottom-9 phone-invite-up" : "top-14 phone-invite-down"
      }`}
    >
      {placement === "bottom" && <span className="absolute -bottom-[7px] right-24 h-3 w-3 rotate-45 border-b border-r border-line bg-surface" aria-hidden />}
      <div className="flex items-start gap-3">
        <span className="phone-invite-icon grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
          <DevicePhoneMobileIcon className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold text-fg">เชื่อมต่อกับมือถือ</p>
          <p className="hint mt-1">สั่ง AI ดูพรีวิว และเผยแพร่จากมือถือได้ แค่สแกน QR ใช้ฟรี</p>
        </div>
        <button type="button" aria-label="ไม่ต้องชวนอีก" title="ไม่ต้องชวนอีก" className="btn btn-ghost btn-sm btn-icon -mr-1 -mt-1 shrink-0" onClick={onNever}>
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>
      <div className="mt-3 flex justify-end gap-2">
        <button type="button" className="btn btn-ghost btn-sm" onClick={onLater}>
          ไว้ทีหลัง
        </button>
        <button type="button" className="btn btn-primary btn-sm" onClick={onAccept}>
          ลองเลย
        </button>
      </div>
    </div>
  );
}
