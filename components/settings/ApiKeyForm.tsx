"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { removeApiKeyAction, saveApiKeyAction } from "@/app/settings/actions";
import type { KeyId } from "@/lib/settings";

/**
 * One provider's key: a "saved" badge with a remove button, or the input. The saved key itself is
 * never sent here. `required` = this is the key of the provider in use, so a missing key blocks the
 * user (warn colours + the section's primary button); the other providers' rows stay quiet.
 */
export function ApiKeyForm({
  keyId,
  label,
  hint,
  hasKey,
  required = false,
}: {
  keyId: KeyId;
  label: string;
  hint: string;
  hasKey: boolean;
  required?: boolean;
}) {
  const router = useRouter();
  const [key, setKey] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    if (!key.trim() || busy) return;
    setBusy(true);
    setError(null);
    const r = await saveApiKeyAction(keyId, key);
    setBusy(false);
    if (!r.ok) return setError(r.error ?? "บันทึกไม่สำเร็จ");
    setKey("");
    router.refresh();
  }

  async function remove() {
    setBusy(true);
    await removeApiKeyAction(keyId);
    setBusy(false);
    router.refresh();
  }

  const errorLine = error && (
    <p role="alert" className="mt-2 text-[13px] font-medium text-danger">
      {error}
    </p>
  );

  if (hasKey) {
    return (
      <div className="rounded-lg border border-line px-3 py-2.5">
        <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
          <span className="min-w-0 flex-1 text-sm font-semibold text-fg">คีย์ของ {label}</span>
          <span className="badge badge-ok">ใส่คีย์แล้ว</span>
          <button type="button" onClick={remove} disabled={busy} className="btn btn-danger btn-sm">
            เอาคีย์ออก
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  const inputId = `api-key-${keyId}`;
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
      className={required ? "callout callout-warn block" : "rounded-lg border border-line px-3 py-2.5"}
    >
      <label htmlFor={inputId} className="block text-sm font-semibold">
        {required ? `ยังไม่ได้ใส่คีย์ของ ${label}` : `คีย์ของ ${label}`}
      </label>
      <p className={required ? "text-[13px]" : "hint"}>{hint} แล้ววางที่นี่</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <input
          id={inputId}
          type="password"
          value={key}
          onChange={(e) => setKey(e.target.value)}
          placeholder="วางคีย์ที่นี่"
          autoComplete="off"
          className="field min-w-0 flex-1 basis-48 font-mono"
        />
        <button type="submit" disabled={busy || !key.trim()} className={`btn btn-sm ${required ? "btn-primary" : "btn-secondary"}`}>
          {busy ? "กำลังบันทึก…" : "บันทึกคีย์"}
        </button>
      </div>
      {errorLine}
    </form>
  );
}
