"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { PhotoIcon } from "@heroicons/react/24/outline";
import { submitPremiumSlipAction } from "@/app/premium/actions";
import { donationPayload, formatBaht, maskPromptPayId } from "@/lib/donate";
import { SLIP_REJECT_TEXT, type OrderView, type PremiumStatus } from "@/lib/premium/types";
import { SLIP_ACCEPT, shrinkSlipImage } from "./shrink-image";

/**
 * Mode "slip": a PromptPay QR for the exact amount (same generator as the donate page), then the slip
 * image goes to the server, which checks it and hands back the licence key.
 */
export function SlipPayment({ order, onPaid }: { order: OrderView; onPaid: (status: PremiumStatus) => void }) {
  const [qr, setQr] = useState<string | null>(null);
  const [qrError, setQrError] = useState<string | null>(null);
  const [slipError, setSlipError] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const fileRef = useRef<HTMLInputElement>(null);

  const promptpayId = order.promptpayId;

  useEffect(() => {
    setQr(null);
    setQrError(null);
    if (!promptpayId) {
      setQrError("เซิร์ฟเวอร์ไม่ได้ส่งเลขพร้อมเพย์มา ลองปิดแล้วเปิดใหม่");
      return;
    }
    const payload = donationPayload(promptpayId, order.amount);
    if (!payload) {
      setQrError("สร้าง QR ไม่ได้ เลขพร้อมเพย์ของผู้รับไม่ถูกต้อง");
      return;
    }
    let cancelled = false;
    import("qrcode")
      .then((m) => m.toDataURL(payload, { errorCorrectionLevel: "M", margin: 2, width: 560 }))
      .then((dataUrl) => {
        if (!cancelled) setQr(dataUrl);
      })
      .catch(() => {
        if (!cancelled) setQrError("สร้าง QR ไม่สำเร็จ");
      });
    return () => {
      cancelled = true;
    };
  }, [promptpayId, order.amount]);

  function onFile(file: File | undefined) {
    if (!file) return;
    setSlipError(null);
    setFileName(file.name);
    start(async () => {
      let image: string;
      try {
        image = await shrinkSlipImage(file);
      } catch (e) {
        setSlipError(e instanceof Error ? e.message : "อ่านรูปไม่ได้");
        return;
      }
      const r = await submitPremiumSlipAction(image);
      if (!r.ok) {
        setSlipError(r.error);
        return;
      }
      if (r.data.status === "paid") {
        onPaid(r.data.premium);
        return;
      }
      setSlipError(r.data.status === "rejected" ? SLIP_REJECT_TEXT[r.data.reason] : "ระบบตรวจสลิปไม่พร้อมใช้งานชั่วคราว ลองใหม่ในอีกสักครู่ สลิปของคุณยังใช้ได้");
      if (fileRef.current) fileRef.current.value = "";
    });
  }

  return (
    <div className="space-y-4">
      <div className="grid place-items-center rounded-lg border border-line bg-sunken p-3" aria-live="polite">
        {qr ? (
          <div className="w-full text-center">
            {/* eslint-disable-next-line @next/next/no-img-element -- a data: URL drawn on this machine */}
            <img src={qr} alt={`QR พร้อมเพย์ ${formatBaht(order.amount)} บาท`} width={240} height={240} className="mx-auto h-auto w-full max-w-[240px] rounded-lg bg-white" />
            <p className="mt-2 text-lg font-semibold text-fg">{formatBaht(order.amount)} บาท</p>
            {promptpayId && <p className="hint">พร้อมเพย์ {maskPromptPayId(promptpayId)}</p>}
          </div>
        ) : qrError ? (
          <p className="text-sm text-danger">{qrError}</p>
        ) : (
          <p className="hint">กำลังสร้าง QR…</p>
        )}
      </div>
      <p className="hint">สแกน QR ด้วยแอปธนาคารแล้วโอนให้ตรงจำนวน จากนั้นแนบรูปสลิปที่นี่ รหัสจะออกให้ทันทีเมื่อตรวจผ่าน</p>

      <div>
        <input
          ref={fileRef}
          id="premium-slip"
          type="file"
          accept={SLIP_ACCEPT}
          className="sr-only"
          disabled={pending}
          onChange={(e) => onFile(e.target.files?.[0])}
        />
        <label htmlFor="premium-slip" className={`btn btn-primary w-full justify-center ${pending ? "pointer-events-none opacity-60" : "cursor-pointer"}`}>
          <PhotoIcon className="h-4 w-4" aria-hidden="true" />
          {pending ? "กำลังตรวจสลิป…" : fileName ? "แนบสลิปใบใหม่" : "แนบรูปสลิป"}
        </label>
        {fileName && !pending && !slipError && <p className="hint mt-1 truncate">{fileName}</p>}
        {slipError && (
          <p role="alert" className="mt-2 text-sm text-danger">
            {slipError}
          </p>
        )}
      </div>
    </div>
  );
}
