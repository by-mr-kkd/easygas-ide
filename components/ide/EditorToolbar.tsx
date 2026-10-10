"use client";

import { useEffect, useState } from "react";
import { BeakerIcon, CheckCircleIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import { saveDirtyFiles } from "@/lib/client/save-files";
import { Tooltip } from "@/components/ui/Tooltip";
import { VersionHistory } from "./VersionHistory";

/**
 * Toolbar above the editor: autosave status + the three quality gates within reach —
 * ประวัติ (versions), ทดสอบรันจริง (Gate 2 run-and-repair, routed to the chat flow), and
 * ให้ AI ตรวจซ้ำ (Gate 0 lint + Gate 1 rulebook critic → markers/badges/issues panel).
 */
/** `canVerify` = false for a Sheet-bound project: "ทดสอบรันจริง" opens the script as a web app, which it is not */
export function EditorToolbar({ projectId, canVerify = true }: { projectId: string; canVerify?: boolean }) {
  const files = useProjectStore((s) => s.files);
  const order = useProjectStore((s) => s.order);
  const setIssues = useProjectStore((s) => s.setIssues);
  const runAgent = useProjectStore((s) => s.runAgent);
  const addEnergy = useProjectStore((s) => s.addEnergy);
  const actionRequest = useProjectStore((s) => s.actionRequest);
  const clearActionRequest = useProjectStore((s) => s.clearActionRequest);
  const [checking, setChecking] = useState(false);
  const [saving, setSaving] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const hasFiles = order.length > 0;
  const dirty = order.some((p) => files[p]?.dirty);

  // command palette → "ให้ AI ตรวจซ้ำ"
  useEffect(() => {
    if (actionRequest !== "recheck" || checking) return;
    clearActionRequest();
    recheck();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRequest]);

  // warn before leaving the page while manual edits are unsaved (saving is manual now)
  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", onBeforeUnload);
    return () => window.removeEventListener("beforeunload", onBeforeUnload);
  }, [dirty]);

  async function save() {
    if (saving || !dirty) return;
    setSaving(true);
    try {
      await saveDirtyFiles(projectId);
    } finally {
      setSaving(false);
    }
  }

  async function recheck() {
    if (checking || !hasFiles) return;
    setChecking(true);
    setNote(null);
    try {
      // flush pending edits first so the gates review (and we persist) the latest code
      await saveDirtyFiles(projectId);

      // reviewed by the AI picked in the chat box (the user's own plan or key — it spends a request)
      const res = await fetch(`/api/recheck/${projectId}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ai: useProjectStore.getState().aiChoice ?? undefined }),
      });
      const data = await res.json();
      if (!res.ok) {
        setIssues([]);
        setNote(
          data?.message ??
            (res.status === 429 ? "ตรวจถี่เกินไป รอสักครู่" : "ตรวจไม่สำเร็จ ลองอีกครั้ง"),
        );
        return;
      }
      const list = data.issues ?? [];
      setIssues(list);
      addEnergy(data.tokens ?? 0); // the re-check (critic) spends energy too — deduct from the bar
      if (data.criticError) {
        setNote(
          list.length
            ? "AI ตรวจไม่สำเร็จ แสดงเฉพาะผลตรวจโครงสร้าง"
            : "ตรวจไม่สำเร็จ ลองอีกครั้ง",
        );
      } else {
        setNote(list.length === 0 ? "ตรวจแล้ว ไม่พบจุดที่ต้องแก้" : null);
      }
    } catch {
      setNote("ตรวจไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setChecking(false);
    }
  }

  if (!hasFiles) return null;

  return (
    <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-line px-2 py-1.5">
      {/* a real button only while there is something to save; otherwise a plain status line */}
      {dirty || saving ? (
        <button onClick={save} disabled={saving} className="btn btn-warn btn-sm">
          {saving ? (
            <>
              <span className="h-3 w-3 animate-spin rounded-full border-2 border-current border-t-transparent" />
              กำลังบันทึก…
            </>
          ) : (
            "บันทึกการแก้ไข"
          )}
        </button>
      ) : (
        <span className="flex items-center gap-1 px-1 text-xs text-faint">
          <CheckCircleIcon className="h-4 w-4" /> บันทึกแล้ว
        </span>
      )}
      <span className="min-w-0 flex-1" />
      {note && <span className="truncate text-xs text-muted">{note}</span>}

      <VersionHistory projectId={projectId} />
      {canVerify && (
      <Tooltip
        label="เปิดแอปจริงเพื่อทดสอบการรัน แล้วซ่อมให้ถ้าเจอปัญหา (ต้องเผยแพร่ก่อน)"
        placement="bottom"
        className="shrink-0"
      >
        <button
          onClick={() => runAgent("verify")}
          className="btn btn-ghost btn-sm shrink-0"
        >
          <BeakerIcon className="h-4 w-4 text-info" />
          ทดสอบรันจริง
        </button>
      </Tooltip>
      )}
      <button
        onClick={recheck}
        disabled={checking}
        className="btn btn-soft tone-ai btn-sm shrink-0"
      >
        <ShieldCheckIcon className={`h-4 w-4 ${checking ? "animate-pulse" : ""}`} />
        {checking ? "กำลังตรวจ…" : "ให้ AI ตรวจซ้ำ"}
      </button>
    </div>
  );
}
