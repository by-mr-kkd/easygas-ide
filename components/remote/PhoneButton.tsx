"use client";

import { useEffect, useState } from "react";
import { DevicePhoneMobileIcon } from "@heroicons/react/24/outline";
import type { RemoteView } from "@/app/settings/remote-actions";
import { phoneStatus, type PhoneTone } from "./phone-status";

/** remembered for this run of the app only: the "hello" tilt of a phone button that is off plays once */
const HELLO_KEY = "egs:phone-hello";
const HELLO_DELAY_MS = 3000;

const DOT: Record<PhoneTone, string> = {
  on: "bg-accent phone-dot-live",
  busy: "bg-info phone-dot-busy",
  error: "bg-danger",
  off: "bg-line-strong",
};

/**
 * The IDE's way to the phone: `bar` = the item in the status bar of a wide window, `icon` = a top-bar button
 * on a narrow one. A dot tells the state at a glance; when online it sends out a slow, faint ring
 * (app/globals.css .phone-dot-live). Off, the icon tilts hello once per launch; `wave` makes it tilt again
 * (the invite popup is showing).
 */
export function PhoneButton({ v, variant, wave = false, onClick }: { v: RemoteView; variant: "bar" | "icon"; wave?: boolean; onClick: () => void }) {
  const { tone, label } = phoneStatus(v);
  const [hello, setHello] = useState(false);

  useEffect(() => {
    if (tone !== "off") return;
    try {
      if (sessionStorage.getItem(HELLO_KEY)) return;
      sessionStorage.setItem(HELLO_KEY, "1");
    } catch {
      return;
    }
    const t = setTimeout(() => setHello(true), HELLO_DELAY_MS);
    return () => clearTimeout(t);
  }, [tone]);

  const icon = (
    <span className={`relative inline-flex ${hello || wave ? "phone-hello" : ""}`} onAnimationEnd={() => setHello(false)}>
      <DevicePhoneMobileIcon className={variant === "icon" ? "h-[18px] w-[18px]" : "h-3.5 w-3.5"} aria-hidden />
      <span className={`absolute -bottom-0.5 -right-0.5 h-[7px] w-[7px] rounded-full ring-2 ring-[var(--surface)] ${DOT[tone]}`} aria-hidden />
    </span>
  );

  if (variant === "icon") {
    return (
      <button type="button" onClick={onClick} title={`ใช้จากมือถือ: ${label}`} aria-label={`ใช้จากมือถือ: ${label}`} className="btn btn-ghost btn-sm btn-icon">
        {icon}
      </button>
    );
  }
  return (
    <button
      type="button"
      onClick={onClick}
      title="สั่งงานคอมเครื่องนี้จากมือถือ กดเพื่อเปิด จับคู่ หรือดูสถานะ"
      className={`flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg ${tone === "error" ? "text-danger" : ""}`}
    >
      {icon}
      ใช้จากมือถือ: {label}
    </button>
  );
}
