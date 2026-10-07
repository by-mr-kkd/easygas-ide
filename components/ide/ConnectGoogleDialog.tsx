"use client";

import { useEffect } from "react";
import Link from "next/link";
import { XMarkIcon } from "@heroicons/react/24/outline";
import { googleStatusAction } from "@/app/settings/actions";
import { GoogleConnect } from "@/components/settings/GoogleConnect";

/**
 * Connect the Google account without leaving the project: the same sign-in block the Settings page
 * uses, in a dialog. Publishing is the only thing that needs it, so the IDE asks at that moment.
 */
export function ConnectGoogleDialog({
  open,
  projectId,
  onClose,
  onConnected,
}: {
  open: boolean;
  /** so the settings link can bring the user back to this project */
  projectId: string;
  onClose: () => void;
  onConnected: (email: string | null) => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  async function connected() {
    let email: string | null = null;
    try {
      email = (await googleStatusAction()).email;
    } catch {
      /* the account is connected either way — the address is only a label */
    }
    onConnected(email);
  }

  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="เชื่อมบัญชี Google" className="dialog max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-[15px] font-semibold">เชื่อมบัญชี Google</h3>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="hint mb-3">
          ใช้ตอนเผยแพร่เท่านั้น เครื่องมือที่สร้างจะไปอยู่ในบัญชี Google ของคุณเอง เชื่อมครั้งเดียวใช้ได้ทุกโปรเจกต์
        </p>
        <GoogleConnect plain loggedIn={false} email={null} onConnected={connected} />
        <p className="hint mt-3">
          ไม่แน่ใจว่าต้องกดอะไรบ้าง?{" "}
          <Link href={`/settings?s=google&from=${projectId}`} className="link">
            ดูวิธีเชื่อมทีละขั้นพร้อมภาพ
          </Link>
        </p>
      </div>
    </div>
  );
}
