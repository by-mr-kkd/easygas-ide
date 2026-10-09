import Link from "next/link";
import { ShareIcon } from "@heroicons/react/24/outline";
import { ProTag } from "@/components/shares/ProTag";
import type { ShareList } from "@/lib/share/remote";

const SHOWN = 4;

/**
 * Home screen, right column: the newest shares on the website, the way the webboard's "แชร์ระบบที่สร้าง"
 * room shows them. A row opens the clone box with that share looked up; "ดูทั้งหมด" is the full screen.
 * `list` is null when the website did not answer and nothing was cached.
 */
export function SharedLatest({ list }: { list: ShareList | null }) {
  return (
    <section aria-labelledby="shared-title" className="min-w-0">
      <div className="mb-1 flex items-center justify-between gap-2">
        <h2 id="shared-title" className="text-[12.5px] font-semibold text-muted">
          ระบบที่คนแชร์ล่าสุด
        </h2>
        <Link href="/shares" className="link text-[12.5px] no-underline">
          ดูทั้งหมด
        </Link>
      </div>
      {!list ? (
        <p className="hint py-2">
          โหลดรายการจากเว็บไม่ได้ตอนนี้ ·{" "}
          <Link href="/shares" className="link">
            ลองอีกครั้ง
          </Link>
        </p>
      ) : list.shares.length === 0 ? (
        <p className="hint py-2">ยังไม่มีระบบที่แชร์</p>
      ) : (
        <ul className="-mx-2 flex flex-col">
          {list.shares.slice(0, SHOWN).map((s) => (
            <li key={s.slug}>
              <Link href={`/projects?mode=clone&clone=${s.slug}`} className="flex min-h-11 items-center gap-2.5 rounded-lg px-2 py-1.5 transition hover:bg-sunken">
                <span className={`icon-chip shrink-0 ${s.proOnly ? "tone-warn" : "tone-accent"}`}>
                  <ShareIcon className="h-4 w-4" aria-hidden />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[13.5px] font-medium leading-snug">{s.title}</span>
                  <span className="block truncate text-[11.5px] leading-snug text-muted">
                    โดย {s.author.name} · โคลน {s.cloneCount} ครั้ง
                  </span>
                </span>
                {s.proOnly && <ProTag className="shrink-0" />}
              </Link>
            </li>
          ))}
        </ul>
      )}
      {list?.stale && <p className="hint mt-1 text-[11.5px]">ข้อมูลล่าสุดที่โหลดได้ (ติดต่อเว็บไม่ได้ตอนนี้)</p>}
    </section>
  );
}
