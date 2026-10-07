"use client";

import { useEffect, useId, useRef } from "react";
import { ArrowPathIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { StyleItem } from "@/lib/style-catalog";

export interface SelectionGroup {
  id: string;
  title: string;
  items: StyleItem[];
}

/**
 * What the user picked + the prompt built from it + the one primary action. From xl up it is the
 * sticky third column; below xl the SAME element becomes a right-side drawer, shown while `open`
 * (it starts under the 48px top bar so the desktop window buttons stay reachable).
 */
export function SelectionPanel({
  open,
  onClose,
  groups,
  count,
  onRemove,
  purpose,
  onPurposeChange,
  prompt,
  onPromptChange,
  promptEdited,
  onPromptReset,
  targetName,
  pending,
  error,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  groups: SelectionGroup[];
  count: number;
  onRemove: (id: string) => void;
  purpose: string;
  onPurposeChange: (value: string) => void;
  prompt: string;
  onPromptChange: (value: string) => void;
  promptEdited: boolean;
  onPromptReset: () => void;
  targetName?: string; // set when the styles go into an existing project instead of a new one
  pending: boolean;
  error: string | null;
  onSubmit: () => void;
}) {
  const uid = useId();
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) closeRef.current?.focus();
  }, [open]);

  const submitLabel = targetName ? "ใช้สไตล์นี้กับโปรเจกต์" : "สร้างโปรเจกต์ด้วยสไตล์นี้";
  const pendingLabel = targetName ? "กำลังเปิดโปรเจกต์…" : "กำลังสร้าง…";

  return (
    <aside
      role={open ? "dialog" : undefined}
      aria-modal={open ? true : undefined}
      aria-labelledby={`${uid}-title`}
      className={`card min-w-0 flex-col gap-4 overflow-y-auto overscroll-contain p-4 max-xl:fixed max-xl:bottom-0 max-xl:right-0 max-xl:top-12 max-xl:z-50 max-xl:w-full max-xl:max-w-[420px] max-xl:rounded-none max-xl:border-y-0 max-xl:border-r-0 max-xl:shadow-pop xl:sticky xl:top-4 xl:max-h-[calc(100vh-5.5rem)] xl:self-start ${
        open ? "flex" : "hidden xl:flex"
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <h2 id={`${uid}-title`} className="text-[15px] font-semibold">
          ที่เลือกไว้ ({count})
        </h2>
        <button
          ref={closeRef}
          type="button"
          onClick={onClose}
          aria-label="ปิด"
          className="btn btn-ghost btn-sm btn-icon xl:hidden"
        >
          <XMarkIcon className="h-4 w-4" />
        </button>
      </div>

      {groups.length === 0 ? (
        <p className="hint">ยังไม่ได้เลือก กดเลือกจากการ์ดทางซ้าย</p>
      ) : (
        <div className="flex flex-col gap-3">
          {groups.map((g) => (
            <div key={g.id}>
              <div className="text-xs font-semibold text-faint">{g.title}</div>
              <ul className="mt-0.5">
                {g.items.map((item) => (
                  <li key={item.id} className="flex items-center gap-2">
                    <span className="min-w-0 flex-1 truncate">{item.title}</span>
                    <button
                      type="button"
                      onClick={() => onRemove(item.id)}
                      aria-label={`เอา “${item.title}” ออก`}
                      className="btn btn-ghost btn-sm btn-icon shrink-0"
                    >
                      <XMarkIcon className="h-4 w-4" />
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>
      )}

      <div>
        <label htmlFor={`${uid}-purpose`} className="label">
          อยากได้ระบบอะไร?
        </label>
        <input
          id={`${uid}-purpose`}
          name="purpose"
          value={purpose}
          onChange={(e) => onPurposeChange(e.target.value)}
          placeholder="เช่น ระบบจองคิวร้านตัดผม"
          className="field mt-1.5"
        />
      </div>

      <div>
        <div className="flex min-h-[1.875rem] items-center justify-between gap-2">
          <label htmlFor={`${uid}-prompt`} className="label">
            คำสั่งที่จะส่งให้ AI (แก้ได้)
          </label>
          {promptEdited && (
            <button type="button" onClick={onPromptReset} className="btn btn-ghost btn-sm shrink-0">
              <ArrowPathIcon className="h-4 w-4" />
              สร้างใหม่จากที่เลือก
            </button>
          )}
        </div>
        <textarea
          id={`${uid}-prompt`}
          name="prompt"
          value={prompt}
          onChange={(e) => onPromptChange(e.target.value)}
          rows={7}
          className="field mt-1.5 block resize-y"
        />
      </div>

      <div className="flex flex-col gap-2">
        {targetName && <p className="hint break-words">จะส่งคำสั่งนี้เข้าโปรเจกต์ “{targetName}”</p>}
        <button
          type="button"
          onClick={onSubmit}
          disabled={!prompt.trim() || pending}
          className="btn btn-primary btn-lg w-full"
        >
          {pending ? pendingLabel : submitLabel}
        </button>
        {error && (
          <div role="alert" className="callout callout-danger">
            {error}
          </div>
        )}
      </div>
    </aside>
  );
}
