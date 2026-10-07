"use client";

import { useId, useState, useTransition } from "react";
import { ClipboardDocumentIcon, EyeIcon, EyeSlashIcon } from "@heroicons/react/24/outline";
import { revealPremiumKeyAction } from "@/app/premium/actions";

/**
 * The licence key on this install, masked. The full key reaches the browser only when the user presses
 * "แสดงรหัส" or "คัดลอกรหัส" (one server action call each time), never through props.
 */
export function KeyBox({ keyMask }: { keyMask?: string }) {
  const [shown, setShown] = useState<string | null>(null);
  const [note, setNote] = useState<{ text: string; error: boolean } | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const keyId = `premium-keybox-${id}`;

  function reveal() {
    if (shown) {
      setShown(null);
      setNote(null);
      return;
    }
    setNote(null);
    start(async () => {
      const r = await revealPremiumKeyAction();
      if (!r.ok) {
        setNote({ text: r.error, error: true });
        return;
      }
      setShown(r.data.key);
    });
  }

  function copy() {
    setNote(null);
    start(async () => {
      const r = await revealPremiumKeyAction();
      if (!r.ok) {
        setNote({ text: r.error, error: true });
        return;
      }
      try {
        await navigator.clipboard.writeText(r.data.key);
        setNote({ text: "คัดลอกรหัสแล้ว", error: false });
      } catch {
        // clipboard refused: show the key so it can be selected by hand
        setShown(r.data.key);
        setNote({ text: "คัดลอกอัตโนมัติไม่ได้ เลือกรหัสด้านบนแล้วคัดลอกเอง", error: true });
      }
    });
  }

  return (
    <div>
      <p className="label">รหัส Pro ของคุณ</p>
      <p
        id={keyId}
        className={`mt-1 rounded-lg border border-line bg-sunken px-3 py-2 font-mono text-[13px] text-fg ${shown ? "select-all break-all" : ""}`}
      >
        {shown ?? keyMask ?? "…"}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <button type="button" onClick={reveal} disabled={pending} aria-controls={keyId} className="btn btn-secondary btn-sm">
          {shown ? <EyeSlashIcon className="h-4 w-4" aria-hidden="true" /> : <EyeIcon className="h-4 w-4" aria-hidden="true" />}
          {shown ? "ซ่อนรหัส" : "แสดงรหัส"}
        </button>
        <button type="button" onClick={copy} disabled={pending} className="btn btn-secondary btn-sm">
          <ClipboardDocumentIcon className="h-4 w-4" aria-hidden="true" />
          คัดลอกรหัส
        </button>
      </div>
      {note ? (
        <p role={note.error ? "alert" : "status"} className={`mt-1.5 text-sm ${note.error ? "text-danger" : "text-fg"}`}>
          {note.text}
        </p>
      ) : (
        <p className="hint mt-1.5">เก็บรหัสนี้ไว้ ใช้เปิด Pro บนเครื่องใหม่ได้</p>
      )}
    </div>
  );
}
