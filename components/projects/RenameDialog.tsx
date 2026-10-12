"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { renameProjectAction } from "@/app/projects/actions";

/**
 * "เปลี่ยนชื่อ" — the home list's ⋯ menu and the code screen's project switcher. Changes the name in this app
 * only (renameProjectAction); the script's title on Google stays as it is.
 */
export function RenameDialog({ project, onClose, onRenamed }: { project: { id: string; name: string }; onClose: () => void; onRenamed?: (name: string) => void }) {
  const router = useRouter();
  const [name, setName] = useState(project.name);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.select();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending]);

  async function save() {
    setPending(true);
    setError(null);
    const r = await renameProjectAction(project.id, name).catch(() => ({ ok: false as const, error: "บันทึกไม่สำเร็จ ลองอีกครั้ง" }));
    if (!r.ok) {
      setPending(false);
      setError(r.error);
      return;
    }
    onRenamed?.(r.name);
    router.refresh();
    onClose();
  }

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={() => !pending && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="rename-title"
        className="dialog max-w-md p-5"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void save();
        }}
      >
        <h2 id="rename-title" className="text-base font-semibold">
          เปลี่ยนชื่อโปรเจกต์
        </h2>
        <label htmlFor="rename-input" className="sr-only">
          ชื่อใหม่
        </label>
        <input id="rename-input" ref={inputRef} value={name} maxLength={80} onChange={(e) => setName(e.target.value)} className="field mt-3 h-10 w-full" disabled={pending} />
        <p className="hint mt-1.5 text-xs">เปลี่ยนเฉพาะชื่อในแอป ชื่อสคริปต์บน Google คงเดิม</p>
        {error && (
          <p role="alert" className="callout callout-danger mt-2">
            {error}
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="btn btn-secondary">
            ยกเลิก
          </button>
          <button type="submit" disabled={pending || !name.trim() || name.trim() === project.name} className="btn btn-primary">
            {pending ? "กำลังบันทึก…" : "บันทึก"}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
}
