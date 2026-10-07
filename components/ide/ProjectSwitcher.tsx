"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ChevronUpDownIcon, FolderIcon, PlusIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { Tooltip } from "@/components/ui/Tooltip";

export interface SwitcherProject {
  id: string;
  name: string;
  deployed: boolean;
}

/** Top-bar project switcher — jump between projects, create, or find ideas without leaving the IDE. */
export function ProjectSwitcher({
  currentId,
  currentName,
  projects,
  className = "",
}: {
  currentId: string;
  currentName: string;
  projects: SwitcherProject[];
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const others = projects.filter((p) => p.id !== currentId);

  return (
    <div className={`relative min-w-0 ${className}`} ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        aria-haspopup="menu"
        aria-expanded={open}
        title="สลับโปรเจกต์"
        className="btn btn-ghost btn-sm w-full min-w-0 justify-start px-2 font-semibold text-fg"
      >
        <FolderIcon className="h-4 w-4 shrink-0 text-faint" />
        <span className="truncate">{currentName}</span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 text-faint" />
      </button>

      {open && (
        <div role="menu" className="absolute left-0 top-full z-50 mt-1 w-64 max-w-[calc(100vw-1.5rem)] overflow-hidden rounded-lg border border-line bg-surface shadow-pop">
          {others.length > 0 && (
            <div className="max-h-72 overflow-auto py-1">
              <p className="px-3 pb-1 pt-1.5 text-xs font-semibold text-faint">
                สลับไปโปรเจกต์
              </p>
              {others.map((p) => (
                <Link
                  key={p.id}
                  href={`/projects/${p.id}`}
                  onClick={() => setOpen(false)}
                  className="flex items-center gap-2 px-3 py-2 text-sm text-fg transition hover:bg-sunken"
                >
                  <span className="min-w-0 flex-1 truncate">{p.name}</span>
                  {p.deployed && (
                    <Tooltip label="เผยแพร่แล้ว" placement="left">
                      <span className="h-2 w-2 shrink-0 rounded-full bg-accent" />
                    </Tooltip>
                  )}
                </Link>
              ))}
            </div>
          )}
          <div className="border-t border-line p-1">
            <Link
              href="/projects"
              onClick={() => setOpen(false)}
              className="nav-item"
            >
              <PlusIcon className="h-4 w-4" />
              โปรเจกต์ทั้งหมด หรือสร้างใหม่
            </Link>
            <Link
              href="/styleshopping"
              onClick={() => setOpen(false)}
              className="nav-item"
            >
              <Squares2X2Icon className="h-4 w-4" />
              ตัวอย่างสไตล์
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
