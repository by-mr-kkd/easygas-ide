"use client";

import { useState } from "react";
import { FolderOpenIcon } from "@heroicons/react/24/outline";
import { openDataFolderAction } from "@/app/settings/actions";

/** The data folder's path, with a button that opens it in File Explorer. */
export function DataFolder({ path }: { path: string }) {
  const [error, setError] = useState("");

  async function open() {
    setError("");
    const r = await openDataFolderAction().catch(() => null);
    if (!r?.ok) setError(r?.error ?? "เปิดโฟลเดอร์ไม่สำเร็จ");
  }

  return (
    <div>
      <div className="card flex items-center gap-2 py-1.5 pl-4 pr-1.5">
        <p className="min-w-0 flex-1 break-all font-mono text-[13px] text-fg">{path}</p>
        <button type="button" onClick={open} title="เปิดโฟลเดอร์นี้" aria-label="เปิดโฟลเดอร์นี้" className="btn btn-ghost btn-sm btn-icon shrink-0">
          <FolderOpenIcon className="h-4 w-4 text-muted" />
        </button>
      </div>
      <p className="hint mt-2">โปรเจกต์ทั้งหมดและการตั้งค่าของคุณเก็บอยู่ในโฟลเดอร์นี้</p>
      {error && (
        <p role="alert" className="mt-1 text-[12.5px] text-danger">
          {error}
        </p>
      )}
    </div>
  );
}
