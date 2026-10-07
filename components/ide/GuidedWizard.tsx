"use client";

import { useState } from "react";
import { ArrowLeftIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { startFromBriefAction } from "@/app/projects/actions";
import { ACCESSES, EMPTY_BRIEF, FEATURES, PURPOSES, STORAGES, isSheetUrl, type BriefOption, type ProjectBrief } from "@/lib/brief";
import { PREF_FIELDS, type PrefKey, type StylePrefs } from "@/lib/preferences";

/**
 * New-project wizard: one topic per round, each with a recommended option, every round skippable.
 * The answers are saved on the project as a brief (lib/brief) — the app picks rule cards from it — and
 * come back as the first chat message, which then goes through the normal spec → confirm → build flow.
 */

interface WizardProps {
  open: boolean;
  projectId: string;
  /** The user's effective look & feel defaults (Settings), shown pre-selected in the last round. */
  defaults: StylePrefs;
  onClose: () => void;
  /** The first chat message, plus the look & feel the user changed for this project. */
  onComplete: (message: string, look: Partial<StylePrefs>) => void;
}

const STEPS = ["ใช้ทำอะไร", "เก็บข้อมูลที่ไหน", "ใครเข้าใช้ได้", "ต้องการอะไรเพิ่ม", "หน้าตา"];
/** The look & feel fields worth asking up front; the rest follow Settings. */
const LOOK_KEYS: PrefKey[] = ["nav", "css", "dialog"];

function Cards({
  options,
  isActive,
  onPick,
}: {
  options: BriefOption[];
  isActive: (id: string) => boolean;
  onPick: (id: string) => void;
}) {
  return (
    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
      {options.map((o) => {
        const active = isActive(o.id);
        return (
          <button
            key={o.id}
            type="button"
            aria-pressed={active}
            onClick={() => onPick(o.id)}
            className={`rounded-lg border px-3 py-2.5 text-left transition ${
              active ? "border-accent bg-accent-soft" : "border-line-strong bg-surface hover:bg-sunken"
            }`}
          >
            <span className={`flex flex-wrap items-center gap-1.5 text-sm font-medium ${active ? "text-accent-text" : "text-fg"}`}>
              {o.label}
              {o.recommended && <span className="badge">แนะนำ</span>}
            </span>
            <span className="mt-0.5 block text-[13px] leading-snug text-muted">{o.hint}</span>
          </button>
        );
      })}
    </div>
  );
}

export function GuidedWizard({ open, projectId, defaults, onClose, onComplete }: WizardProps) {
  const [step, setStep] = useState(0);
  // Nothing is pre-selected: a round the user skips must stay unanswered (the AI then asks or picks),
  // not be recorded and sent as if they had chosen it. The "แนะนำ" badge is guidance only.
  const [brief, setBrief] = useState<ProjectBrief>(EMPTY_BRIEF);
  const [look, setLook] = useState<Partial<StylePrefs>>({});
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!open) return null;

  const set = (patch: Partial<ProjectBrief>) => setBrief((b) => ({ ...b, ...patch }));
  const toggleFeature = (id: string) =>
    set({ features: brief.features.includes(id) ? brief.features.filter((f) => f !== id) : [...brief.features, id] });
  // Only a value that differs from the user's default is pinned to this project; picking the default
  // again un-pins it, so the project keeps following Settings for that field.
  const pickLook = (key: PrefKey, value: string) =>
    setLook((l) => {
      const next = { ...l };
      if (value === defaults[key]) delete next[key];
      else next[key] = value;
      return next;
    });
  const sheetUrlBad = brief.storage === "existing-sheet" && brief.sheetUrl.trim() !== "" && !isSheetUrl(brief.sheetUrl);

  async function finish() {
    setBusy(true);
    setError(null);
    try {
      const r = await startFromBriefAction(projectId, brief, look);
      if ("error" in r) return setError(r.error);
      onComplete(r.message, look);
      setStep(0);
      setBrief(EMPTY_BRIEF);
      setLook({});
    } catch {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  const last = step === STEPS.length - 1;
  const next = () => (last ? finish() : setStep((s) => s + 1));

  return (
    <div className="dialog-backdrop">
      <div role="dialog" aria-modal="true" aria-label="ถามทีละข้อ" className="dialog max-w-lg p-5">
        <div className="mb-3 flex items-center gap-2">
          <b className="text-sm">ถามทีละข้อ</b>
          <span className="text-xs text-muted">
            ข้อ {step + 1} จาก {STEPS.length}
          </span>
          <span className="flex-1" />
          <button onClick={onClose} className="btn btn-ghost btn-sm">
            ปิด แล้วพิมพ์เอง
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mb-4 flex gap-1" aria-hidden="true">
          {STEPS.map((_, i) => (
            <span key={i} className={`h-1 flex-1 rounded-full ${i <= step ? "bg-accent" : "bg-line"}`} />
          ))}
        </div>

        <h3 className="mb-1 text-lg font-semibold">{STEPS[step]}</h3>
        <p className="hint mb-3">ข้ามข้อที่ยังไม่แน่ใจได้ AI จะถามหรือเลือกให้เอง</p>

        {step === 0 && (
          <div className="space-y-3">
            <Cards options={PURPOSES} isActive={(id) => brief.purpose === id} onPick={(id) => set({ purpose: brief.purpose === id ? "" : id })} />
            <textarea
              value={brief.detail}
              onChange={(e) => set({ detail: e.target.value })}
              rows={3}
              maxLength={1000}
              placeholder="เล่าเพิ่มได้ เช่น ร้านตัดผม 3 ช่าง ลูกค้าจองคิวล่วงหน้า เก็บชื่อ เบอร์โทร วันและเวลา"
              className="field resize-y"
            />
          </div>
        )}

        {step === 1 && (
          <div className="space-y-3">
            <Cards options={STORAGES} isActive={(id) => brief.storage === id} onPick={(id) => set({ storage: brief.storage === id ? "" : id })} />
            {brief.storage === "existing-sheet" && (
              <div>
                <input
                  value={brief.sheetUrl}
                  onChange={(e) => set({ sheetUrl: e.target.value })}
                  placeholder="https://docs.google.com/spreadsheets/d/…"
                  aria-invalid={sheetUrlBad}
                  className="field"
                />
                <p className={`mt-1.5 text-[13px] ${sheetUrlBad ? "text-warn-text" : "text-muted"}`}>
                  {sheetUrlBad ? "ลิงก์นี้ไม่ใช่ลิงก์ของ Google Sheet เว้นว่างไว้แล้วส่งให้ AI ทีหลังก็ได้" : "วางลิงก์ของ Sheet หรือเว้นว่างแล้วส่งให้ AI ทีหลัง"}
                </p>
              </div>
            )}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-2">
            <Cards options={ACCESSES} isActive={(id) => brief.access === id} onPick={(id) => set({ access: brief.access === id ? "" : id })} />
            <p className="hint">
              เว็บแอปจะรันในชื่อบัญชี Google ของคุณ และใครมีลิงก์ก็เปิดได้ จึงให้ผู้ใช้ล็อกอินด้วยบัญชี Google ของเขาเองไม่ได้
            </p>
          </div>
        )}

        {step === 3 && <Cards options={FEATURES} isActive={(id) => brief.features.includes(id)} onPick={toggleFeature} />}

        {step === 4 && (
          <div className="space-y-3">
            {PREF_FIELDS.filter((f) => LOOK_KEYS.includes(f.id)).map((f) => (
              <label key={f.id} className="block">
                <span className="label">{f.label}</span>
                <select
                  value={look[f.id] ?? defaults[f.id]}
                  onChange={(e) => pickLook(f.id, e.target.value)}
                  className="field mt-1"
                >
                  {f.options.map((o) => (
                    <option key={o.id} value={o.id}>
                      {o.label}: {o.hint}
                    </option>
                  ))}
                </select>
              </label>
            ))}
            <p className="hint">
              ค่าที่เห็นมาจากหน้า ตั้งค่า เปลี่ยนเฉพาะโปรเจกต์นี้ได้ หรือบอก AI ในแชตให้เปลี่ยนทีหลังก็ได้
            </p>
          </div>
        )}

        {error && <p className="callout callout-danger mt-3">{error}</p>}

        <div className="mt-6 flex items-center gap-2">
          {step > 0 && (
            <button
              onClick={() => setStep((s) => s - 1)}
              disabled={busy}
              className="btn btn-ghost"
            >
              <ArrowLeftIcon className="h-4 w-4" />
              ย้อนกลับ
            </button>
          )}
          <span className="flex-1" />
          <button
            onClick={next}
            disabled={busy}
            className="btn btn-primary"
          >
            {last ? (
              <>
                <SparklesIcon className="h-4 w-4" />
                {busy ? "กำลังเริ่ม…" : "เริ่มสร้าง"}
              </>
            ) : (
              "ถัดไป"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
