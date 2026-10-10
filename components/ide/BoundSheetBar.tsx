"use client";

import { ArrowPathIcon, ArrowTopRightOnSquareIcon, CodeBracketIcon, TableCellsIcon } from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";

/**
 * The green band of a published Sheet-bound project (kind "bound"): its script lives inside a Google Sheet,
 * so instead of a /exec link this opens the Sheet (where the menus and sidebars run) or the script, and
 * "เผยแพร่ใหม่" pushes the latest code into the same script (through the publish button's confirm).
 */
export function BoundSheetBar({ sheetUrl, scriptId }: { sheetUrl: string; scriptId: string | null }) {
  const requestAction = useProjectStore((s) => s.requestAction);
  return (
    <div className="flex flex-none items-center gap-1 border-b border-accent/25 bg-accent-soft px-2 py-1 sm:gap-1.5 sm:px-3 [@media(max-height:520px)]:hidden">
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        <TableCellsIcon className="h-4 w-4 shrink-0 text-accent-text" aria-hidden />
        <span className="truncate text-[13px] font-semibold text-accent-text">อยู่ใน Google Sheet แล้ว</span>
        <span className="hidden truncate text-[12.5px] text-muted md:inline">เปิดชีตเพื่อใช้เมนูและปุ่มของระบบ</span>
      </div>
      <button
        type="button"
        onClick={() => requestAction("deploy")}
        title="ส่งโค้ดล่าสุดเข้าไปในสคริปต์ของชีตเดิม"
        className="btn btn-ghost btn-sm max-sm:btn-icon"
      >
        <ArrowPathIcon className="h-4 w-4" />
        <span className="hidden sm:inline">เผยแพร่ใหม่</span>
      </button>
      {scriptId && (
        <a
          href={`https://script.google.com/d/${scriptId}/edit`}
          target="_blank"
          rel="noopener noreferrer"
          title="เปิดสคริปต์ใน Apps Script"
          className="btn btn-ghost btn-sm max-sm:btn-icon"
        >
          <CodeBracketIcon className="h-4 w-4" />
          <span className="hidden sm:inline">เปิดสคริปต์</span>
        </a>
      )}
      <a href={sheetUrl} target="_blank" rel="noopener noreferrer" className="btn btn-secondary btn-sm shrink-0">
        เปิดชีต
        <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      </a>
    </div>
  );
}
