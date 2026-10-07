"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, SparklesIcon, XMarkIcon } from "@heroicons/react/24/outline";
import {
  cancelPremiumOrderAction,
  getPremiumOfferAction,
  pollPremiumOrderAction,
  requestPremiumEmailCodeAction,
  startPremiumOrderAction,
} from "@/app/premium/actions";
import { formatBaht } from "@/lib/donate";
import type { OfferView, OrderView, PremiumStatus } from "@/lib/premium/types";
import { EmailCodeField } from "./EmailCodeField";
import { KeyBox } from "./KeyBox";
import { KeyEntry } from "./KeyEntry";
import { OfferCopy } from "./OfferCopy";
import { SlipPayment } from "./SlipPayment";

export interface UpgradeDialogProps {
  open: boolean;
  onClose: () => void;
  /** what the user was doing when the offer came up */
  reason?: "camera" | "settings";
  /** called after a licence is activated on this install */
  onActivated?: () => void;
}

type View =
  | { kind: "loading" }
  | { kind: "unavailable"; message: string; closed: boolean; emailVerify?: boolean }
  | { kind: "offer"; offer: OfferView }
  | { kind: "paying"; offer: OfferView | null; order: OrderView }
  /** showKey: the key box appears once, after a purchase or a restore (not after pasting a key) */
  | { kind: "done"; status: PremiumStatus; showKey: boolean };

const POLL_MS = 4000;

