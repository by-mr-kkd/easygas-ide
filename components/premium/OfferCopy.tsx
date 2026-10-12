"use client";

import {
  BellAlertIcon,
  CameraIcon,
  ChatBubbleLeftRightIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  QrCodeIcon,
  ViewfinderCircleIcon,
} from "@heroicons/react/24/outline";
import { formatBaht } from "@/lib/donate";
import type { OfferView } from "@/lib/premium/types";

/** Everything Pro unlocks, each with one plain line. Keep in step with lib/pro-features.ts and the remote Pro parts. */
const FEATURES = [
  {
    Icon: GlobeAltIcon,
    title: "วางหน้าเว็บบน GitHub Pages",
    body: "ได้ลิงก์ของคุณเอง (ชื่อ.github.io) ข้อมูลยังเก็บใน Google Sheets เหมือนเดิม",
  },
  {
    Icon: DevicePhoneMobileIcon,
    title: "ติดตั้งเป็นแอปบนมือถือ",
    body: "มีไอคอนบนหน้าจอ เปิดเต็มจอเหมือนแอปทั่วไป ไม่มีแถบเบราว์เซอร์",
  },
  {
    Icon: BellAlertIcon,
    title: "แจ้งเตือนในแอป",
    body: "กระดิ่งและแถบเด้งเมื่อมีรายการใหม่ ขณะเปิดแอปอยู่",
  },
  {
    Icon: CameraIcon,
    title: "ใช้กล้องได้",
    body: "Google ไม่ให้เว็บแอปของ Apps Script เปิดกล้อง หน้าเว็บบน GitHub เปิดได้",
    chips: [
      { Icon: CameraIcon, label: "ถ่ายรูป" },
      { Icon: QrCodeIcon, label: "สแกน QR" },
      { Icon: ViewfinderCircleIcon, label: "สแกนบาร์โค้ด" },
    ],
  },
  {
    Icon: DevicePhoneMobileIcon,
    title: "ใช้ EasyGAS IDE จากมือถือได้เต็มที่",
    body: "ลิงก์ถาวรตั้งชื่อเองได้ แอปบนมือถือ และแจ้งเตือนเมื่อ AI ทำงานเสร็จ",
  },
  {
    Icon: ChatBubbleLeftRightIcon,
    title: "ถามแอดมินได้ในหน้าเขียนโค้ด (Fast Track)",
    body: "ส่งคำถามพร้อมข้อมูลโปรเจกต์ได้เลย ไม่ต้องออกไปที่อื่น",
  },
];

/** What Pro is, in the owner's words. Prices come from the offer only. */
export function OfferCopy({ offer }: { offer: OfferView | null }) {
  const showPrice = offer?.open && offer.price !== null;
  const showPromo = showPrice && offer.promo && offer.regularPrice !== null && offer.regularPrice > (offer.price ?? 0);
  return (
    <div className="space-y-3">
      <p className="text-sm text-fg">Pro ปลดล็อกสิ่งที่เว็บแอปของ Google ทำเองไม่ได้ และทำให้ใช้ EasyGAS จากมือถือได้สะดวกขึ้น</p>
      <ul className="space-y-2.5" aria-label="สิ่งที่ได้ใน Pro">
        {FEATURES.map((f) => (
          <li key={f.title} className="flex items-start gap-2.5">
            <span className="icon-chip tone-accent shrink-0">
              <f.Icon className="h-4 w-4" aria-hidden="true" />
            </span>
            <span className="min-w-0">
              <span className="block text-[13.5px] font-semibold leading-snug text-fg">{f.title}</span>
              <span className="hint block text-xs">{f.body}</span>
              {f.chips && (
                <span className="mt-1.5 flex flex-wrap gap-1.5">
                  {f.chips.map(({ Icon, label }) => (
                    <span key={label} className="badge inline-flex items-center gap-1">
                      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
                      {label}
                    </span>
                  ))}
                </span>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="callout flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <span className="text-sm text-fg">จ่ายครั้งเดียว ใช้ได้ตลอด</span>
        {showPrice && (
          <span className="flex items-baseline gap-2">
            {/* the old price struck through in red, the price paid now in green */}
            {showPromo && <s className="text-sm font-medium text-danger">{formatBaht(offer.regularPrice!)}</s>}
            <span className="text-lg font-semibold text-accent-text">{formatBaht(offer.price!)} บาท</span>
          </span>
        )}
      </div>
      {showPromo && <p className="text-sm text-warn-text">โปรโมชันเปิดตัว ราคาพิเศษช่วงเวลาจำกัด</p>}
    </div>
  );
}
