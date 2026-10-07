"use client";

import { useState } from "react";
import { AcademicCapIcon } from "@heroicons/react/24/outline";
import { approveLessonAction, switchLessonAction } from "@/app/settings/actions";

export interface LessonOffer {
  id: string;
  rule: string;
  symptom: string;
  card: string;
  hits: number;
}

/**
 * Lessons offered at the end of a turn. Nothing here is in use yet: a lesson reaches the AI only after
 * the user presses "เก็บไว้" on the exact text shown. "ไม่ต้อง" keeps a declined record (never sent),
 * so the same proposal is not offered again.
 */
export function LessonOffers({ offers, onResolved }: { offers: LessonOffer[]; onResolved: (id: string) => void }) {
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function decide(id: string, keep: boolean) {
    setBusy(id);
    setError(null);
    try {
      const r = await (keep ? approveLessonAction(id) : switchLessonAction(id, false));
      onResolved(id);
      if (!r.ok) setError("ไม่พบบทเรียนข้อนี้แล้ว (อาจถูกลบไปแล้ว) จึงไม่ได้บันทึก");
    } catch {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  }

  if (offers.length === 0 && !error) return null;
  return (
    <div className="space-y-2">
      {offers.map((o) => (
        <div key={o.id} className="card px-3.5 py-3">
          <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-muted">
            <AcademicCapIcon className="h-4 w-4" />
            AI เสนอให้จำข้อนี้ไว้ใช้กับโปรเจกต์ต่อ ๆ ไป
            {o.hits > 1 && <span className="font-normal">· เจอมาแล้ว {o.hits} ครั้ง</span>}
          </div>
          <p className="mt-1.5 text-sm font-medium leading-relaxed text-fg">{o.rule}</p>
          {o.symptom && <p className="hint mt-0.5">ที่มา: {o.symptom}</p>}
          <div className="mt-2.5 flex flex-wrap items-center gap-2">
            <button onClick={() => decide(o.id, true)} disabled={busy !== null} className="btn btn-secondary btn-sm">
              เก็บไว้
            </button>
            <button onClick={() => decide(o.id, false)} disabled={busy !== null} className="btn btn-ghost btn-sm">
              ไม่ต้อง
            </button>
          </div>
          <p className="hint mt-1.5">ยังไม่มีผลจนกว่าจะกด เก็บไว้ แก้หรือลบทีหลังได้ที่ ตั้งค่า → บทเรียนของฉัน</p>
        </div>
      ))}
      {error && <p className="callout callout-danger">{error}</p>}
    </div>
  );
}
