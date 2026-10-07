"use client";

import { useEffect, useRef, useState } from "react";
import { HeartIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  DONATION_PRESETS,
  MAX_DONATION,
  MIN_DONATION,
  donationPayload,
  formatBaht,
  isAmountShaped,
  maskPromptPayId,
  parseDonationAmount,
} from "@/lib/donate";

/**
 * "สนับสนุนผู้พัฒนา": pick or type an amount, and a PromptPay QR for exactly that amount is drawn here
 * in the browser (nothing is sent anywhere). Rendered only when a valid PromptPay id is configured.
 */
export function DonateButton({ promptPayId, recipient }: { promptPayId: string; recipient: string }) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState("100");
  const [qr, setQr] = useState<{ amount: number; dataUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0); // bumped by "ลองอีกครั้ง"
  const triggerRef = useRef<HTMLButtonElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const amount = parseDonationAmount(input);

  // Draw the QR whenever the amount is valid; a stale code must never stay on screen for a new amount.
  useEffect(() => {
    if (!open) return;
    setQr(null);
    setError(null);
    if (amount === null) return;
    const payload = donationPayload(promptPayId, amount);
    if (!payload) {
      setError("สร้าง QR ไม่ได้ เลขพร้อมเพย์ของผู้รับไม่ถูกต้อง");
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then((m) => m.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 560 }))
      .then((dataUrl) => {
        if (!cancelled) setQr({ amount, dataUrl });
      })
      .catch(() => {
        if (!cancelled) setError("สร้าง QR ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [open, amount, promptPayId, attempt]);

  // modal basics: focus moves in on open and back to the button on close
  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);
  function close() {
    setOpen(false);
    triggerRef.current?.focus();
  }

  const hint =
    input.trim() === "" || !isAmountShaped(input)
      ? "ใส่เป็นตัวเลขอย่างเดียว เช่น 100 หรือ 1,250.50"
      : `ใส่ได้ตั้งแต่ ${formatBaht(MIN_DONATION)} ถึง ${formatBaht(MAX_DONATION)} บาท`;

  return (
    <>
      <button ref={triggerRef} onClick={() => setOpen(true)} className="btn btn-primary">
        <HeartIcon className="h-4 w-4" />
        สนับสนุนผู้พัฒนา
      </button>

      {open && (
        <div
          className="dialog-backdrop"
          onClick={(e) => {
            if (e.target === e.currentTarget) close(); // click on the backdrop, not inside the dialog
          }}
          onKeyDown={(e) => {
            if (e.key === "Escape") close();
          }}
        >
          <div role="dialog" aria-modal="true" aria-labelledby="donate-title" className="dialog max-w-sm">
            <div className="flex items-center gap-2 border-b border-line py-2 pl-4 pr-2">
              <h2 id="donate-title" className="min-w-0 flex-1 truncate text-sm font-semibold">
                สนับสนุน {recipient}
              </h2>
              <button onClick={close} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon shrink-0">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>

            <div className="p-4">
              <label className="label" htmlFor="donate-amount">
                จำนวนเงิน (บาท)
              </label>
              <input
                id="donate-amount"
                ref={inputRef}
                inputMode="decimal"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                aria-invalid={amount === null}
                aria-describedby="donate-status"
                className="field mt-1 text-lg font-semibold"
              />
              <div className="mt-2 flex flex-wrap gap-2">
                {DONATION_PRESETS.map((p) => (
                  <button
                    key={p}
                    onClick={() => setInput(String(p))}
                    aria-pressed={amount === p}
                    className={`btn btn-sm ${amount === p ? "border-accent bg-accent-soft font-semibold text-accent-text" : "btn-secondary"}`}
                  >
                    {p} บาท
                  </button>
                ))}
              </div>

              <div
                id="donate-status"
                aria-live="polite"
                className="mt-4 grid min-h-[300px] place-items-center rounded-lg border border-line bg-sunken p-3"
              >
                {amount === null ? (
                  <p className="hint px-2 text-center">{hint}</p>
                ) : qr && qr.amount === amount ? (
                  <div className="w-full text-center">
                    {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn on this machine */}
                    <img
                      src={qr.dataUrl}
                      alt={`QR พร้อมเพย์ ${formatBaht(amount)} บาท`}
                      width={280}
                      height={280}
                      className="mx-auto h-auto w-full max-w-[280px] rounded-lg bg-white"
                    />
                    <p className="mt-2 text-lg font-semibold text-fg">{formatBaht(amount)} บาท</p>
                    <p className="hint break-words">
                      พร้อมเพย์ {maskPromptPayId(promptPayId)} · {recipient}
                    </p>
                  </div>
                ) : error ? (
                  <div className="text-center">
                    <p className="text-sm text-danger">{error}</p>
                    <button onClick={() => setAttempt((n) => n + 1)} className="btn btn-secondary btn-sm mt-2">
                      ลองอีกครั้ง
                    </button>
                  </div>
                ) : (
                  <p className="hint">กำลังสร้าง QR…</p>
                )}
              </div>

              <p className="hint mt-3">
                สแกนด้วยแอปธนาคาร แล้วตรวจชื่อผู้รับและยอดเงินในแอปธนาคารก่อนยืนยัน การสนับสนุนเป็นความสมัครใจ
                แอปนี้ใช้ได้ฟรีเหมือนเดิม และแอปไม่รู้ว่ามีการโอนหรือไม่
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
