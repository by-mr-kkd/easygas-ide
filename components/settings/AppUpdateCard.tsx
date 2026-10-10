"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownTrayIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import { setAutoUpdateAction } from "@/app/settings/actions";
import { requestUpdateAction, updateStateAction } from "@/app/update-actions";
import type { UpdateState } from "@/lib/app-update";

const DOWNLOAD_PAGE = "https://easygaside.tech/download";
/** how often the card re-reads the shell's state while a check or a download runs */
const POLL_MS = 1500;

const busy = (s: UpdateState | null): boolean => s?.status === "checking" || s?.status === "downloading";

function statusText(s: UpdateState | null, on: boolean): string {
  switch (s?.status) {
    case "checking":
      return "กำลังเช็คเวอร์ชันใหม่…";
    case "latest":
      return "เป็นเวอร์ชันล่าสุดแล้ว";
    case "downloading":
      return `กำลังดาวน์โหลดเวอร์ชัน ${s.version ?? "ใหม่"}${s.percent !== null ? ` (${s.percent}%)` : ""}`;
    case "ready":
      return `ดาวน์โหลดเวอร์ชัน ${s.version ?? "ใหม่"} แล้ว กดติดตั้ง หรือปิดแล้วเปิดโปรแกรมใหม่ก็ได้`;
    case "error":
      return "เช็คอัปเดตไม่สำเร็จ ตรวจอินเทอร์เน็ตแล้วกดตรวจสอบอีกครั้ง";
    default:
      return on ? "จะเช็คตอนเปิดโปรแกรมครั้งหน้า" : "อัปเดตอัตโนมัติปิดอยู่ กดตรวจสอบเองได้ทุกเมื่อ";
  }
}

/**
 * Settings → ข้อมูลในเครื่อง: the version in use, the "update on launch" switch (default on), and the manual
 * buttons — check now, and install the downloaded version now (the app restarts). The buttons ask the desktop
 * shell through a file (lib/app-update requestUpdate); on a dev server there is no shell, so they are hidden.
 */
export function AppUpdateCard({ version, enabled, state: initial }: { version: string; enabled: boolean; state: UpdateState | null }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [state, setState] = useState(initial);
  const [waiting, setWaiting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // follow the shell while it works (and for a moment after a button press, before it has picked it up)
  useEffect(() => {
    if (!busy(state) && !waiting) return;
    const t = setTimeout(async () => {
      const next = await updateStateAction().catch(() => null);
      if (next) setState(next);
      if (next && next.at !== state?.at) setWaiting(false);
    }, POLL_MS);
    return () => clearTimeout(t);
  }, [state, waiting]);

  async function toggle(next: boolean) {
    setOn(next);
    setError(null);
    try {
      await setAutoUpdateAction(next);
      router.refresh();
    } catch {
      setOn(!next); // not stored: show what is really in effect
      setError("บันทึกการตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  async function ask(action: "check" | "install") {
    setError(null);
    setWaiting(true);
    const r = await requestUpdateAction(action).catch(() => null);
    if (!r?.ok) {
      setWaiting(false);
      setError(action === "install" ? "ยังไม่มีอัปเดตที่ดาวน์โหลดไว้" : "สั่งเช็คอัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  const ready = state?.status === "ready";

  return (
    <div className="card mb-4 min-w-0 px-4 py-4">
      <div className="flex flex-wrap items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-sm font-semibold text-fg">EasyGAS IDE เวอร์ชัน {version}</div>
          <p className={`mt-0.5 break-words text-[13px] ${ready ? "font-medium text-accent" : "hint"}`} aria-live="polite">
            {statusText(state, on)}
          </p>
        </div>
        {/* no state = not the installed app: nothing to ask */}
        {state &&
          (ready ? (
            <button type="button" onClick={() => ask("install")} disabled={waiting} className="btn btn-primary btn-sm shrink-0">
              <ArrowDownTrayIcon className="h-4 w-4" />
              {waiting ? "กำลังติดตั้ง…" : "ติดตั้งและเปิดใหม่"}
            </button>
          ) : (
            <button type="button" onClick={() => ask("check")} disabled={waiting || busy(state)} className="btn btn-secondary btn-sm shrink-0">
              <ArrowPathIcon className={`h-4 w-4 ${waiting || busy(state) ? "animate-spin" : ""}`} />
              {busy(state) ? (state?.status === "downloading" ? "กำลังดาวน์โหลด…" : "กำลังเช็ค…") : "ตรวจสอบการอัปเดต"}
            </button>
          ))}
      </div>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">อัปเดตอัตโนมัติเมื่อเปิดโปรแกรม</span>
          <span className="hint mt-0.5 block">
            ตอนเปิดโปรแกรมจะเช็คเวอร์ชันใหม่จาก GitHub แล้วดาวน์โหลดไว้ อัปเดตจะติดตั้งเองตอนปิดโปรแกรม โปรเจกต์และการตั้งค่าอยู่ครบ
          </span>
        </span>
      </label>
      {!state && (
        <p className="hint mt-3">
          ดาวน์โหลดเวอร์ชันล่าสุดเองได้ที่{" "}
          <a href={DOWNLOAD_PAGE} target="_blank" rel="noopener noreferrer" className="font-semibold text-accent underline underline-offset-4">
            easygaside.tech/download
          </a>
        </p>
      )}
      {error && <p className="mt-2 text-[13px] font-medium text-danger">{error}</p>}
    </div>
  );
}
