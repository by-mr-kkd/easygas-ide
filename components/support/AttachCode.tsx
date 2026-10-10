"use client";

import { useEffect, useId, useState } from "react";
import { CodeBracketIcon } from "@heroicons/react/24/outline";
import { attachPreviewAction } from "@/app/settings/support-actions";

export type ProjectOption = { id: string; name: string };

type Preview = { state: "idle" } | { state: "loading" } | { state: "ok"; files: number; kb: number; redacted: number } | { state: "error"; error: string };

/**
 * "แนบโค้ดโปรเจกต์" for a Fast Track question or reply: a checkbox, the project to attach (unless `fixed`
 * to the one open in the editor) and what will travel — files, size, keys masked — before anything is sent.
 * `projectId` null = no code attached.
 */
export function AttachCode({
  projects,
  projectId,
  onChange,
  fixed = false,
}: {
  projects: ProjectOption[];
  projectId: string | null;
  onChange: (id: string | null) => void;
  fixed?: boolean;
}) {
  const uid = useId();
  const [last, setLast] = useState<string | null>(projectId ?? projects[0]?.id ?? null);
  const [preview, setPreview] = useState<Preview>({ state: "idle" });

  useEffect(() => {
    if (!projectId) return setPreview({ state: "idle" });
    let alive = true;
    setPreview({ state: "loading" });
    attachPreviewAction(projectId)
      .then((r) => alive && setPreview(r.ok ? { state: "ok", files: r.files, kb: r.kb, redacted: r.redacted } : { state: "error", error: r.error }))
      .catch(() => alive && setPreview({ state: "error", error: "อ่านโค้ดของโปรเจกต์ไม่สำเร็จ" }));
    return () => {
      alive = false;
    };
  }, [projectId]);

  if (projects.length === 0) return null;
  const fixedName = projects.find((p) => p.id === last)?.name;

  return (
    <div className="space-y-1.5">
      <label className="flex items-start gap-2 text-sm">
        <input type="checkbox" checked={projectId !== null} onChange={(e) => onChange(e.target.checked ? last : null)} className="mt-1" />
        <span>
          <span className="inline-flex items-center gap-1 font-medium">
            <CodeBracketIcon className="h-4 w-4 text-info" aria-hidden />
            แนบโค้ดโปรเจกต์
          </span>{" "}
          {fixed && fixedName ? <span className="hint">“{fixedName}”</span> : <span className="hint">ให้แอดมินเห็นโค้ดจริง ตอบได้ตรงจุด</span>}
        </span>
      </label>
      {projectId !== null && (
        <div className="space-y-1 pl-6">
          {!fixed && (
            <select
              id={`${uid}-project`}
              aria-label="โปรเจกต์ที่จะแนบโค้ด"
              value={projectId}
              onChange={(e) => {
                setLast(e.target.value);
                onChange(e.target.value);
              }}
              className="field h-9 w-full text-[13px] sm:max-w-sm"
            >
              {projects.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.name}
                </option>
              ))}
            </select>
          )}
          <p className={`text-[12.5px] ${preview.state === "error" ? "text-danger" : "text-muted"}`} aria-live="polite">
            {preview.state === "loading" && "กำลังอ่านโค้ด…"}
            {preview.state === "error" && preview.error}
            {preview.state === "ok" && (
              <>
                จะแนบ {preview.files} ไฟล์ · {preview.kb} KB · เห็นแค่คุณกับแอดมิน
                {preview.redacted > 0 && <b className="text-warn-text"> · ซ่อนคีย์/รหัสในโค้ดให้แล้ว {preview.redacted} จุด</b>}
              </>
            )}
          </p>
        </div>
      )}
    </div>
  );
}
