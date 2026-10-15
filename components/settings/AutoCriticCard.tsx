"use client";

import { useState } from "react";
import { setAutoCriticAction } from "@/app/settings/actions";

/**
 * "ตรวจซ้ำตามกฎอัตโนมัติ" (default on): after a turn that changed files, the app has the picked AI read the
 * project again against the GAS rulebook and fix what it finds (lib/engines/cli-critic, the API loops' critic gate).
 * Off = only the manual "ตรวจหาบั๊ก" / "ให้ AI ตรวจซ้ำ" buttons.
 */
export function AutoCriticCard({ enabled }: { enabled: boolean }) {
  const [on, setOn] = useState(enabled);
  const [busy, setBusy] = useState(false);
  async function toggle(next: boolean) {
    setOn(next);
    setBusy(true);
    try {
      await setAutoCriticAction(next);
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="card p-4">
      <label className="flex cursor-pointer items-start gap-3">
        <input type="checkbox" checked={on} disabled={busy} onChange={(e) => toggle(e.target.checked)} className="mt-1" />
        <span className="min-w-0">
          <span className="block text-sm font-semibold">ให้ AI ตรวจงานตัวเองซ้ำตามกฎ GAS best practices หลังเขียนโค้ดเสร็จ</span>
          <span className="hint mt-1 block">
            AI ที่เขียนโปรเจกต์ใหญ่มักหลุดกฎบางข้อที่แนบไป เปิดไว้ แอปจะสั่งให้ AI ตัวเดิมอ่านโค้ดทั้งโปรเจกต์อีกรอบเทียบกับกฎแล้วแก้ให้เลย
            ทุกครั้งที่มีการแก้ไฟล์ (ใช้โควตาของ AI เพิ่ม 1–3 รอบต่อคำสั่ง) ปิดแล้วยังกด “ตรวจหาบั๊ก” เองได้
          </span>
        </span>
      </label>
    </section>
  );
}
