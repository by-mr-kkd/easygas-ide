"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, BoltIcon, ChatBubbleLeftRightIcon } from "@heroicons/react/24/outline";
import type { ProjectOption } from "@/components/support/AttachCode";
import { FastTrackForm } from "@/components/support/FastTrackForm";
import { FastTrackInbox } from "@/components/support/FastTrackInbox";

const BOARD = "https://easygaside.tech/board";

/**
 * Settings → ช่วยเหลือ. Pro: Fast Track — ask the owner directly from here, optionally with a project's code;
 * the question becomes a private thread only you and the owner see, read and answered here too, and the app
 * tells you when it is answered. Free: the public webboard.
 */
export function SupportSection({ pro, machineInfo, projects }: { pro: boolean; machineInfo: string; projects: ProjectOption[] }) {
  const [sent, setSent] = useState(0);
  const [openId, setOpenId] = useState<string | null>(null);

  if (!pro) {
    return (
      <div className="space-y-4">
        <div className="card p-5">
          <p className="flex items-center gap-2 font-semibold">
            <ChatBubbleLeftRightIcon className="h-5 w-5 text-info" />
            เว็บบอร์ดถามตอบ (ฟรี)
          </p>
          <p className="hint mt-1">ติดตรงไหน ตั้งกระทู้ถามได้เลย ไม่ต้องสมัครสมาชิก มีคนในชุมชนและแอดมินช่วยตอบ</p>
          <a href={BOARD} target="_blank" rel="noopener noreferrer" className="btn btn-primary btn-sm mt-3">
            เปิดเว็บบอร์ด <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        </div>
        <div className="card border-dashed p-5">
          <p className="flex items-center gap-2 font-semibold">
            <BoltIcon className="h-5 w-5 text-warn-text" />
            Fast Track สำหรับ Pro
          </p>
          <p className="hint mt-1">ส่งคำถามตรงถึงแอดมินจากหน้านี้ ตอบก่อนกระทู้ทั่วไป เห็นแค่คุณกับแอดมิน และโปรแกรมเด้งบอกเมื่อมีคำตอบ</p>
          <Link href="/settings?s=premium" className="btn btn-secondary btn-sm mt-3">
            ดู Pro
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <div className="card p-5">
        <FastTrackForm
          machineInfo={machineInfo}
          projects={projects}
          onSent={(t) => {
            setOpenId(t.id);
            setSent((n) => n + 1);
          }}
        />
      </div>

      <div className="card overflow-hidden">
        <FastTrackInbox key={sent} projects={projects} refresh={sent} openId={openId} />
      </div>

      <p className="hint">
        คำถามทั่วไปที่คนอื่นอ่านแล้วได้ประโยชน์ ตั้งใน{" "}
        <a href={BOARD} target="_blank" rel="noopener noreferrer" className="link">
          เว็บบอร์ด
        </a>{" "}
        ก็ได้
      </p>
    </div>
  );
}
