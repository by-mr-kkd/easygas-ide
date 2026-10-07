"use client";

import { useState } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import { MAX_CUSTOM_LENGTH, PREF_FIELDS, type PrefKey, type StylePrefs } from "@/lib/preferences";

const INHERIT = "";

/**
 * Look & feel choices (lib/preferences). Two modes:
 *  - global (Settings): every field has a value — the user's default for new builds.
 *  - project (`inherited` given): each field may stay on "ตามค่าเริ่มต้นของฉัน", so a project only
 *    stores what it changes and keeps following the global default for the rest.
 */
export function StylePrefsForm({
  value,
  inherited,
  onSave,
  customLabel = "คำสั่งเพิ่มเติมของฉัน",
  customHint = "เช่น ใช้สีหลักน้ำเงินเข้ม ปุ่มมุมมน หัวข้อใช้คำสุภาพ AI จะทำตามทุกครั้ง",
}: {
  value: Partial<StylePrefs>;
  inherited?: StylePrefs;
  onSave: (prefs: Partial<StylePrefs>) => Promise<{ ok: boolean; error?: string }>;
  customLabel?: string;
  customHint?: string;
}) {
  const [picks, setPicks] = useState<Record<PrefKey, string>>(
    () => Object.fromEntries(PREF_FIELDS.map((f) => [f.id, value[f.id] ?? (inherited ? INHERIT : f.options[0].id)])) as Record<PrefKey, string>,
  );
  const [custom, setCustom] = useState(value.custom ?? "");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function change(key: PrefKey, v: string) {
    setPicks((p) => ({ ...p, [key]: v }));
    setSaved(false);
  }

  async function save() {
    setBusy(true);
    setError(null);
    const prefs: Partial<StylePrefs> = { custom: custom.trim() };
    for (const f of PREF_FIELDS) if (picks[f.id] !== INHERIT) prefs[f.id] = picks[f.id];
    try {
      const r = await onSave(prefs);
      if (!r.ok) return setError(r.error ?? "บันทึกไม่สำเร็จ");
      setSaved(true);
    } catch {
      setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="card min-w-0 px-4 py-4">
      <div className="space-y-4">
        {PREF_FIELDS.map((f) => {
          const shown = picks[f.id] === INHERIT ? inherited?.[f.id] : picks[f.id];
          const option = f.options.find((o) => o.id === shown);
          const inheritedLabel = f.options.find((o) => o.id === inherited?.[f.id])?.label;
          return (
            <label key={f.id} className="block min-w-0">
              <span className="label">{f.label}</span>
              <select value={picks[f.id]} onChange={(e) => change(f.id, e.target.value)} className="field mt-1">
                {inherited && <option value={INHERIT}>ตามค่าเริ่มต้นของฉัน ({inheritedLabel})</option>}
                {f.options.map((o) => (
                  <option key={o.id} value={o.id}>
                    {o.label}
                  </option>
                ))}
              </select>
              {option && <span className="hint mt-1 block break-words">{option.hint}</span>}
            </label>
          );
        })}

        <label className="block min-w-0">
          <span className="label">{customLabel}</span>
          <textarea
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              setSaved(false);
            }}
            maxLength={MAX_CUSTOM_LENGTH}
            rows={3}
            placeholder={customHint}
            className="field mt-1 block resize-y"
          />
          <span className="hint mt-0.5 block text-right tabular-nums">
            {custom.length}/{MAX_CUSTOM_LENGTH}
          </span>
        </label>
      </div>

      <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button type="button" onClick={save} disabled={busy} className="btn btn-primary">
          {busy ? "กำลังบันทึก…" : "บันทึก"}
        </button>
        {saved && (
          <span className="flex min-w-0 items-center gap-1.5 text-[13px] font-medium text-accent-text">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            บันทึกแล้ว ใช้กับคำสั่งถัดไป
          </span>
        )}
        {error && (
          <span role="alert" className="min-w-0 break-words text-[13px] font-medium text-danger">
            {error}
          </span>
        )}
      </div>
    </div>
  );
}
