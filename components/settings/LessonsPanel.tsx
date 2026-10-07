"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, TrashIcon } from "@heroicons/react/24/outline";
import { addLessonAction, approveLessonAction, deleteLessonAction, switchLessonAction } from "@/app/settings/actions";
import { GENERAL_CARD, MAX_RULE_LENGTH, MAX_SYMPTOM_LENGTH, lessonShareText, type Lesson } from "@/lib/lessons";

interface CardOption {
  id: string;
  title: string;
}

const SOURCE_LABEL: Record<Lesson["source"], string> = { ai: "AI เสนอ", lint: "แอปนับจากตัวตรวจโค้ด", user: "เขียนเอง" };
const BTN = "btn btn-secondary btn-sm";

/**
 * The machine's lesson book: proposals waiting for a decision, lessons in use (switch off / delete /
 * share), and a form to write one by hand. Sharing shows the exact text first and only opens a
 * pre-filled GitHub issue (or copies the text) — the app never sends a lesson by itself.
 */
export function LessonsPanel({ lessons, cards, shareBaseUrl }: { lessons: Lesson[]; cards: CardOption[]; shareBaseUrl: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sharing, setSharing] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [rule, setRule] = useState("");
  const [symptom, setSymptom] = useState("");
  const [card, setCard] = useState(GENERAL_CARD);

  const cardTitle = (id: string) => cards.find((c) => c.id === id)?.title ?? "ทั่วไป";
  const pending = lessons.filter((l) => l.status === "pending");
  const kept = lessons.filter((l) => l.status === "active" || l.status === "off");

  async function run(action: () => Promise<{ ok: boolean } | void>) {
    setBusy(true);
    setError(null);
    try {
      const r = await action();
      router.refresh();
      if (r && !r.ok) setError("ไม่พบบทเรียนข้อนี้แล้ว จึงไม่ได้บันทึก");
    } catch {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  async function add() {
    if (rule.trim().length < 8) return setError("เขียนกฎให้เป็นประโยคที่อ่านเข้าใจ อย่างน้อย 8 ตัวอักษร");
    setBusy(true);
    setError(null);
    try {
      const r = await addLessonAction({ rule, symptom, card });
      if (!r.ok) {
        return setError(r.reason === "full" ? "สมุดบทเรียนเต็มแล้ว ลบข้อที่ไม่ใช้ออกก่อน" : "เพิ่มไม่ได้ ตรวจข้อความแล้วลองใหม่");
      }
      setRule("");
      setSymptom("");
      router.refresh();
    } catch {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  function shareLinks(l: Lesson) {
    const { title, body } = lessonShareText(l);
    const url = `${shareBaseUrl}?${new URLSearchParams({ title, body }).toString()}`;
    return { text: `${title}\n\n${body}`, url };
  }

  async function copy(text: string) {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
    } catch {
      setError("คัดลอกไม่สำเร็จ เลือกข้อความแล้วคัดลอกเองได้");
    }
  }

  return (
    <div className="min-w-0 space-y-3">
      {pending.length > 0 && (
        <section className="card min-w-0 px-4 py-4">
          <h2 className="text-sm font-semibold text-fg">รอคุณตัดสิน ({pending.length})</h2>
          <p className="hint mt-0.5">บทเรียนที่ยังไม่กด เก็บไว้ จะไม่ถูกส่งให้ AI · กด ไม่ต้อง แล้วข้อนั้นจะไม่ถูกเสนออีก</p>
          <ul className="mt-2 divide-y divide-line">
            {pending.map((l) => (
              <li key={l.id} className="min-w-0 py-3 last:pb-0">
                <p className="break-words text-sm font-medium text-fg">{l.rule}</p>
                <p className="hint mt-0.5 break-words">
                  {l.id} · {cardTitle(l.card)} · {SOURCE_LABEL[l.source]} · เจอ {l.hits} ครั้ง{l.symptom ? ` · ${l.symptom}` : ""}
                </p>
                <div className="mt-2 flex flex-wrap gap-2">
                  <button type="button" onClick={() => run(() => approveLessonAction(l.id))} disabled={busy} className={`${BTN} font-semibold`}>
                    เก็บไว้
                  </button>
                  <button type="button" onClick={() => run(() => switchLessonAction(l.id, false))} disabled={busy} className={BTN}>
                    ไม่ต้อง
                  </button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}

      <section className="card min-w-0 px-4 py-4">
        <h2 className="text-sm font-semibold text-fg">บทเรียนที่เก็บไว้ ({kept.length})</h2>
        {kept.length === 0 ? (
          <p className="hint mt-1">ยังไม่มี เมื่อ AI พลาดแล้วแก้ได้ มันจะเสนอบทเรียนให้คุณกดเก็บในแชท หรือเขียนเองด้านล่างก็ได้</p>
        ) : (
          <ul className="mt-2 divide-y divide-line">
            {kept.map((l) => {
              const on = l.status === "active";
              const share = sharing === l.id ? shareLinks(l) : null;
              return (
                <li key={l.id} className="min-w-0 py-3 last:pb-0">
                  <p className={`break-words text-sm font-medium ${on ? "text-fg" : "text-muted line-through"}`}>{l.rule}</p>
                  <p className="hint mt-0.5 break-words">
                    {l.id} · {cardTitle(l.card)} · {SOURCE_LABEL[l.source]} · เจอ {l.hits} ครั้ง{l.symptom ? ` · ${l.symptom}` : ""}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-2">
                    <button type="button" onClick={() => run(() => switchLessonAction(l.id, !on))} disabled={busy} className={BTN}>
                      {on ? "ปิดไว้ก่อน" : "เปิดใช้"}
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setSharing(sharing === l.id ? null : l.id);
                        setCopied(false);
                      }}
                      aria-expanded={sharing === l.id}
                      className={BTN}
                    >
                      {sharing === l.id ? "ซ่อน" : "แชร์ให้ชุดกฎกลาง"}
                    </button>
                    <button type="button" onClick={() => run(() => deleteLessonAction(l.id))} disabled={busy} aria-label={`ลบ ${l.id}`} className="btn btn-danger btn-sm">
                      <TrashIcon className="h-4 w-4" />
                      ลบ
                    </button>
                  </div>
                  {share && (
                    <div className="mt-2 min-w-0 rounded-lg border border-line bg-sunken px-3 py-2.5">
                      <p className="hint">ข้อความที่จะส่งมีเท่านี้ อ่านก่อนว่าไม่มีข้อมูลที่ไม่อยากเปิดเผย แก้ได้อีกครั้งในหน้า GitHub</p>
                      <pre className="mt-1.5 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-fg">{share.text}</pre>
                      <div className="mt-2.5 flex flex-wrap items-center gap-2">
                        <a href={share.url} target="_blank" rel="noopener noreferrer" className={BTN}>
                          เปิดหน้า GitHub เพื่อกดส่งเอง
                          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                        </a>
                        <button type="button" onClick={() => copy(share.text)} className={BTN}>
                          <ClipboardDocumentIcon className="h-4 w-4" />
                          {copied ? "คัดลอกแล้ว" : "คัดลอกข้อความ"}
                        </button>
                      </div>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="card min-w-0 px-4 py-4">
        <h2 className="text-sm font-semibold text-fg">เขียนบทเรียนเอง</h2>
        <p className="hint mt-0.5">
          ใช้กับเรื่องที่ทุกโปรเจกต์ควรระวัง ส่วนความชอบเรื่องหน้าตาหรือเรื่องเฉพาะโปรเจกต์ ให้ใส่ใน สไตล์ → คำสั่งเพิ่มเติม
        </p>
        <input
          value={rule}
          onChange={(e) => setRule(e.target.value)}
          maxLength={MAX_RULE_LENGTH}
          aria-label="กฎหนึ่งประโยค"
          placeholder="กฎหนึ่งประโยค เช่น ช่องจำนวนเงินต้องตรวจว่าเป็นตัวเลขและไม่ติดลบทั้งหน้าเว็บและฝั่ง server"
          className="field mt-3"
        />
        <input
          value={symptom}
          onChange={(e) => setSymptom(e.target.value)}
          maxLength={MAX_SYMPTOM_LENGTH}
          aria-label="เคยเกิดอะไรขึ้น (ไม่ใส่ก็ได้)"
          placeholder="เคยเกิดอะไรขึ้น (ไม่ใส่ก็ได้)"
          className="field mt-2"
        />
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <select value={card} onChange={(e) => setCard(e.target.value)} aria-label="เรื่องที่เกี่ยวข้อง" className="field min-w-0 flex-1 basis-48">
            <option value={GENERAL_CARD}>ทั่วไป (ใช้ทุกครั้ง)</option>
            {cards.map((c) => (
              <option key={c.id} value={c.id}>
                {c.title}
              </option>
            ))}
          </select>
          <button type="button" onClick={add} disabled={busy || !rule.trim()} className="btn btn-primary shrink-0">
            เพิ่ม
          </button>
        </div>
      </section>
      {error && (
        <p role="alert" className="callout callout-danger break-words">
          {error}
        </p>
      )}
    </div>
  );
}
