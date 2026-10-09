import Link from "next/link";
import { ArrowDownTrayIcon, Cog6ToothIcon, HomeIcon, ShareIcon, SwatchIcon } from "@heroicons/react/24/outline";
import { ThemeToggle } from "@/components/ui/ThemeToggle";

export type RailItem = "home" | "shares" | "google" | "styles" | "settings";

const ITEMS: { key: RailItem; href: string; label: string; Icon: typeof HomeIcon; tour?: string }[] = [
  { key: "home", href: "/projects", label: "หน้าหลัก", Icon: HomeIcon },
  { key: "shares", href: "/shares", label: "ที่คนแชร์", Icon: ShareIcon },
  { key: "google", href: "/projects?mode=existing", label: "Google", Icon: ArrowDownTrayIcon },
  { key: "styles", href: "/styleshopping", label: "สไตล์", Icon: SwatchIcon },
];

/**
 * The app's left rail on a wide window (the launcher screens: home, ระบบที่คนแชร์). One icon per place,
 * the current one marked; settings and the theme switch at the bottom. A phone gets the bottom tab bar
 * instead (components/MobileNav), so the rail hides below md.
 */
export function AppRail({ active }: { active: RailItem }) {
  return (
    <nav aria-label="เมนูหลัก" className="hidden w-16 shrink-0 flex-col border-r border-line bg-panel py-1.5 md:flex">
      {ITEMS.map(({ key, href, label, Icon }) => (
        <RailLink key={key} href={href} label={label} Icon={Icon} on={key === active} />
      ))}
      <span className="flex-1" />
      <div className="flex h-[58px] items-center justify-center">
        <ThemeToggle />
      </div>
      <RailLink href="/settings?s=ai" label="ตั้งค่า" Icon={Cog6ToothIcon} on={active === "settings"} tour="settings" />
    </nav>
  );
}

function RailLink({ href, label, Icon, on, tour }: { href: string; label: string; Icon: typeof HomeIcon; on: boolean; tour?: string }) {
  return (
    <Link
      href={href}
      aria-current={on ? "page" : undefined}
      data-tour={tour}
      className={`relative flex h-[58px] flex-col items-center justify-center gap-1 text-[10.5px] font-medium transition ${
        on ? "text-accent-text before:absolute before:bottom-3.5 before:left-0 before:top-3.5 before:w-[3px] before:rounded-r before:bg-accent" : "text-muted hover:text-fg"
      }`}
    >
      <Icon className={`h-5 w-5 ${on ? "stroke-2" : ""}`} aria-hidden />
      <span>{label}</span>
    </Link>
  );
}
