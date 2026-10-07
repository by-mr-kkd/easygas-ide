"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import { deleteProjectAction } from "@/app/projects/actions";
import type { EgsProject } from "@/types/db";

/**
 * "Delete this project?" — only the local copy goes; whatever is already in the user's Google account
 * stays, and the text says so. Portalled to body so no list or grid can clip it.
 */
export function DeleteProjectDialog({ project, onClose }: { project: EgsProject; onClose: () => void }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const isBound = project.kind === "bound";
  const titleId = `delete-title-${project.id}`;

  useEffect(() => {
    if (busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [busy, onClose]);

  async function remove() {
    setBusy(true);
    setFailed(false);
    try {
      await deleteProjectAction(project.id);
      router.refresh();
      onClose();
    } catch {
      setBusy(false);
      setFailed(true);
    }
  }

  return createPortal(
    <div className="dialog-backdrop" onClick={() => !busy && onClose()}>
      <div role="dialog" aria-modal="true" aria-labelledby={titleId} className="dialog max-w-sm p-5" onClick={(e) => e.stopPropagation()}>
        <h3 id={titleId} className="text-base font-semibold">
          ลบโปรเจกต์นี้?
        </h3>
        <p className="mt-1 line-clamp-2 break-words text-sm text-muted">&ldquo;{project.name}&rdquo;</p>
        <p className="callout mt-3 block">
          {project.script_id && !isBound ? (
            <>
              ลบโปรเจกต์ออกจากแอปเท่านั้น สคริปต์และเว็บแอปใน <b>บัญชี Google</b> ของคุณ<b>ยังอยู่และใช้งานได้</b> ถ้าต้องการลบด้วย
              ไปลบเองที่{" "}
              <a href={`https://script.google.com/d/${project.script_id}/edit`} target="_blank" rel="noreferrer" className="link">
                script.google.com
              </a>
            </>
          ) : isBound ? (
            <>
              ลบโปรเจกต์ออกจากแอปเท่านั้น สคริปต์ที่ผูกกับ <b>Google Sheet</b> ของคุณ<b>ไม่ถูกลบ</b>
            </>
          ) : (
            <>ยังไม่ได้สร้างสคริปต์ใน Google จึงลบเฉพาะในแอป</>
          )}
        </p>
        {failed && (
          <p role="alert" className="callout callout-danger mt-2">
            ลบไม่สำเร็จ ลองอีกครั้ง
          </p>
        )}
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" autoFocus onClick={onClose} disabled={busy} className="btn btn-secondary">
            ยกเลิก
          </button>
          <button type="button" onClick={remove} disabled={busy} className="btn btn-danger">
            {busy ? "กำลังลบ…" : "ลบเลย"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
