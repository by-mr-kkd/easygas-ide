"use client";

import { useId, useState, useTransition } from "react";
import { ArrowTopRightOnSquareIcon, EnvelopeIcon } from "@heroicons/react/24/outline";
import { requestPremiumEmailCodeAction, restorePremiumAction } from "@/app/premium/actions";
import { LINKS } from "@/lib/links";
import { normalizeEmailCode, RESTORE_UNAVAILABLE_TEXT, type PremiumStatus } from "@/lib/premium/types";
import { EmailCodeField } from "./EmailCodeField";

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function Unavailable() {
  return (
    <div className="callout">
      <p className="text-sm text-fg">
        {RESTORE_UNAVAILABLE_TEXT}{" "}
        <a href={LINKS.facebookGroup} target="_blank" rel="noopener noreferrer" className="link inline-flex items-center gap-1">
          เปิดกลุ่ม Facebook
          <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" aria-hidden="true" />
        </a>
      </p>
    </div>
  );
}

/**
 * Moved to a new computer: email → 6-digit code → the server hands back the key, which is verified offline
 * before it is stored (restorePremiumAction). `emailVerify` false = the server has no email yet.
 */
export function RestoreByEmail({
  emailVerify,
  onActivated,
}: {
  /** from the offer when known; undefined = ask the server */
  emailVerify?: boolean;
  onActivated: (status: PremiumStatus) => void;
}) {
  const [email, setEmail] = useState("");
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [unavailable, setUnavailable] = useState(emailVerify === false);
  const [pending, start] = useTransition();
  const id = useId();
  const emailId = `restore-email-${id}`;
  const codeId = `restore-code-${id}`;
  const errorId = `restore-error-${id}`;

  if (unavailable) return <Unavailable />;

  function send() {
    const value = email.trim();
    if (!EMAIL.test(value)) {
      setError("กรอกอีเมลที่ใช้ซื้อให้ถูกต้อง");
      return;
    }
    setError(null);
    start(async () => {
      const r = await requestPremiumEmailCodeAction(value, "restore");
      if (!r.ok) {
        if (r.code === "email_unavailable") setUnavailable(true);
        else setError(r.error);
        return;
      }
      setSentTo(value.toLowerCase());
      setCode("");
    });
  }

  function confirm() {
    if (!sentTo) return;
    if (!normalizeEmailCode(code)) {
      setError("ใส่รหัสยืนยัน 6 หลักจากอีเมล");
      return;
    }
    setError(null);
    start(async () => {
      const r = await restorePremiumAction(sentTo, code);
      if (!r.ok) {
        setError(r.error);
        return;
      }
      onActivated(r.data);
    });
  }

  const errorLine = error && (
    <p id={errorId} role="alert" className="mt-1.5 text-sm text-danger">
      {error}
    </p>
  );

  if (!sentTo) {
    return (
      <div className="rounded-lg border border-line p-3">
        <label htmlFor={emailId} className="label">
          อีเมลที่ใช้ซื้อ
        </label>
        <div className="mt-1 flex gap-2">
          <input
            id={emailId}
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !pending) send();
            }}
            autoComplete="email"
            placeholder="you@example.com"
            aria-invalid={error ? true : undefined}
            aria-describedby={error ? errorId : undefined}
            className="field min-w-0 flex-1"
          />
          <button type="button" onClick={send} disabled={pending || !email.trim()} className="btn btn-secondary shrink-0">
            <EnvelopeIcon className="h-4 w-4" aria-hidden="true" />
            {pending ? "กำลังส่ง…" : "ส่งรหัสยืนยัน"}
          </button>
        </div>
        {errorLine}
      </div>
    );
  }

  return (
    <div className="rounded-lg border border-line p-3">
      <p className="hint">
        ส่งอีเมลไปที่ <span className="font-medium text-fg">{sentTo}</span> แล้ว ใส่รหัส 6 หลักจากอีเมล รหัสใช้ได้ 10 นาที
      </p>
      <label htmlFor={codeId} className="label mt-2">
        รหัสยืนยัน
      </label>
      <div className="mt-1 flex flex-wrap gap-2">
        <EmailCodeField
          id={codeId}
          value={code}
          onChange={setCode}
          onEnter={() => !pending && confirm()}
          invalid={!!error}
          describedBy={error ? errorId : undefined}
        />
        <button type="button" onClick={confirm} disabled={pending || code.length !== 6} className="btn btn-primary shrink-0">
          {pending ? "กำลังตรวจ…" : "กู้คืน Pro"}
        </button>
      </div>
      {errorLine}
      <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm">
        <button type="button" onClick={send} disabled={pending} className="link">
          ส่งรหัสใหม่
        </button>
        <button
          type="button"
          onClick={() => {
            setSentTo(null);
            setError(null);
          }}
          disabled={pending}
          className="link"
        >
          เปลี่ยนอีเมล
        </button>
      </div>
    </div>
  );
}
