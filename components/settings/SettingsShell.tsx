import Link from "next/link";
import type { ReactNode } from "react";
import {
  AcademicCapIcon,
  ArrowLeftIcon,
  BookOpenIcon,
  CpuChipIcon,
  DevicePhoneMobileIcon,
  FolderIcon,
  GlobeAltIcon,
  InformationCircleIcon,
  LifebuoyIcon,
  SparklesIcon,
  SwatchIcon,
} from "@heroicons/react/24/outline";
import { AppTopBar } from "@/components/AppTopBar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { readLessons } from "@/lib/lessons-store";
import { premiumStatus } from "@/lib/premium/status";
import { unreadAnswers } from "@/lib/support/fast-track";
import { getProject } from "@/lib/projects";
import type { SetupStatus } from "@/lib/setup-status";

export type SettingsSection = "ai" | "google" | "style" | "remote" | "premium" | "support" | "data";
export type KnowledgeSection = "rules" | "lessons";
type SectionId = SettingsSection | KnowledgeSection;

type SearchParams = Record<string, string | string[] | undefined>;

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

/** `?s=` → one of the page's sections; anything unknown falls back to the page's first one. */
export function pickSection<T extends string>(sp: SearchParams, allowed: readonly T[], fallback: T): T {
  const s = first(sp.s);
  return allowed.includes(s as T) ? (s as T) : fallback;
}

/** `?from=<projectId>`: the project the user came from, so "back" returns there. */
export function pickFrom(sp: SearchParams): string | null {
  const from = first(sp.from);
  return from && from.length <= 100 ? from : null;
}

const NAV_ICON: Record<SectionId, { Icon: typeof CpuChipIcon; tone: string }> = {
  ai: { Icon: CpuChipIcon, tone: "text-ai" },
  google: { Icon: GlobeAltIcon, tone: "text-info" },
  style: { Icon: SwatchIcon, tone: "text-accent-text" },
  remote: { Icon: DevicePhoneMobileIcon, tone: "text-info" },
  premium: { Icon: SparklesIcon, tone: "text-accent-text" },
  support: { Icon: LifebuoyIcon, tone: "text-warn-text" },
  data: { Icon: FolderIcon, tone: "text-muted" },
  rules: { Icon: BookOpenIcon, tone: "text-info" },
  lessons: { Icon: AcademicCapIcon, tone: "text-ai" },
};

const NAV: { heading: string; items: { id: SectionId; path: "/settings" | "/knowledge"; label: string }[] }[] = [
  {
    heading: "ทั่วไป",
    items: [
      { id: "ai", path: "/settings", label: "AI ที่ใช้สร้างโค้ด" },
      { id: "google", path: "/settings", label: "บัญชี Google" },
      { id: "style", path: "/settings", label: "สไตล์เริ่มต้น" },
      { id: "remote", path: "/settings", label: "ใช้จากมือถือ" },
      { id: "premium", path: "/settings", label: "Pro" },
      { id: "support", path: "/settings", label: "ช่วยเหลือ" },
      { id: "data", path: "/settings", label: "ข้อมูลในเครื่อง" },
    ],
  },
  {
    heading: "สิ่งที่ AI เรียนรู้",
    items: [
      { id: "rules", path: "/knowledge", label: "ชุดกฎ" },
      { id: "lessons", path: "/knowledge", label: "บทเรียนของฉัน" },
    ],
  },
];

// below md the nav is one scrolling row, so an item keeps its own width there
function NavIcon({ id }: { id: SectionId }) {
  const { Icon, tone } = NAV_ICON[id];
  return <Icon className={`h-4 w-4 shrink-0 ${tone}`} aria-hidden />;
}

const NAV_ITEM = "nav-item w-auto shrink-0 whitespace-nowrap md:w-full";

/**
 * The frame shared by /settings and /knowledge: top bar, a "back" link that remembers the project
 * the user came from, the section list (a left column from md up, one scrolling row below), and
 * the ONE section the page chose to render. Reads only local files — nothing here waits on the
 * network (`status` comes from the page's own getSetupStatus()).
 */
