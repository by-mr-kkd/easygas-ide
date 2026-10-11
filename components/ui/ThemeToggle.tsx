"use client";

import { MoonIcon, SunIcon } from "@heroicons/react/24/outline";
import { useIsDark } from "./useIsDark";

/** Flips the `.dark` class on <html> and persists the choice (the no-flash script in app/layout.tsx reads it). */
function applyTheme(dark: boolean) {
  document.documentElement.classList.toggle("dark", dark);
  try {
    localStorage.setItem("theme", dark ? "dark" : "light");
  } catch {
    /* ignore storage errors */
  }
}

/**
 * One button that flips between the two themes. The initial class is set by the no-flash script in
 * app/layout.tsx; this only mirrors + flips it (and follows the command palette's flips). Default theme is light.
 */
export function ThemeToggle({ className = "" }: { className?: string }) {
  const dark = useIsDark();
  return (
    <button
      type="button"
      onClick={() => applyTheme(!dark)}
      aria-label="สลับโหมดมืด/สว่าง"
      title={dark ? "โหมดสว่าง" : "โหมดมืด"}
      className={`btn btn-ghost btn-icon ${className}`}
    >
      {dark ? <SunIcon className="h-[18px] w-[18px]" /> : <MoonIcon className="h-[18px] w-[18px]" />}
    </button>
  );
}

/** The same choice as a two-way switch (sun | moon side by side) — for the IDE's account corner. */
export function ThemeSwitch({ className = "" }: { className?: string }) {
  const dark = useIsDark();
  return (
    <div className={`seg border-0 ${className}`} role="group" aria-label="ธีม">
      <button
        type="button"
        onClick={() => applyTheme(false)}
        aria-pressed={!dark}
        aria-label="โหมดสว่าง"
        title="โหมดสว่าง"
        className="seg-item h-6 w-7 justify-center px-0"
      >
        <SunIcon className="h-[15px] w-[15px]" />
      </button>
      <button
        type="button"
        onClick={() => applyTheme(true)}
        aria-pressed={dark}
        aria-label="โหมดมืด"
        title="โหมดมืด"
        className="seg-item h-6 w-7 justify-center px-0"
      >
        <MoonIcon className="h-[15px] w-[15px]" />
      </button>
    </div>
  );
}
