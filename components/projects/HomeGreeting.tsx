"use client";

import { useEffect, useState } from "react";
import { MoonIcon, RocketLaunchIcon, SparklesIcon, SunIcon } from "@heroicons/react/24/outline";

type Part = { greet: string; line: string; Icon: typeof SunIcon; tone: string };

/** the greeting follows the computer's clock; 00:00–04:59 is late night, not evening */
function partOfDay(h: number): Part {
  if (h >= 5 && h < 12) return { greet: "สวัสดีตอนเช้า", line: "เริ่มวันใหม่ด้วยเครื่องมือดี ๆ สักตัว แล้วงานทั้งวันจะง่ายขึ้น", Icon: SunIcon, tone: "tone-warn" };
  if (h >= 12 && h < 17) return { greet: "สวัสดีตอนบ่าย", line: "มีงานไหนที่ทำซ้ำทุกวัน เล่าให้ AI ฟัง แล้วให้มันทำเป็นระบบให้", Icon: SunIcon, tone: "tone-info" };
  if (h >= 17 && h < 21) return { greet: "สวัสดีตอนเย็น", line: "ใกล้เลิกงานแล้ว ปิดงานที่ค้างไว้ให้จบ พรุ่งนี้จะได้เริ่มสบาย ๆ", Icon: SparklesIcon, tone: "tone-accent" };
  if (h >= 21) return { greet: "สวัสดีตอนค่ำ", line: "ค่ำแล้ว ทำต่ออีกนิดได้ แต่อย่าลืมพักผ่อนด้วย", Icon: MoonIcon, tone: "tone-ai" };
  return { greet: "ดึกแล้วนะ", line: "ยังทำงานอยู่อีกเหรอ บันทึกงานไว้ แล้วไปพักสายตาบ้าง", Icon: MoonIcon, tone: "tone-ai" };
}

const dateLabel = (d: Date) => d.toLocaleDateString("th-TH", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const timeLabel = (d: Date) => d.toLocaleTimeString("th-TH", { hour: "2-digit", minute: "2-digit" });

/**
 * The home screen's header: greeting by the time of day, today's date and clock, and the project count.
 * Starts from the server's `now` (the same machine) so the first paint matches, then ticks each 20 s so a
 * window left open overnight does not keep saying "ตอนเย็น".
 */
export function HomeGreeting({ now, projects, deployed }: { now: number; projects: number; deployed: number }) {
  const [time, setTime] = useState(() => new Date(now));
  useEffect(() => {
    setTime(new Date());
    const id = setInterval(() => setTime(new Date()), 20_000);
    return () => clearInterval(id);
  }, []);
  const { greet, line, Icon, tone } = partOfDay(time.getHours());

  return (
    <header
      className={`${tone} relative overflow-hidden rounded-2xl border border-line px-4 py-4 sm:px-5`}
      style={{ background: "linear-gradient(105deg, var(--tone-soft) 0%, transparent 75%)" }}
    >
      {/* the big faint icon on the right is decoration only */}
      <Icon className="pointer-events-none absolute -right-4 -top-6 h-36 w-36 opacity-[0.07]" style={{ color: "var(--tone)" }} aria-hidden />
      <div className="relative flex flex-wrap items-center gap-x-4 gap-y-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface shadow-sm" style={{ color: "var(--tone)" }}>
          <Icon className="h-6 w-6" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h1 className="text-xl font-semibold sm:text-2xl">{greet}</h1>
          <p className="hint">{line}</p>
          <p className="mt-1 text-[12px] text-muted" suppressHydrationWarning>
            {dateLabel(time)} · <span className="tabular-nums">{timeLabel(time)} น.</span>
          </p>
        </div>
        {projects > 0 && (
          <div className="flex shrink-0 gap-2 text-[12.5px]">
            <span className="rounded-lg border border-line bg-surface px-3 py-1.5">
              <b className="tabular-nums text-fg">{projects}</b> <span className="text-muted">โปรเจกต์</span>
            </span>
            {deployed > 0 && (
              <span className="flex items-center gap-1.5 rounded-lg border border-line bg-surface px-3 py-1.5">
                <RocketLaunchIcon className="h-3.5 w-3.5 text-accent-text" aria-hidden />
                <b className="tabular-nums text-fg">{deployed}</b> <span className="text-muted">เผยแพร่แล้ว</span>
              </span>
            )}
          </div>
        )}
      </div>
    </header>
  );
}
