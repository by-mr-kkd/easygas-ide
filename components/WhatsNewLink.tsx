"use client";

import { useEffect, useState } from "react";
import { MegaphoneIcon } from "@heroicons/react/24/outline";

/** remembered for this run of the app only (sessionStorage is emptied when the window closes) */
const PLAYED_KEY = "egs:whatsnew-played";

/**
 * "มีอะไรใหม่" in the status bar. `fresh` = a newer version than this one is on its way (downloading / ready):
 * then the link greets the user once per launch — a short wiggle and glow (app/globals.css .whatsnew-play),
 * nothing that takes focus or makes a sound, and nothing at all when the app is already the latest or when
 * the system asks for reduced motion.
 */
export function WhatsNewLink({ href, fresh, className }: { href: string; fresh: boolean; className: string }) {
  const [play, setPlay] = useState(false);

  useEffect(() => {
    if (!fresh) return;
    try {
      if (sessionStorage.getItem(PLAYED_KEY)) return;
      sessionStorage.setItem(PLAYED_KEY, "1");
    } catch {
      return; // no storage: better never than on every page
    }
    const start = setTimeout(() => setPlay(true), 1500); // after the window has settled
    return () => clearTimeout(start);
  }, [fresh]);

  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      title={fresh ? "มีเวอร์ชันใหม่ ดูว่ามีอะไรใหม่ (กระทู้ในห้องประกาศ)" : "ดูว่าเวอร์ชันนี้มีอะไรใหม่ (กระทู้ในห้องประกาศ)"}
      onAnimationEnd={() => setPlay(false)}
      className={`${className} ${play ? "whatsnew-play" : ""} ${fresh ? "text-accent-text" : ""}`}
    >
      <MegaphoneIcon className="whatsnew-icon h-3.5 w-3.5" aria-hidden />
      มีอะไรใหม่
    </a>
  );
}
