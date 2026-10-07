"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowPathIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import { checkRulebookAction, setRulebookAutoAction } from "@/app/settings/actions";
import type { RulebookStatus, UpdateResult } from "@/lib/rulebook/update";

function resultText(r: UpdateResult): string {
  switch (r.status) {
    case "updated":
      return `อัปเดตเป็นชุดกฎ v${r.version} แล้ว`;
    case "current":
      return "ใช้ชุดกฎล่าสุดอยู่แล้ว";
    case "rejected":
      return r.detail === "needs_newer_app"
        ? "มีชุดกฎใหม่ แต่ต้องอัปเดตแอปก่อนจึงจะใช้ได้"
        : "ไฟล์ที่ดาวน์โหลดมาไม่ผ่านการตรวจลายเซ็น จึงไม่ได้ติดตั้ง ยังใช้ชุดกฎเดิมอยู่";
    default:
      return r.detail === "not_published"
        ? "ยังไม่มีชุดกฎใหม่ให้ดาวน์โหลด"
        : "ตรวจไม่สำเร็จ เชื่อมต่อ GitHub ไม่ได้ ลองใหม่ภายหลัง";
  }
}

/** Rulebook version in use, the auto-update switch, a manual check, and the "propose a rule" link. */
export function RulebookPanel({ status, suggestUrl }: { status: RulebookStatus; suggestUrl: string }) {
  const router = useRouter();
  const [auto, setAuto] = useState(status.autoUpdate);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  async function toggle(next: boolean) {
    setAuto(next);
    try {
      await setRulebookAutoAction(next);
      router.refresh();
    } catch {
      setAuto(!next); // not stored — show what is really in effect
      setMessage("บันทึกการตั้งค่าไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
  }

  async function check() {
    setBusy(true);
    setMessage(null);
    try {
      setMessage(resultText(await checkRulebookAction()));
      router.refresh();
    } catch {
      setMessage("ตรวจไม่สำเร็จ ลองใหม่ภายหลัง");
    } finally {
      setBusy(false);
    }
  }

  const checked = status.checkedAt ? new Date(status.checkedAt).toLocaleString("th-TH", { dateStyle: "medium", timeStyle: "short" }) : null;

  return (
    <div className="card min-w-0 px-4 py-4">
      <div className="break-words text-sm font-semibold text-fg">
        ชุดกฎ v{status.version} · {status.cards} หัวข้อ
      </div>
      <p className="hint mt-0.5 break-words">
        {status.origin === "downloaded" ? "อัปเดตจาก GitHub" : "ชุดที่มากับแอป"}
        {checked ? ` · ตรวจล่าสุด ${checked}` : ""}
      </p>

      <label className="mt-4 flex cursor-pointer items-start gap-2.5">
        <input
          type="checkbox"
          checked={auto}
          onChange={(e) => toggle(e.target.checked)}
          className="mt-1 h-4 w-4 shrink-0 cursor-pointer accent-accent"
        />
        <span className="min-w-0">
          <span className="block text-sm font-medium text-fg">อัปเดตชุดกฎอัตโนมัติ วันละครั้ง</span>
          <span className="hint mt-0.5 block">
            แอปดาวน์โหลดไฟล์กฎจาก GitHub อย่างเดียว ไม่ส่งข้อมูลหรือโค้ดของคุณออกไป และจะใช้ไฟล์ก็ต่อเมื่อลายเซ็นของผู้ดูแลถูกต้อง
          </span>
        </span>
      </label>

      <div className="mt-4 flex flex-wrap items-center gap-2">
        <button type="button" onClick={check} disabled={busy} className="btn btn-secondary">
          <ArrowPathIcon className={`h-4 w-4 ${busy ? "animate-spin" : ""}`} />
          {busy ? "กำลังตรวจ…" : "ตรวจหาอัปเดตตอนนี้"}
        </button>
        <a href={suggestUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
          เสนอกฎใหม่
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </a>
      </div>
      <p className="hint mt-2">ปุ่มเสนอกฎใหม่จะเปิดหน้า GitHub ให้คุณเขียนและกดส่งเอง แอปไม่ส่งอะไรแทนคุณ</p>
      {message && <p className="mt-2 break-words text-[13px] font-medium text-fg">{message}</p>}
    </div>
  );
}
