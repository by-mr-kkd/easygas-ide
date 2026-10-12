import Image from "next/image";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * The one top bar every screen shares (projects, settings, style picker, the IDE). In the desktop
 * app it is also the window's title bar: `.titlebar` makes its empty space drag the window and keeps
 * the right edge clear of the minimise / maximise / close buttons — keep it exactly h-12 (48px, the
 * same number as TITLEBAR_HEIGHT in electron/main.js).
 * `center` = where you are (a page name, or the project switcher); `right` = that screen's identity
 * corner (account, theme); `pro` = this install has Pro (the yellow tag after the name).
 * `toolbar` = an optional second row (40px) for the screen's working controls — the IDE puts search,
 * the pane tools and เผยแพร่ there, so the title bar itself stays quiet and draggable.
 */
export function AppTopBar({ center, right, toolbar, pro = false }: { center?: ReactNode; right?: ReactNode; toolbar?: ReactNode; pro?: boolean }) {
  return (
    <>
      <header className="titlebar sticky top-0 z-30 flex h-12 flex-none items-center gap-2.5 border-b border-line bg-panel2 pl-3 sm:pl-4">
        <Link href="/projects" className="flex shrink-0 items-center gap-2" title="หน้าหลัก">
          <Image src="/icon/android-icon-192x192.png" alt="" width={24} height={24} className="rounded-md" />
          <b className="hidden text-[15px] tracking-tight sm:block">
            Easy<span className="text-accent-text">GAS</span>
          </b>
          {pro && (
            <span title="EasyGAS Pro" className="pro-badge">
              PRO
            </span>
          )}
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
      {toolbar && (
        // pl-1.5: a .btn-sm's icon then starts at 16px, in line with the logo above it
        <div role="toolbar" className="sticky top-12 z-20 flex h-10 flex-none items-center gap-1.5 border-b border-line bg-surface pl-1.5 pr-2.5">
          {toolbar}
        </div>
      )}
    </>
  );
}
