"use client";

import { CameraIcon, QrCodeIcon, ViewfinderCircleIcon } from "@heroicons/react/24/outline";
import { formatBaht } from "@/lib/donate";
import type { OfferView } from "@/lib/premium/types";

const ENABLES = [
  { Icon: CameraIcon, label: "ถ่ายรูป" },
  { Icon: QrCodeIcon, label: "สแกน QR" },
  { Icon: ViewfinderCircleIcon, label: "สแกนบาร์โค้ด" },
];

/** What premium is, in the owner's words. Prices come from the offer only. */
export function OfferCopy({ offer }: { offer: OfferView | null }) {
  const showPrice = offer?.open && offer.price !== null;
  const showPromo = showPrice && offer.promo && offer.regularPrice !== null && offer.regularPrice > (offer.price ?? 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg">
        Pro คือชุดคำสั่งที่ทำให้ AI สร้างเว็บแอปที่ใช้กล้องได้
      </p>
      <p className="hint">
        ตอนนี้ Google ไม่ให้เว็บแอปของ Google Apps Script เปิดกล้อง หน้าเว็บจึงถูกวางไว้บน GitHub ของคุณเอง
        ส่วนข้อมูลยังเก็บใน Google Sheets เหมือนเดิม
      </p>
      <ul className="flex flex-wrap gap-2" aria-label="สิ่งที่ทำได้">
        {ENABLES.map(({ Icon, label }) => (
          <li key={label} className="badge inline-flex items-center gap-1.5">
            <Icon className="h-4 w-4" aria-hidden="true" />
            {label}
          </li>
        ))}
      </ul>
      <div className="callout flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm text-fg">จ่ายครั้งเดียว ใช้ได้ตลอด</span>
        {showPrice && (
          <span className="flex items-baseline gap-2">
            {showPromo && <s className="text-sm text-muted">{formatBaht(offer.regularPrice!)}</s>}
            <span className="text-lg font-semibold text-fg">{formatBaht(offer.price!)} บาท</span>
          </span>
        )}
      </div>
      {showPromo && <p className="text-sm text-warn-text">โปรโมชันเปิดตัว ราคาพิเศษช่วงเวลาจำกัด</p>}
    </div>
  );
}
