"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, DocumentDuplicateIcon, MagnifyingGlassIcon, ShareIcon } from "@heroicons/react/24/outline";
import { ProTag } from "./ProTag";
import type { ShareSummary } from "@/lib/share/summary";

export type ShareCardData = ShareSummary & { dateLabel: string };

/**
 * The cards on "ระบบที่คนแชร์": what each share is, who made it, how often it was cloned. "ดูและโคลน" opens
 * the home screen's clone box with the share looked up (files, permissions, then clone); the Pro check
 * happens there, on the website's answer, so a Free user can still read every card.
 */
export function SharesList({ shares, stale }: { shares: ShareCardData[]; stale: boolean }) {
  const [query, setQuery] = useState("");
  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return shares;
    return shares.filter((s) => [s.title, s.description, s.author.name, ...s.services].some((x) => x.toLowerCase().includes(q)));
  }, [shares, query]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <label className="relative block w-full sm:w-72">
          <MagnifyingGlassIcon className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-faint" aria-hidden />
          <input
            type="search"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="ค้นหาชื่อระบบ ผู้แชร์ หรือบริการ เช่น Sheets"
            aria-label="ค้นหาระบบที่คนแชร์"
            className="field h-9 w-full pl-8 text-sm"
          />
        </label>
        <span className="hint ml-auto">
          {shown.length === shares.length ? `${shares.length} ระบบ` : `${shown.length} จาก ${shares.length} ระบบ`}
          {stale && " · ข้อมูลล่าสุดที่โหลดได้ (ติดต่อเว็บไม่ได้ตอนนี้)"}
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="hint py-8 text-center">{shares.length === 0 ? "ยังไม่มีระบบที่แชร์" : `ไม่มีระบบที่ตรงกับ “${query.trim()}”`}</p>
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {shown.map((s) => (
            <li key={s.slug} className="card flex flex-col gap-2.5 p-4">
              <div className="flex items-start gap-2.5">
                <span className={`icon-chip mt-0.5 ${s.proOnly ? "tone-warn" : "tone-accent"}`}>
                  <ShareIcon className="h-4 w-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-[15px] font-semibold leading-snug">{s.title}</h3>
                  <p className="hint truncate">
                    โดย {s.author.name} · {s.dateLabel} · โคลน {s.cloneCount} ครั้ง
                  </p>
                </div>
                {s.proOnly && <ProTag className="shrink-0" />}
              </div>
              {s.description && <p className="line-clamp-2 text-sm text-muted">{s.description}</p>}
              {s.services.length > 0 && (
                <div className="flex flex-wrap gap-1">
                  {s.services.map((x) => (
                    <span key={x} className="badge">
                      {x}
                    </span>
                  ))}
                </div>
              )}
              <div className="mt-auto flex items-center gap-2 pt-1">
                <Link href={`/projects?mode=clone&clone=${s.slug}`} className="btn btn-primary btn-sm">
                  <DocumentDuplicateIcon className="h-4 w-4" aria-hidden />
                  ดูและโคลน
                </Link>
                {s.url && (
                  <a href={s.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
                    <ArrowTopRightOnSquareIcon className="h-4 w-4" aria-hidden />
                    เปิดบนเว็บ
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
