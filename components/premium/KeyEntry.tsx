"use client";

import { useId, useState, useTransition } from "react";
import { KeyIcon } from "@heroicons/react/24/outline";
import { activatePremiumKeyAction } from "@/app/premium/actions";
import type { PremiumStatus } from "@/lib/premium/types";
import { RestoreByEmail } from "./RestoreByEmail";

export type ActivatedVia = "key" | "restore";

/**
 * Paste a licence key (bought earlier, or received by email) and activate it on this install, or restore it
 * by email ("ย้ายเครื่องมา?"). `emailVerify` comes from the offer when the caller has it.
 */
export function KeyEntry({
  onActivated,
  compact = false,
  emailVerify,
}: {
  onActivated: (status: PremiumStatus, via: ActivatedVia) => void;
  compact?: boolean;
  emailVerify?: boolean;
}) {
  const [key, setKey] = useState("");
  const [restoring, setRestoring] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const id = useId();
  const inputId = `premium-key-${id}`;
  const errorId = `premium-key-error-${id}`;

  function submit() {
    setError(null);
    start(async () => {
      const r = await activatePremiumKeyAction(key);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      setKey("");
      onActivated(r.data, "key");
    });
  }

  return (
    <div>
      {!compact && (
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
          <label htmlFor={inputId} className="label flex items-center gap-1.5">
            <KeyIcon className="h-4 w-4 text-muted" aria-hidden="true" />
            มีรหัสอยู่แล้ว
          </label>
          <button type="button" onClick={() => setRestoring((v) => !v)} aria-expanded={restoring} className="link text-sm">
            ย้ายเครื่องมา? กู้คืนด้วยอีเมล
          </button>
        </div>
      )}
      <div className="mt-1 flex gap-2">
        <input
          id={inputId}
          value={key}
          onChange={(e) => setKey(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && key.trim() && !pending) submit();
          }}
          placeholder="EGP1.…"
          spellCheck={false}
          autoComplete="off"
          aria-label={compact ? "รหัส Pro" : undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? errorId : undefined}
          className="field min-w-0 flex-1 font-mono text-[13px]"
        />
        <button type="button" onClick={submit} disabled={pending || !key.trim()} className="btn btn-secondary shrink-0">
          {pending ? "กำลังตรวจ…" : "ใช้รหัสนี้"}
        </button>
      </div>
      {error && (
        <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
          {error}
        </p>
      )}
      {restoring && !compact && (
        <div className="mt-3">
          <RestoreByEmail emailVerify={emailVerify} onActivated={(status) => onActivated(status, "restore")} />
        </div>
      )}
    </div>
  );
}
