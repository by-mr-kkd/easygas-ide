"use client";

import { useState } from "react";
import { AcademicCapIcon, BookOpenIcon, CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { KnownRule } from "@/lib/lessons-rulebook";
import { approveLessonAction, switchLessonAction } from "@/app/settings/actions";

export interface LessonOffer {
  id: string;
  rule: string;
  symptom: string;
  card: string;
  hits: number;
  /** the proposal closely restates this rulebook rule (the user decides) */
  like?: KnownRule;
  /** not a proposal: the AI said it missed this rulebook rule — nothing is stored */
  known?: KnownRule;
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
      {offers.map((o) =>
        o.known ? (
          // the rule already exists and reaches the AI: nothing to keep, only worth knowing
          <section key={o.id} aria-label="AI พลาดกฎที่มีอยู่แล้ว" className="overflow-hidden rounded-xl border border-line border-l-4 border-l-warn-line bg-surface shadow-sm">
            <div className="flex items-center gap-1.5 bg-warn-soft px-3.5 py-2 text-xs font-semibold text-warn-text">
              <BookOpenIcon className="h-4 w-4" />
              AI พลาดกฎที่มีอยู่ในคู่มือแล้ว
            </div>
            <div className="px-3.5 py-3">
              <p className="text-xs text-muted">
                {o.known.cardTitle} · ข้อ {o.known.n}
              </p>
              <blockquote className="mt-1 rounded-lg border border-line bg-sunken px-3 py-2 text-sm leading-relaxed text-fg">{o.known.text}</blockquote>
              {o.symptom && <p className="hint mt-1.5 text-xs">ที่มา: {o.symptom}</p>}
              <div className="mt-2.5 flex flex-wrap items-center gap-2">
                <button onClick={() => onResolved(o.id)} className="btn btn-secondary btn-sm">
                  <CheckIcon className="h-4 w-4" />
                  รับทราบ
                </button>
                <span className="hint text-xs">กฎนี้ส่งให้ AI อยู่แล้ว ไม่ต้องเก็บเป็นบทเรียนซ้ำ</span>
              </div>
            </div>
          </section>
        ) : (
        // set apart from the chat's own text: violet (it came from the AI), a header strip, and the
        // proposed rule in its own box — it is a decision to make, not part of the answer
        <section
          key={o.id}
          aria-label="ข้อเสนอบทเรียนจาก AI"
          className="overflow-hidden rounded-xl border border-line border-l-4 border-l-ai bg-surface shadow-sm"
        >
          <div className="flex flex-wrap items-center gap-1.5 bg-ai-soft px-3.5 py-2 text-xs font-semibold text-ai">
            <AcademicCapIcon className="h-4 w-4" />
            ข้อเสนอจาก AI: จำข้อนี้ไว้ใช้กับโปรเจกต์ต่อ ๆ ไป
            {o.hits > 1 && <span className="font-normal">· เจอมาแล้ว {o.hits} ครั้ง</span>}
            <span className="ml-auto rounded-full bg-surface px-2 py-0.5 font-normal text-muted">ยังไม่ใช้งาน</span>
          </div>
          <div className="px-3.5 py-3">
            <blockquote className="rounded-lg border border-line bg-sunken px-3 py-2 text-sm font-medium leading-relaxed text-fg">
              {o.rule}
            </blockquote>
            {o.symptom && <p className="hint mt-1.5 text-xs">ที่มา: {o.symptom}</p>}
            {o.like && (
              <p className="callout callout-warn mt-2 text-xs leading-relaxed">
                คล้ายกฎที่มีในคู่มือแล้ว ({o.like.cardTitle} ข้อ {o.like.n}): {o.like.text} — ถ้าเป็นเรื่องเดียวกัน กด &quot;ไม่ต้อง&quot; ได้ เพราะกฎนี้ส่งให้ AI อยู่แล้ว
              </p>
            )}
            <div className="mt-2.5 flex flex-wrap items-center gap-2">
              <button onClick={() => decide(o.id, true)} disabled={busy !== null} className="btn btn-soft tone-ai btn-sm">
                <CheckIcon className="h-4 w-4" />
                เก็บไว้
              </button>
              <button onClick={() => decide(o.id, false)} disabled={busy !== null} className="btn btn-ghost btn-sm">
                <XMarkIcon className="h-4 w-4" />
                ไม่ต้อง
              </button>
              <span className="hint text-xs">แก้หรือลบทีหลังได้ที่ ตั้งค่า → บทเรียนของฉัน</span>
            </div>
          </div>
        </section>
        ),
      )}
      {error && <p className="callout callout-danger">{error}</p>}
    </div>
  );
}
