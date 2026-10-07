"use client";

import { useEffect, useMemo, useRef } from "react";
import type { StyleCategory } from "@/lib/style-catalog";

// Rail headings → category ids from lib/style-catalog.ts. A category missing from this table is
// not lost: it lands in a final "อื่น ๆ" group, so growing the catalog can't make one vanish.
const CATEGORY_GROUPS: { title: string; ids: string[] }[] = [
  { title: "โครงหน้า", ids: ["nav", "theme"] },
  { title: "องค์ประกอบ", ids: ["buttons", "forms", "feedback", "data", "search"] },
  { title: "ระบบ", ids: ["auth", "admin", "workflow", "notify", "auto", "report"] },
  { title: "อุปกรณ์", ids: ["media", "map"] },
  { title: "ธุรกิจไทย", ids: ["thai", "robust"] },
];
const OTHER_GROUP_TITLE = "อื่น ๆ";

function groupCategories(categories: StyleCategory[]): { title: string; items: StyleCategory[] }[] {
  const byId = new Map(categories.map((c) => [c.id, c]));
  const grouped = new Set(CATEGORY_GROUPS.flatMap((g) => g.ids));
  const groups = CATEGORY_GROUPS.map((g) => ({
    title: g.title,
    items: g.ids.map((id) => byId.get(id)).filter((c): c is StyleCategory => !!c),
  }));
  const rest = categories.filter((c) => !grouped.has(c.id));
  return [...groups, { title: OTHER_GROUP_TITLE, items: rest }].filter((g) => g.items.length > 0);
}

/** Category picker: a grouped side rail from md up, ONE horizontally scrolling row below it. */
export function CategoryNav({
  categories,
  activeId,
  selectedCounts,
  onPick,
  inert,
}: {
  categories: StyleCategory[];
  activeId: string;
  selectedCounts: Record<string, number>;
  onPick: (id: string) => void;
  inert?: boolean;
}) {
  const scrollRef = useRef<HTMLElement>(null);
  const groups = useMemo(() => groupCategories(categories), [categories]);

  // a desktop mouse can't scroll a horizontal strip — translate vertical wheel into horizontal scroll.
  // (native listener with passive:false because React's onWheel is passive and can't preventDefault)
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const onWheel = (e: WheelEvent) => {
      if (el.scrollWidth <= el.clientWidth) return; // side rail (md up) — nothing to scroll sideways
      if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) return; // already a horizontal gesture (trackpad)
      el.scrollLeft += e.deltaY;
      e.preventDefault();
    };
    el.addEventListener("wheel", onWheel, { passive: false });
    return () => el.removeEventListener("wheel", onWheel);
  }, []);

  return (
    <nav
      ref={scrollRef}
      aria-label="หมวดสไตล์"
      inert={inert}
      // -m-1 p-1: room for the focus ring, which the scroll box would otherwise clip
      className="-m-1 flex min-w-0 gap-1.5 overflow-x-auto p-1 max-md:[scrollbar-width:none] md:sticky md:top-4 md:block md:max-h-[calc(100vh-9.5rem)] md:self-start md:overflow-y-auto md:overflow-x-hidden xl:max-h-[calc(100vh-5.5rem)]"
    >
      {groups.map((g) => (
        <div key={g.title} className="contents md:mb-3 md:block md:last:mb-0">
          <div className="mb-1 hidden px-2.5 text-xs font-semibold text-faint md:block">{g.title}</div>
          {g.items.map((c) => {
            const count = selectedCounts[c.id] ?? 0;
            return (
              <button
                key={c.id}
                type="button"
                onClick={() => onPick(c.id)}
                aria-current={activeId === c.id ? "true" : undefined}
                className="nav-item w-auto shrink-0 whitespace-nowrap border border-line md:w-full md:border-transparent"
              >
                <span className="min-w-0 flex-1 truncate">{c.title}</span>
                {count > 0 && (
                  <span className="badge badge-ok" aria-label={`เลือกแล้ว ${count} รายการ`}>
                    {count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      ))}
    </nav>
  );
}
