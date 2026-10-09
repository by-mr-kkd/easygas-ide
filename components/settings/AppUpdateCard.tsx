"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { setAutoUpdateAction } from "@/app/settings/actions";
import type { UpdateState } from "@/lib/app-update";

const DOWNLOAD_PAGE = "https://easygaside.tech/download";

function statusText(s: UpdateState | null, on: boolean): string {
  if (!on) return "ปิดอยู่ โปรแกรมจะไม่เช็คเวอร์ชันใหม่เอง";
  switch (s?.status) {
    case "checking":
      return "กำลังเช็คเวอร์ชันใหม่…";
    case "latest":
      return "เป็นเวอร์ชันล่าสุดแล้ว";
    case "downloading":
      return `กำลังดาวน์โหลดเวอร์ชัน ${s.version ?? "ใหม่"}${s.percent !== null ? ` (${s.percent}%)` : ""}`;
    case "ready":
      return `ดาวน์โหลดเวอร์ชัน ${s.version ?? "ใหม่"} แล้ว ปิดแล้วเปิดโปรแกรมใหม่เพื่ออัปเดต`;
    case "error":
      return "เช็คอัปเดตไม่สำเร็จ จะลองใหม่ตอนเปิดโปรแกรมครั้งหน้า";
    default:
      return "จะเช็คตอนเปิดโปรแกรมครั้งหน้า";
  }
}

/** Settings → ข้อมูลในเครื่อง: the version in use and the "update on launch" switch (default on). */
export function AppUpdateCard({ version, enabled, state }: { version: string; enabled: boolean; state: UpdateState | null }) {
  const router = useRouter();
  const [on, setOn] = useState(enabled);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <div className="card mb-4 min-w-0 px-4 py-4">
      <div className="text-sm font-semibold text-fg">EasyGAS IDE เวอร์ชัน {version}</div>
      <p className={`mt-0.5 break-words text-[13px] ${state?.status === "ready" && on ? "font-medium text-accent" : "hint"}`}>{statusText(state, on)}</p>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input type="checkbox" checked={on} onChange={(e) => toggle(e.target.checked)} className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent" />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">อัปเดตอัตโนมัติเมื่อเปิดโปรแกรม</span>
          <span className="hint mt-0.5 block">
            ตอนเปิดโปรแกรมจะเช็คเวอร์ชันใหม่จาก GitHub แล้วดาวน์โหลดไว้ อัปเดตจะติดตั้งเองตอนปิดโปรแกรม โปรเจกต์และการตั้งค่าอยู่ครบ
          </span>
        </span>
      </label>
      {!on && (
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
