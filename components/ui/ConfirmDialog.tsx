"use client";

import { useEffect } from "react";
import { createPortal } from "react-dom";
import { ExclamationTriangleIcon } from "@heroicons/react/24/outline";

/**
 * Lightweight confirm modal (portal + backdrop + Esc-to-cancel). Controlled via `open`.
 * Used to gate side-effectful actions like deploy. Keep copy short; pass `tone` for accent color.
 */
export function ConfirmDialog({
  open,
  title,
  body,
  confirmLabel = "ยืนยัน",
  cancelLabel = "ยกเลิก",
  tone = "emerald",
  busy = false,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  title: string;
  body?: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: "emerald" | "amber";
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) onCancel();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy, onCancel]);

  if (!open) return null;

  return createPortal(
    <div className="dialog-backdrop" onClick={() => !busy && onCancel()}>
      <div role="dialog" aria-modal="true" aria-label={title} className="dialog max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span
            className={`mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full ${
              tone === "amber" ? "bg-warn-soft text-warn-text" : "bg-accent-soft text-accent-text"
            }`}
          >
            <ExclamationTriangleIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="text-[15px] font-semibold text-fg">{title}</h3>
            {body && (
              <div className="hint mt-1.5">
                {body}
              </div>
            )}
          </div>
        </div>
        <div className="mt-5 flex justify-end gap-2">
          <button
            onClick={onCancel}
            disabled={busy}
            className="btn btn-secondary"
          >
            {cancelLabel}
          </button>
          <button
            onClick={onConfirm}
            disabled={busy}
            className="btn btn-primary"
          >
            {busy ? "กำลังทำงาน…" : confirmLabel}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
