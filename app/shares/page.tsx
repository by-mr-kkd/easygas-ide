import Link from "next/link";
import { ArrowPathIcon, ClockIcon, FireIcon } from "@heroicons/react/24/outline";
import { AppRail } from "@/components/AppRail";
import { AppStatusBar } from "@/components/AppStatusBar";
import { AppTopBar } from "@/components/AppTopBar";
import { SharesList } from "@/components/shares/SharesList";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { listSharesRemote, ShareApiError, type ShareList } from "@/lib/share/remote";
import { shareDateLabel } from "@/lib/share/summary";
import { getSetupStatus } from "@/lib/setup-status";

export const metadata = { title: "ระบบที่คนแชร์ — EasyGAS IDE" };

/**
 * ระบบที่คนแชร์: the website's public shares (the room "แชร์ระบบที่สร้าง" on the webboard), read inside the
 * app. Every card opens the clone box on the home screen; a GitHub-hosted share carries the Pro tag and the
 * website refuses its files to a Free user at that point.
 */
export default async function SharesPage({ searchParams }: { searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const params = await searchParams;
  const order = params.order === "clones" ? "clones" : "new";
  const [setup, result] = await Promise.all([
    getSetupStatus(),
    listSharesRemote(order).then(
      (list): { list: ShareList; error: null } => ({ list, error: null }),
      (e: unknown): { list: null; error: string } => ({ list: null, error: e instanceof ShareApiError ? e.message : "โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง" }),
    ),
  ]);
  const shares = result.list?.shares.map((s) => ({ ...s, dateLabel: shareDateLabel(s.createdAt) })) ?? [];

  return (
    <main className="flex min-h-screen flex-col bg-bg text-fg md:h-screen">
      <AppTopBar center={<span className="truncate text-sm font-semibold">ระบบที่คนแชร์</span>} right={<ThemeToggle className="md:hidden" />} />
      <div className="flex flex-1 md:min-h-0">
        <AppRail active="shares" />
        <section className="min-w-0 flex-1 md:min-h-0 md:overflow-y-auto md:bg-main">
          <div className="mx-auto flex w-full max-w-6xl flex-col gap-4 px-4 py-5 md:px-7 md:py-6">
            <header className="flex flex-wrap items-end justify-between gap-3">
              <div>
                <h1 className="text-xl font-semibold sm:text-[22px]">ระบบที่คนแชร์</h1>
                <p className="hint mt-0.5">โค้ดที่คนอื่นแชร์ไว้บนเว็บบอร์ด กดดูไฟล์และสิทธิ์ที่ขอ แล้วโคลนลงเครื่องได้เลย อันที่ติดป้าย Pro โคลนได้เฉพาะผู้ใช้ EasyGAS Pro</p>
              </div>
              <nav aria-label="เรียงลำดับ" className="seg">
                <Link href="/shares" aria-current={order === "new" ? "page" : undefined} className="seg-item">
                  <ClockIcon className="h-4 w-4" aria-hidden />
                  ใหม่ล่าสุด
                </Link>
                <Link href="/shares?order=clones" aria-current={order === "clones" ? "page" : undefined} className="seg-item">
                  <FireIcon className="h-4 w-4" aria-hidden />
                  โคลนมากสุด
                </Link>
              </nav>
            </header>

            {result.error ? (
              <div className="callout callout-warn flex-wrap items-center">
                <span className="min-w-0 flex-1">{result.error}</span>
                <Link href={order === "clones" ? "/shares?order=clones" : "/shares"} className="btn btn-secondary btn-sm">
                  <ArrowPathIcon className="h-4 w-4" aria-hidden />
                  ลองใหม่
                </Link>
              </div>
            ) : (
              <SharesList shares={shares} stale={result.list?.stale ?? false} />
            )}
          </div>
        </section>
      </div>
      <AppStatusBar setup={setup} />
    </main>
  );
}