/** What the offer said about email, for the restore link (undefined = unknown, ask the server). */
function dialogEmailVerify(view: View): boolean | undefined {
  if (view.kind === "offer") return view.offer.emailVerify;
  if (view.kind === "unavailable") return view.emailVerify;
  if (view.kind === "paying") return view.offer?.emailVerify;
  return undefined;
}
const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/** The premium offer and the purchase flow. Loads the offer when opened (a user action), never at render. */
export function UpgradeDialog({ open, onClose, reason, onActivated }: UpgradeDialogProps) {
  const [view, setView] = useState<View>({ kind: "loading" });
  const [email, setEmail] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  /** emailVerify: the address the order code was sent to (lower-cased); null until sent */
  const [codeSentTo, setCodeSentTo] = useState<string | null>(null);
  const [code, setCode] = useState("");
  const [pollNote, setPollNote] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const titleRef = useRef<HTMLHeadingElement>(null);

  const load = useCallback((force: boolean) => {
    setView({ kind: "loading" });
    setFormError(null);
    getPremiumOfferAction(force).then((r) => {
      if (!r.ok) {
        setView({ kind: "unavailable", message: r.error, closed: false });
        return;
      }
      const { offer, pendingOrder, activated } = r.data;
      if (activated) {
        setView({ kind: "done", status: activated, showKey: true });
        onActivated?.();
        return;
      }
      if (pendingOrder) {
        setView({ kind: "paying", offer, order: pendingOrder });
        return;
      }
      if (!offer || !offer.open) {
        setView({ kind: "unavailable", message: "ตอนนี้ยังไม่เปิดขาย ถ้ามีรหัสอยู่แล้วใส่ได้ด้านล่าง", closed: true, emailVerify: offer?.emailVerify });
        return;
      }
      setView({ kind: "offer", offer });
    });
  }, [onActivated]);

  // opening the dialog is the user action that fetches the offer
  useEffect(() => {
    if (!open) return;
    load(false);
    titleRef.current?.focus();
  }, [open, load]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  const finish = useCallback(
    (status: PremiumStatus, showKey = true) => {
      setView({ kind: "done", status, showKey });
      onActivated?.();
    },
    [onActivated],
  );

  // mode "link": poll the order while the dialog is open
  const polling = open && view.kind === "paying" && view.order.mode === "link";
  useEffect(() => {
    if (!polling) return;
    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const tick = async () => {
      const r = await pollPremiumOrderAction();
      if (stopped) return;
      if (!r.ok) {
        setPollNote(r.error);
      } else if (r.data.status === "paid") {
        finish(r.data.premium);
        return;
      } else if (r.data.status === "pending") {
        setPollNote(null);
      } else {
        setPollNote(r.data.status === "expired" ? "คำสั่งซื้อนี้หมดเวลาแล้ว เริ่มใหม่ได้" : "การชำระเงินไม่สำเร็จ เริ่มใหม่ได้");
        setView((v) => (v.kind === "paying" ? v.offer ? { kind: "offer", offer: v.offer } : { kind: "loading" } : v));
        return;
      }
      timer = setTimeout(tick, POLL_MS);
    };
    timer = setTimeout(tick, POLL_MS);
    return () => {
      stopped = true;
      if (timer) clearTimeout(timer);
    };
  }, [polling, finish]);

  function sendOrderCode(address: string) {
    setFormError(null);
    start(async () => {
      const r = await requestPremiumEmailCodeAction(address, "order");
      if (!r.ok) {
        setFormError(r.error);
        return;
      }
      setCodeSentTo(address);
      setCode("");
    });
  }

  /** Without emailVerify: create the order. With it: first email a code, then create the order with it. */
  function startOrder() {
    const value = email.trim().toLowerCase();
    if (!EMAIL.test(value)) {
      setFormError("กรอกอีเมลให้ถูกต้อง รหัสจะถูกออกให้อีเมลนี้");
      return;
    }
    const verify = view.kind === "offer" && view.offer.emailVerify;
    if (verify && codeSentTo !== value) {
      sendOrderCode(value);
      return;
    }
    if (verify && code.length !== 6) {
      setFormError("ใส่รหัสยืนยัน 6 หลักจากอีเมล");
      return;
    }
    setFormError(null);
    start(async () => {
      const r = await startPremiumOrderAction(value, verify ? code : undefined);
      if (!r.ok) {
        setFormError(r.error);
        // a used-up or expired code cannot be retried: ask for a new one
        if (r.code === "code_expired" || r.code === "code_locked") setCode("");
        return;
      }
      setPollNote(null);
      setCodeSentTo(null);
      setCode("");
      setView((v) => ({ kind: "paying", offer: v.kind === "offer" ? v.offer : null, order: r.data }));
    });
  }

  function cancelOrder() {
    start(async () => {
      await cancelPremiumOrderAction();
      setPollNote(null);
      load(true);
    });
  }

  if (!open) return null;

  const body = (() => {
    switch (view.kind) {
      case "loading":
        return <p className="hint py-6 text-center">กำลังโหลดข้อเสนอ…</p>;
      case "unavailable":
        return (
          <>
            <OfferCopy offer={null} />
            <div className={view.closed ? "callout" : "callout callout-warn"}>
              <p className="text-sm text-fg">{view.message}</p>
              {!view.closed && (
                <button type="button" onClick={() => load(true)} className="btn btn-secondary btn-sm mt-2">
                  ลองอีกครั้ง
                </button>
              )}
            </div>
          </>
        );
      case "offer": {
        const payLabel = view.offer.mode === "link" ? "ไปชำระเงิน" : "ชำระด้วยพร้อมเพย์";
        const verify = view.offer.emailVerify;
        const awaitingCode = verify && codeSentTo !== null && codeSentTo === email.trim().toLowerCase();
        return (
          <>
            <OfferCopy offer={view.offer} />
            {pollNote && (
              <p role="status" className="callout callout-warn text-sm text-fg">
                {pollNote}
              </p>
            )}
            <div>
              <label htmlFor="premium-email" className="label">
                อีเมลสำหรับรับรหัส
              </label>
              <div className="mt-1 flex gap-2">
                <input
                  id="premium-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && !pending && !awaitingCode) startOrder();
                  }}
                  autoComplete="email"
                  placeholder="you@example.com"
                  aria-invalid={formError && !awaitingCode ? true : undefined}
                  aria-describedby={formError ? "premium-email-error" : "premium-email-hint"}
                  className="field min-w-0 flex-1"
                />
                {!awaitingCode && (
                  <button type="button" onClick={startOrder} disabled={pending} className="btn btn-primary shrink-0">
                    {verify ? (pending ? "กำลังส่ง…" : "ส่งรหัสยืนยัน") : pending ? "กำลังสร้างคำสั่งซื้อ…" : payLabel}
                  </button>
                )}
              </div>
              {awaitingCode && (
                <div className="mt-3">
                  <p className="hint">
                    ส่งรหัสไปที่ <span className="font-medium text-fg">{codeSentTo}</span> แล้ว ใส่รหัส 6 หลักจากอีเมล รหัสใช้ได้ 10 นาที
                  </p>
                  <label htmlFor="premium-order-code" className="label mt-2">
                    รหัสยืนยัน
                  </label>
                  <div className="mt-1 flex flex-wrap gap-2">
                    <EmailCodeField
                      id="premium-order-code"
                      value={code}
                      onChange={setCode}
                      onEnter={() => !pending && startOrder()}
                      invalid={!!formError}
                      describedBy={formError ? "premium-email-error" : undefined}
                    />
                    <button type="button" onClick={startOrder} disabled={pending || code.length !== 6} className="btn btn-primary shrink-0">
                      {pending ? "กำลังสร้างคำสั่งซื้อ…" : payLabel}
                    </button>
                  </div>
                  <button type="button" onClick={() => sendOrderCode(codeSentTo)} disabled={pending} className="link mt-2 text-sm">
                    ส่งรหัสใหม่
                  </button>
                </div>
              )}
              {formError ? (
                <p id="premium-email-error" role="alert" className="mt-1.5 text-sm text-danger">
                  {formError}
                </p>
              ) : (
                !awaitingCode && (
                  <p id="premium-email-hint" className="hint mt-1.5">
                    {verify ? "เราจะส่งรหัสยืนยันไปที่อีเมลนี้ก่อน กันพิมพ์อีเมลผิด รหัส Pro ผูกกับอีเมลนี้" : "รหัสผูกกับอีเมลนี้ เก็บไว้ใช้ติดตั้งใหม่ได้"}
                  </p>
                )
              )}
            </div>
          </>
        );
      }
      case "paying":
        return (
          <>
            <div className="flex flex-wrap items-baseline justify-between gap-2">
              <p className="text-sm text-fg">
                คำสั่งซื้อสำหรับ <span className="font-medium">{view.order.email}</span>
              </p>
              <button type="button" onClick={cancelOrder} disabled={pending} className="btn btn-ghost btn-sm">
                ยกเลิกคำสั่งซื้อนี้
              </button>
            </div>
            {view.order.mode === "slip" ? (
              <SlipPayment order={view.order} onPaid={finish} />
            ) : (
              <div className="space-y-3">
                <p className="text-lg font-semibold text-fg">{formatBaht(view.order.amount)} บาท</p>
                {view.order.payUrl ? (
                  <a href={view.order.payUrl} target="_blank" rel="noopener noreferrer" className="btn btn-primary w-full justify-center">
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden="true" />
                    เปิดหน้าชำระเงิน
                  </a>
                ) : (
                  <p className="text-sm text-danger">เซิร์ฟเวอร์ไม่ได้ส่งลิงก์ชำระเงินมา ยกเลิกแล้วเริ่มใหม่</p>
                )}
                <p className="hint" aria-live="polite">
                  {pollNote ?? "หน้าชำระเงินเปิดในเบราว์เซอร์ของคุณ เมื่อชำระแล้วหน้านี้จะปลดล็อกให้เอง ไม่ต้องกดอะไรเพิ่ม"}
                </p>
              </div>
            )}
          </>
        );
      case "done":
        return (
          <>
            <div className="callout flex items-start gap-3">
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-fg">เปิดใช้ Pro แล้ว</p>
                <p className="hint mt-0.5">
                  {view.status.email ? `รหัสของ ${view.status.email} ใช้งานบนเครื่องนี้แล้ว` : "รหัสใช้งานบนเครื่องนี้แล้ว"} บอก AI ให้สร้างส่วนที่ใช้กล้องได้เลย
                </p>
              </div>
            </div>
            {view.showKey && <KeyBox keyMask={view.status.keyMask} />}
          </>
        );
    }
  })();

  return createPortal(
    <div className="dialog-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-labelledby="premium-title" className="dialog max-w-md p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="icon-chip mt-0.5 grid h-9 w-9 shrink-0 place-items-center rounded-full bg-accent-soft text-accent-text">
            <SparklesIcon className="h-5 w-5" aria-hidden="true" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 id="premium-title" ref={titleRef} tabIndex={-1} className="text-[15px] font-semibold text-fg outline-none">
              EasyGAS Pro
            </h3>
            {reason === "camera" && view.kind !== "done" && <p className="hint mt-0.5">คุณเพิ่งขอให้ AI ใส่ส่วนที่ใช้กล้อง ส่วนนี้ต้องใช้ Pro</p>}
          </div>
          <button type="button" onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-sm -mr-2 -mt-1 px-2">
            <XMarkIcon className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        <div className="mt-4 space-y-4">{body}</div>

        {view.kind !== "done" && view.kind !== "loading" && (
          <div className="mt-5 border-t border-line pt-4">
            <KeyEntry onActivated={(status, via) => finish(status, via === "restore")} emailVerify={dialogEmailVerify(view)} />
          </div>
        )}

        {view.kind === "done" && (
          <div className="mt-5 flex justify-end">
            <button type="button" onClick={onClose} className="btn btn-primary">
              เริ่มใช้งาน
            </button>
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}
