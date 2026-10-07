import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one top bar every screen shares (projects, settings, style picker, the IDE). In the desktop
 * app it is also the window's title bar: `.titlebar` makes its empty space drag the window and keeps
 * the right edge clear of the minimise / maximise / close buttons — keep it exactly h-12 (48px, the
 * same number as TITLEBAR_HEIGHT in electron/main.js).
 * `center` = where you are (a page name, or the project switcher); `right` = that screen's actions.
 */
export function AppTopBar({ center, right }: { center?: ReactNode; right?: ReactNode }) {
  return (
    <header className="titlebar sticky top-0 z-30 flex h-12 flex-none items-center gap-2.5 border-b border-line bg-surface pl-3 sm:pl-4">
      <Link href="/projects" className="flex shrink-0 items-center gap-2" title="โปรเจกต์ทั้งหมด">
        <Image src="/icon/android-icon-192x192.png" alt="" width={24} height={24} className="rounded-md" />
        <b className="hidden text-[15px] tracking-tight sm:block">
          Easy<span className="text-accent-text">GAS</span>
        </b>
      </Link>
      {center && (
        <>
          <span className="hidden h-4 w-px shrink-0 bg-line-strong sm:block" />
          <div className="flex min-w-0 items-center">{center}</div>
        </>
      )}
      <span className="min-w-4 flex-1" />
      <div className="flex shrink-0 items-center gap-1.5">{right}</div>
    </header>
  );
}
