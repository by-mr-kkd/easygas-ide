import Link from "next/link";
import { ArrowPathIcon, ClockIcon, FireIcon } from "@heroicons/react/24/outline";
import { SharesList } from "@/components/shares/SharesList";
import { listSharesRemote, ShareApiError, type ShareList } from "@/lib/share/remote";
import { shareDateLabel } from "@/lib/share/summary";

/**
 * ระบบที่คนแชร์ — a view of the home screen (`/projects?mode=shares`): the website's public shares (the room
 * "แชร์ระบบที่สร้าง" on the webboard). Every card opens the share-link view with that link filled in; a
 * GitHub-hosted share carries the Pro tag and the website refuses its files to a Free user at that point.
 * Rendered only when this view is open, so the home screen does not ask the website otherwise.
 */
export async function SharesView({ order }: { order: "new" | "clones" }) {
  const result = await listSharesRemote(order).then(
    (list): { list: ShareList; error: null } => ({ list, error: null }),
    (e: unknown): { list: null; error: string } => ({ list: null, error: e instanceof ShareApiError ? e.message : "โหลดรายการไม่สำเร็จ ลองใหม่อีกครั้ง" }),
  );
  const shares = result.list?.shares.map((s) => ({ ...s, dateLabel: shareDateLabel(s.createdAt) })) ?? [];
  const here = order === "clones" ? "/projects?mode=shares&order=clones" : "/projects?mode=shares";

  return (
    <>
      {/* a phone stacks the line above the sort switch; side by side it would squeeze the line into a column */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p className="hint min-w-0 sm:flex-1">โค้ดที่คนอื่นแชร์ไว้บนเว็บบอร์ด กดดูไฟล์และสิทธิ์ที่ขอ แล้วโคลนลงเครื่องได้เลย อันที่ติดป้าย Pro โคลนได้เฉพาะผู้ใช้ EasyGAS Pro</p>
        <nav aria-label="เรียงลำดับ" className="seg self-start sm:self-auto">
          <Link href="/projects?mode=shares" scroll={false} aria-current={order === "new" ? "page" : undefined} className="seg-item">
            <ClockIcon className="h-4 w-4" aria-hidden />
            ใหม่ล่าสุด
          </Link>
          <Link href="/projects?mode=shares&order=clones" scroll={false} aria-current={order === "clones" ? "page" : undefined} className="seg-item">
            <FireIcon className="h-4 w-4" aria-hidden />
            โคลนมากสุด
          </Link>
        </nav>
      </div>
      {result.error ? (
        <div className="callout callout-warn mt-2 flex-wrap items-center">
          <span className="min-w-0 flex-1">{result.error}</span>
          <Link href={here} className="btn btn-secondary btn-sm">
            <ArrowPathIcon className="h-4 w-4" aria-hidden />
            ลองใหม่
          </Link>
        </div>
      ) : (
        <div className="mt-2">
          <SharesList shares={shares} stale={result.list?.stale ?? false} />
        </div>
      )}
    </>
  );
}
