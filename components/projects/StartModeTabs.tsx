import Link from "next/link";
import { ArrowDownTrayIcon, SparklesIcon } from "@heroicons/react/24/outline";

export type StartMode = "new" | "existing";

const MODES = [
  {
    key: "new",
    href: "/projects",
    Icon: SparklesIcon,
    title: "สร้างระบบใหม่",
    hint: "เล่าสิ่งที่อยากได้ AI เขียนให้",
  },
  {
    key: "existing",
    href: "/projects?mode=existing",
    Icon: ArrowDownTrayIcon,
    title: "แก้ไขสคริปต์ที่มีอยู่",
    hint: "ดึงจาก Google มาแก้ต่อ",
  },
] as const;

/** The query string value for the mode, defaulting to "new" for anything else. */
export const startModeFrom = (value: string | string[] | undefined): StartMode => (value === "existing" ? "existing" : "new");

/**
 * The two tabs on the home screen: build something new, or work on a script already on Google. Real
 * tabs: the panel under them changes, the rest of the screen stays. The mode lives in the URL so a
 * link can open either one.
 */
export function StartModeTabs({ active }: { active: StartMode }) {
  return (
    <nav aria-label="เริ่มงาน" data-tour="start-modes" className="flex gap-1 rounded-t-xl border border-b-0 border-line bg-sunken p-1">
      {MODES.map((m) => {
        const on = m.key === active;
        return (
          <Link
            key={m.key}
            href={m.href}
            aria-current={on ? "page" : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2.5 rounded-lg px-3 py-2 transition ${
              on ? "bg-surface shadow-sm" : "hover:bg-surface/60"
            }`}
          >
            <span className={`icon-chip shrink-0 ${m.key === "new" ? "tone-ai" : "tone-info"}`}>
              <m.Icon className="h-4 w-4" />
            </span>
            <span className="min-w-0">
              <span className={`block truncate text-sm font-semibold ${on ? "text-fg" : "text-muted"}`}>{m.title}</span>
              <span className="hint hidden truncate sm:block">{m.hint}</span>
            </span>
          </Link>
        );
      })}
    </nav>
  );
}
