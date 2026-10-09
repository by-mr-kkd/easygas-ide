"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { AcademicCapIcon, Cog6ToothIcon, HomeIcon, ShareIcon, SwatchIcon } from "@heroicons/react/24/outline";

const TABS = [
  { href: "/projects", label: "หน้าแรก", Icon: HomeIcon, match: (p: string) => p.startsWith("/projects") },
  { href: "/shares", label: "ที่คนแชร์", Icon: ShareIcon, match: (p: string) => p.startsWith("/shares") },
  { href: "/styleshopping", label: "สไตล์", Icon: SwatchIcon, match: (p: string) => p.startsWith("/styleshopping") },
  { href: "/knowledge?s=lessons", label: "AI เรียนรู้", Icon: AcademicCapIcon, match: (p: string) => p.startsWith("/knowledge") },
  { href: "/settings?s=ai", label: "ตั้งค่า", Icon: Cog6ToothIcon, match: (p: string) => p.startsWith("/settings") || p === "/about" },
];

/** where the bar shows: the app's own screens, not the IDE (it has its own chat / preview / code tabs) */
const SHOWN = /^\/(projects\/?$|shares|styleshopping|knowledge|settings|about)/;

/**
 * Phone-sized screens (below md): the app's menu as a bottom tab bar, like an installed app. A spacer of
 * the same height keeps the end of each page clear of it. Wider windows have the left rail instead.
 */
export function MobileNav() {
  const path = usePathname() ?? "";
  if (!SHOWN.test(path)) return null;
  return (
    <>
      <div aria-hidden className="h-[calc(4rem+env(safe-area-inset-bottom))] md:hidden" />
      <nav
        aria-label="เมนู"
        className="fixed inset-x-0 bottom-0 z-40 flex border-t border-line bg-panel/95 px-1 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        {TABS.map(({ href, label, Icon, match }) => {
          const active = match(path);
          return (
            <Link
              key={href}
              href={href}
              aria-current={active ? "page" : undefined}
              className={`flex h-16 min-w-0 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
                active ? "text-accent-text" : "text-faint"
              }`}
            >
              <Icon className={`h-6 w-6 ${active ? "stroke-2" : ""}`} aria-hidden />
              <span className="truncate">{label}</span>
            </Link>
          );
        })}
      </nav>
    </>
  );
}
