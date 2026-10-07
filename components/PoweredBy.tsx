import Link from "next/link";
import { FacebookIcon, GitHubIcon } from "@/components/ui/BrandIcons";
import { LINKS } from "@/lib/links";

/** Credit line at the bottom of the app's main pages: About, the users' group and the source code. */
export function PoweredBy() {
  return (
    <footer className="hint relative flex flex-wrap items-center justify-center gap-x-3 gap-y-1.5 px-4 py-5 text-center">
      <span>
        EasyGAS IDE · Powered by <span className="font-semibold text-fg">Mr.KKD</span> ·{" "}
        <Link href="/about" className="link">
          เกี่ยวกับ
        </Link>
      </span>
      <span className="flex items-center gap-1">
        <a href={LINKS.facebookGroup} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          <FacebookIcon className="h-4 w-4 text-[#1877F2]" />
          กลุ่ม Facebook
        </a>
        <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm">
          <GitHubIcon className="h-4 w-4" />
          GitHub
        </a>
      </span>
    </footer>
  );
}
