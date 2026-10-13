"use client";

import { useState } from "react";
import { CodeBracketSquareIcon, GlobeAltIcon } from "@heroicons/react/24/outline";

export type Hosting = "gas" | "github";

/**
 * First publish of a web-app project whose front page has no home yet: Google's own page or GitHub Pages?
 * Google's page is one click but carries Google's banner ("แอปพลิเคชันนี้สร้างโดยผู้ใช้…"); GitHub Pages has
 * no banner and the camera works, at the cost of connecting GitHub once. The answer is kept on the project
 * (hosting), so the question is asked once; both dialogs offer the way back.
 *
 * Free (`pro` false): the same two cards, GitHub Pages greyed with its PRO badge, what it would add, and
 * "ดู Pro" (`onUpgrade`); Google is the one picked.
 */
export function HostingChoiceDialog({
  githubConnected,
  onPick,
  onClose,
  pro = true,
  onUpgrade,
}: {
  githubConnected: boolean;
  onPick: (h: Hosting) => void;
  onClose: () => void;
  pro?: boolean;
  onUpgrade?: () => void;
}) {
  const [picked, setPicked] = useState<Hosting>(pro ? "github" : "gas");
  const Card = ({ value, Icon, title, lines, tag, disabled = false, extra }: { value: Hosting; Icon: typeof GlobeAltIcon; title: string; lines: string[]; tag?: string; disabled?: boolean; extra?: React.ReactNode }) => (
    <label
      aria-disabled={disabled || undefined}
      className={`flex items-start gap-3 rounded-xl border p-3.5 text-left ${disabled ? "cursor-not-allowed border-line opacity-70" : `row-btn cursor-pointer ${picked === value ? "border-accent bg-accent-soft/40" : "border-line"}`}`}
    >
      <input type="radio" name="hosting" value={value} checked={picked === value} disabled={disabled} onChange={() => setPicked(value)} className="sr-only" />
      <span className={`icon-chip mt-0.5 shrink-0 ${value === "github" ? "tone-accent" : "tone-info"}`}>
        <Icon className="h-4 w-4" />
      </span>
      <span className="min-w-0">
        <span className="flex flex-wrap items-center gap-2 text-sm font-semibold">
          {title}
          {tag && <span className="pro-badge">{tag}</span>}
        </span>
        {lines.map((l) => (
          <span key={l} className="hint block">
            {l}
          </span>
        ))}
        {extra}
      </span>
    </label>
  );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold">หน้าเว็บของแอปนี้จะอยู่ที่ไหน</h3>
      <p className="hint">เลือกครั้งเดียวต่อโปรเจกต์ เปลี่ยนทีหลังได้จากหน้าต่างเผยแพร่ ระบบหลังบ้าน (โค้ด .gs ชีต Drive) อยู่ในบัญชี Google ของคุณทั้งสองแบบ</p>
      {pro ? (
        <Card
          value="github"
          Icon={CodeBracketSquareIcon}
          title="GitHub Pages ของคุณ"
          tag="PRO"
          lines={[
            "ไม่มีแถบของ Google ด้านบนว่า “แอปพลิเคชันนี้สร้างโดยผู้ใช้” หน้าตาเหมือนเว็บของคุณเอง",
            "ใช้กล้องได้ ถ้าวันหน้าอยากเพิ่มสแกน QR หรือถ่ายรูป",
            githubConnected ? "เชื่อม GitHub ไว้แล้ว กดเผยแพร่ได้เลย โปรแกรม push ให้ทุกครั้ง" : "ต้องเชื่อมบัญชี GitHub ครั้งเดียว (ประมาณ 2 นาที) จากนั้นโปรแกรม push ให้ทุกครั้ง",
            "โค้ดหน้าเว็บจะเป็นสาธารณะใน repo ของคุณ",
          ]}
        />
      ) : (
        <Card
          value="github"
          Icon={CodeBracketSquareIcon}
          title="GitHub Pages ของคุณ"
          tag="PRO"
          disabled
          lines={["ไม่มีแถบเตือนของ Google · ติดตั้งเป็นแอปบนมือถือ · ใช้กล้อง/สแกน QR · แจ้งเตือนในแอป"]}
          extra={
            onUpgrade && (
              <button type="button" onClick={onUpgrade} className="btn btn-secondary btn-sm mt-2">
                ดู Pro
              </button>
            )
          }
        />
      )}
      <Card
        value="gas"
        Icon={GlobeAltIcon}
        title="หน้าเว็บของ Google (script.google.com)"
        lines={["กดเดียวเสร็จ ไม่ต้องตั้งค่าอะไรเพิ่ม", "มีแถบของ Google ด้านบนหน้าแอป และใช้กล้องไม่ได้"]}
      />
      <div className="mt-1 flex justify-end gap-2">
        <button type="button" onClick={onClose} className="btn btn-secondary">
          ยกเลิก
        </button>
        <button type="button" onClick={() => onPick(picked)} className="btn btn-primary">
          ใช้แบบนี้
        </button>
      </div>
    </div>
  );
}
