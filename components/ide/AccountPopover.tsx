"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { Portal } from "@/components/ui/Portal";
import { ThemeSwitch } from "@/components/ui/ThemeToggle";

/**
 * The account corner on a narrow screen: the initial opens a small sheet with the Google account that publishes,
 * the light / dark switch (the top bar has no room for it there) and a link to the account settings — instead of
 * jumping straight to Settings, which read as a wrong tap. On wide screens the top bar shows the email and the
 * theme switch inline, so this is not used there.
 */
export function AccountPopover({ email, settingsHref }: { email: string | null; settingsHref: string }) {
  const [open, setOpen] = useState(false);
  const initial = (email?.[0] ?? "G").toUpperCase();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        title="บัญชีและธีม"
        aria-label={`บัญชี Google: ${email ?? "เชื่อมแล้ว"} · ธีม`}
        className="btn btn-ghost btn-sm gap-2 pl-1.5 pr-1.5 font-normal text-fg"
      >
        <span className="grid h-[22px] w-[22px] place-items-center rounded-full bg-accent-soft text-[11px] font-bold text-accent-text">{initial}</span>
      </button>
      {open && (
        <Portal>
          <div className="dialog-backdrop" onClick={() => setOpen(false)}>
            <div role="dialog" aria-modal="true" aria-label="บัญชีและธีม" className="dialog max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
              <div className="flex items-start justify-between gap-3">
                <div className="flex min-w-0 items-center gap-3">
                  <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-accent-soft text-base font-bold text-accent-text">{initial}</span>
                  <span className="min-w-0">
                    <span className="block text-sm font-semibold">บัญชี Google ที่ใช้เผยแพร่</span>
                    <span className="block truncate text-[13px] text-muted">{email ?? "เชื่อมแล้ว"}</span>
                  </span>
                </div>
                <button type="button" onClick={() => setOpen(false)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon shrink-0">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <span className="text-sm">โหมดสว่าง / มืด</span>
                <ThemeSwitch />
              </div>
              <div className="mt-4 flex flex-wrap justify-end gap-2">
                <Link href={settingsHref} onClick={() => setOpen(false)} className="btn btn-secondary btn-sm">
                  <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  เปลี่ยนบัญชี / ตั้งค่า Google
                </Link>
                <button type="button" onClick={() => setOpen(false)} className="btn btn-primary btn-sm">
                  ปิด
                </button>
              </div>
            </div>
          </div>
        </Portal>
      )}
    </>
  );
}
