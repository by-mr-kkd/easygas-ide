import Link from "next/link";
import { ArrowDownTrayIcon, LinkIcon, SparklesIcon } from "@heroicons/react/24/outline";

export type StartMode = "new" | "existing" | "clone";

const MODES = [
  { key: "new", href: "/projects", Icon: SparklesIcon, color: "text-ai", title: "สร้างระบบใหม่", hint: "เล่าสิ่งที่อยากได้ AI เขียนให้" },
  { key: "existing", href: "/projects?mode=existing", Icon: ArrowDownTrayIcon, color: "text-info", title: "แก้สคริปต์จาก Google", hint: "ดึงสคริปต์ที่มีอยู่ในบัญชีมาแก้ต่อ" },
  { key: "clone", href: "/projects?mode=clone", Icon: LinkIcon, color: "text-accent-text", title: "โคลนจากลิงก์", hint: "วางลิงก์แชร์ easygaside.tech/s/…" },
] as const;

/** The query string value for the mode, defaulting to "new" for anything else. */
export const startModeFrom = (value: string | string[] | undefined): StartMode => (value === "existing" ? "existing" : value === "clone" ? "clone" : "new");

/**
 * The switch at the top of the home screen's work box: build something new, work on a script already on
 * Google, or clone code someone shared as an EasyGAS link. Real tabs: the box under them changes, the
 * rest of the screen stays. The mode lives in the URL so a link (and the easygas:// protocol) can open any one.
 */
export function StartModeTabs({ active }: { active: StartMode }) {
  return (
    <nav aria-label="เริ่มงาน" data-tour="start-modes" className="seg no-scrollbar max-w-full overflow-x-auto">
      {MODES.map((m) => {
        const on = m.key === active;
        return (
          <Link key={m.key} href={m.href} aria-current={on ? "page" : undefined} title={m.hint} className="seg-item h-8 shrink-0">
            <m.Icon className={`h-4 w-4 ${m.color}`} aria-hidden />
            {m.title}
          </Link>
        );
      })}
    </nav>
  );
}
