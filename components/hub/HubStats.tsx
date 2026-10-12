"use client";

import Link from "next/link";
import { ChartBarIcon, EyeIcon } from "@heroicons/react/24/outline";
import type { HubDoc } from "@/lib/hub/doc";
import type { EditorState } from "./HubEditor";
import { ItemIcon } from "./HubLinks";

/** Views of the page (all time) and clicks per link over the last 30 days — counts only, nothing about visitors. Pro. */
export function HubStats({ hub, doc }: { hub: EditorState; doc: HubDoc }) {
  if (!hub.proActive)
    return (
      <div className="card flex flex-col gap-2 p-5">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <ChartBarIcon className="h-4 w-4" /> สถิติ <span className="pro-badge">PRO</span>
        </p>
        <p className="hint">ดูว่าลิงก์ไหนมีคนกดมากที่สุด และหน้ามีคนเปิดกี่ครั้ง (นับจำนวนเท่านั้น ไม่เก็บข้อมูลคนเปิด)</p>
        <Link href="/settings?s=premium" className="btn btn-soft tone-warn btn-sm self-start">
          ดู Pro
        </Link>
      </div>
    );
  const items = doc.sections.flatMap((s) => s.items.map((i) => ({ ...i, section: s.title, n: hub.clicks[i.id] ?? 0 }))).sort((a, b) => b.n - a.n);
  const max = Math.max(1, ...items.map((i) => i.n));
  const total = items.reduce((n, i) => n + i.n, 0);
  return (
    <div className="flex flex-col gap-4">
      <div className="grid grid-cols-2 gap-3">
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <EyeIcon className="h-4 w-4" /> เปิดหน้า (ทั้งหมด)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{hub.views.toLocaleString("th-TH")}</p>
        </div>
        <div className="card p-4">
          <p className="flex items-center gap-1.5 text-xs text-muted">
            <ChartBarIcon className="h-4 w-4" /> กดลิงก์ (30 วัน)
          </p>
          <p className="mt-1 text-2xl font-bold tabular-nums">{total.toLocaleString("th-TH")}</p>
        </div>
      </div>
      <div className="card p-4">
        <p className="text-sm font-semibold">ลิงก์ที่คนกด (30 วันล่าสุด)</p>
        {items.length === 0 ? (
          <p className="hint mt-2 text-xs">ยังไม่มีลิงก์</p>
        ) : (
          <ul className="mt-3 flex flex-col gap-2.5">
            {items.map((i) => (
              <li key={i.id} className="flex items-center gap-3">
                <ItemIcon item={i} />
                <span className="min-w-0 flex-1">
                  <span className="flex items-baseline gap-2">
                    <span className="truncate text-sm font-medium">{i.title}</span>
                    <span className="ml-auto shrink-0 text-sm font-semibold tabular-nums">{i.n.toLocaleString("th-TH")}</span>
                  </span>
                  <span className="mt-1 block h-1.5 overflow-hidden rounded-full bg-sunken">
                    <span className="block h-full rounded-full bg-accent" style={{ width: `${(i.n / max) * 100}%` }} />
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint mt-3 text-xs">นับเฉพาะจำนวนครั้ง ไม่เก็บข้อมูลของคนที่เปิด</p>
      </div>
    </div>
  );
}
