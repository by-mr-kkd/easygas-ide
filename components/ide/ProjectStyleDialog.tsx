"use client";

import { XMarkIcon } from "@heroicons/react/24/outline";
import { saveProjectPrefsAction } from "@/app/projects/actions";
import { StylePrefsForm } from "@/components/settings/StylePrefsForm";
import type { StylePrefs } from "@/lib/preferences";

/** Look & feel for ONE project: only what differs from the user's defaults (Settings) is stored. */
export function ProjectStyleDialog({
  open,
  projectId,
  value,
  inherited,
  onClose,
  onSaved,
}: {
  open: boolean;
  projectId: string;
  value: Partial<StylePrefs>;
  inherited: StylePrefs;
  onClose: () => void;
  onSaved: (prefs: Partial<StylePrefs>) => void;
}) {
  if (!open) return null;
  return (
    <div className="dialog-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="สไตล์ของโปรเจกต์นี้" className="dialog max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-1 flex items-center gap-2">
          <h3 className="text-[15px] font-semibold">สไตล์ของโปรเจกต์นี้</h3>
          <span className="flex-1" />
          <button onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="hint mb-3">
          ใช้กับโปรเจกต์นี้เท่านั้น ช่องที่เว้นไว้จะใช้ค่าจากหน้า ตั้งค่า มีผลตั้งแต่คำสั่งถัดไป โค้ดที่สร้างไปแล้วจะเปลี่ยนเมื่อสั่ง AI แก้
        </p>
        <StylePrefsForm
          value={value}
          inherited={inherited}
          customLabel="คำสั่งเพิ่มเติมของโปรเจกต์นี้"
          onSave={async (prefs) => {
            const r = await saveProjectPrefsAction(projectId, prefs);
            if (r.ok) onSaved(prefs);
            return r;
          }}
        />
      </div>
    </div>
  );
}
