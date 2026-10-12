"use client";

import { useState } from "react";
import Link from "next/link";
import { ChevronRightIcon, InformationCircleIcon } from "@heroicons/react/24/outline";
import { FacebookIcon, GitHubIcon } from "@/components/ui/BrandIcons";
import { LINKS } from "@/lib/links";

/**
 * Credit line at the bottom of the phone home screen: About, the users' group and the source code. Folded into one
 * small pill by default so it never competes with the projects; a tap slides the row open (one line, icons for the
 * two outside links).
 */
export function PoweredBy() {
  const [open, setOpen] = useState(false);
  return (
    <footer className="flex justify-center px-4 py-4">
      <div className="inline-flex max-w-full items-center rounded-full border border-line bg-surface text-[12.5px] text-muted">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-expanded={open}
          aria-label={open ? "ซ่อนข้อมูล EasyGAS IDE" : "ข้อมูล EasyGAS IDE"}
          aria-controls="powered-by-row"
          className="inline-flex shrink-0 items-center gap-1.5 rounded-full py-1.5 pl-3 pr-2 transition hover:text-fg"
        >
          <InformationCircleIcon className="h-4 w-4" aria-hidden />
          {/* the open row needs the width on a phone: the label folds away while it shows */}
          <span className={open ? "sr-only" : ""}>EasyGAS IDE</span>
          <ChevronRightIcon className={`h-3.5 w-3.5 transition-transform duration-300 ${open ? "rotate-180" : ""}`} aria-hidden />
        </button>
        {/* grid 0fr → 1fr animates the row open without measuring it */}
        <div
          id="powered-by-row"
          className={`grid min-w-0 transition-[grid-template-columns,opacity] duration-300 ease-out ${open ? "grid-cols-[1fr] opacity-100" : "grid-cols-[0fr] opacity-0"}`}
          inert={!open}
        >
          <div className="flex min-w-0 items-center gap-1 overflow-hidden whitespace-nowrap pr-1.5">
            <span className="h-4 w-px shrink-0 bg-line" aria-hidden />
            <span className="px-1.5">
              Powered by <span className="font-semibold text-fg">Mr.KKD</span>
            </span>
            <Link href="/about" className="link px-1">
              เกี่ยวกับ
            </Link>
            <a href={LINKS.facebookGroup} target="_blank" rel="noopener noreferrer" aria-label="กลุ่ม Facebook" title="กลุ่ม Facebook" className="btn btn-ghost btn-sm btn-icon">
              <FacebookIcon className="h-4 w-4 text-[#1877F2]" />
            </a>
            <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" aria-label="GitHub" title="GitHub" className="btn btn-ghost btn-sm btn-icon">
              <GitHubIcon className="h-4 w-4" />
            </a>
          </div>
        </div>
      </div>
    </footer>
  );
}