export async function SettingsShell({
  current,
  from,
  status,
  title,
  hint,
  children,
}: {
  current: SectionId;
  from: string | null;
  status: SetupStatus;
  title: string;
  hint: ReactNode;
  children: ReactNode;
}) {
  // local files only (premium.json is an offline signature check) — nothing here touches the network
  const [project, book, premium, answers] = await Promise.all([
    from ? getProject(from).catch(() => null) : null,
    readLessons(),
    premiumStatus(),
    unreadAnswers().catch(() => 0),
  ]);
  // only a project that still exists is carried along in the links
  const query = project ? `&from=${encodeURIComponent(project.id)}` : "";
  const pendingLessons = book.lessons.filter((l) => l.status === "pending").length;

  const badge = (id: SectionId): ReactNode => {
    if (id === "ai")
      return status.engineReady ? <span className="badge badge-ok">พร้อม</span> : <span className="badge badge-warn">ยังไม่พร้อม</span>;
    if (id === "google")
      // optional, so "not connected" stays neutral
      return status.google.loggedIn ? <span className="badge badge-ok">เชื่อมแล้ว</span> : <span className="badge">ยังไม่เชื่อม</span>;
    if (id === "premium" && premium.active) return <span className="badge badge-ok">เปิดใช้แล้ว</span>;
    if (id === "support" && answers > 0) return <span className="badge badge-ok">ตอบแล้ว {answers}</span>;
    if (id === "lessons" && pendingLessons > 0) return <span className="badge badge-warn">{pendingLessons}</span>;
    return null;
  };

  return (
    <div className="min-h-screen bg-bg">
      <AppTopBar center={<span className="truncate text-sm font-semibold">ตั้งค่า</span>} right={<ThemeToggle />} />
      <div className="mx-auto w-full max-w-5xl px-4 py-6 sm:px-6">
        <Link href={project ? `/projects/${project.id}` : "/projects"} className="btn btn-ghost btn-sm max-w-full">
          <ArrowLeftIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{project ? `กลับไปที่โปรเจกต์ ${project.name}` : "กลับไปหน้าโปรเจกต์"}</span>
        </Link>

        <div className="mt-4 md:grid md:grid-cols-[220px_minmax(0,1fr)] md:gap-8">
          <nav
            aria-label="หัวข้อการตั้งค่า"
            className="no-scrollbar -mx-4 mb-5 flex gap-1 overflow-x-auto border-b border-line px-4 pb-3 pt-1 sm:-mx-6 sm:px-6 md:sticky md:top-[4.5rem] md:mx-0 md:mb-0 md:block md:self-start md:overflow-visible md:border-0 md:p-0"
          >
            {NAV.map((group, i) => (
              <div key={group.heading} className={`flex shrink-0 gap-1 md:block md:space-y-0.5 ${i > 0 ? "md:mt-5" : ""}`}>
                <p className="hidden px-2.5 pb-1 text-xs font-semibold text-faint md:block">{group.heading}</p>
                {group.items.map((item) => (
                  <Link
                    key={item.id}
                    href={`${item.path}?s=${item.id}${query}`}
                    aria-current={item.id === current ? "page" : undefined}
                    className={NAV_ITEM}
                  >
                    <NavIcon id={item.id} />
                    <span className="md:min-w-0 md:flex-1 md:truncate">{item.label}</span>
                    {badge(item.id)}
                  </Link>
                ))}
              </div>
            ))}
            <div className="flex shrink-0 md:mt-5 md:block md:border-t md:border-line md:pt-3">
              <Link href={project ? `/about?from=${encodeURIComponent(project.id)}` : "/about"} className={NAV_ITEM}>
                <InformationCircleIcon className="h-4 w-4 shrink-0 text-muted" />
                เกี่ยวกับ
              </Link>
            </div>
          </nav>

          <main className="min-w-0 max-w-2xl pb-10">
            <h1 className="text-xl font-semibold">{title}</h1>
            <p className="hint mt-1">{hint}</p>
            <div className="mt-5">{children}</div>
          </main>
        </div>
      </div>
    </div>
  );
}
