"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon, ComputerDesktopIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { openAuthWindowAction } from "@/app/pages/actions";

/** The page is shown through the phone gateway (a tunnel host), not the computer's own window. */
const onPhone = () => typeof window !== "undefined" && !/^(127\.0\.0\.1|localhost|\[::1\])$/.test(window.location.hostname);

/**
 * "เปิดหน้าอนุญาต" — the owner's one-time Allow. Google does not support several signed-in accounts for web apps
 * (the link turns into /macros/u/<n>/ and fails), so it must happen where only ONE account is signed in:
 * on the computer, the app opens a private window (Chrome incognito / Edge InPrivate) on the /exec link; on a phone
 * no page can open an incognito tab, so the link is copied with the steps, or the window opens on the computer.
 */
export function AuthOpenButton({ projectId, execUrl, googleEmail }: { projectId: string; execUrl: string; googleEmail?: string | null }) {
  const [note, setNote] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [busy, setBusy] = useState(false);
  const account = googleEmail ?? "ที่ใช้เผยแพร่";
  const phone = onPhone();

  async function openOnComputer(fromPhone: boolean) {
    setBusy(true);
    const opened = await openAuthWindowAction(projectId).catch(() => false);
    setBusy(false);
    if (opened) {
      setNote(
        fromPhone
          ? `เปิดหน้าอนุญาตรอไว้บนคอมแล้ว (หน้าต่างไม่ระบุตัวตน) ไปที่คอม ล็อกอินบัญชี ${account} บัญชีเดียว แล้วกด Review permissions → Advanced → Allow เสร็จแล้วกด “อนุญาตแล้ว ตรวจอีกครั้ง”`
          : `เปิดหน้าต่างไม่ระบุตัวตนแล้ว ล็อกอินบัญชี ${account} บัญชีเดียว แล้วกด Review permissions → Advanced → Allow เสร็จแล้วปิดหน้าต่างนั้นได้`,
      );
      return;
    }
    if (fromPhone) {
      setNote("เปิดหน้าต่างบนคอมไม่ได้ ใช้ปุ่มคัดลอกลิงก์แทน");
      return;
    }
    window.open(execUrl, "_blank", "noreferrer");
    setNote(`ไม่พบ Chrome หรือ Edge เลยเปิดในเบราว์เซอร์ปกติ ถ้าขึ้นว่าเปิดไฟล์ไม่ได้ ให้เปิดลิงก์ในหน้าต่างที่ล็อกอินบัญชี ${account} บัญชีเดียว`);
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(execUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
    setNote(`ใน Chrome กด ⋮ → แท็บใหม่ที่ไม่ระบุตัวตน → วางลิงก์ → ล็อกอินบัญชี ${account} → Review permissions → Advanced → Allow`);
  }

  return (
    <div className="flex min-w-0 flex-col gap-1.5">
      <div className="flex flex-wrap items-center gap-2">
        {phone ? (
          <>
            <p className="hint w-full text-xs">
              แนะนำให้กดอนุญาตที่คอม บนมือถือหน้าอนุญาตของ Google มักเปิดไม่ได้ถ้าล็อกอินไว้หลายบัญชี
            </p>
            <button type="button" onClick={() => openOnComputer(true)} disabled={busy} className="btn btn-primary btn-sm shrink-0">
              <ComputerDesktopIcon className="h-4 w-4" />
              เปิดหน้าอนุญาตที่คอม
            </button>
            <button type="button" onClick={copy} className="btn btn-secondary btn-sm shrink-0">
              {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
              {copied ? "คัดลอกแล้ว" : "ทำบนมือถือ: คัดลอกลิงก์"}
            </button>
          </>
        ) : (
          <button type="button" onClick={() => openOnComputer(false)} disabled={busy} className="btn btn-primary btn-sm shrink-0">
            <ShieldCheckIcon className="h-4 w-4" />
            เปิดหน้าอนุญาต <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </button>
        )}
      </div>
      {note && <p className="hint text-xs">{note}</p>}
    </div>
  );
}
