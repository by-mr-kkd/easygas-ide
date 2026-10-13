import { NextResponse } from "next/server";
import { readProgress } from "@/lib/pages/progress";

/**
 * GET /api/pages-progress/<projectId> → where a GitHub Pages publish is (lib/pages/progress.ts), or null.
 * Polled by the publish dialog while publishPagesAction runs (a server action cannot be polled: Next queues it).
 * Step names, times and a short Thai line only — nothing secret.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ progress: null }, { status: 400 });
  return NextResponse.json({ progress: readProgress(id), now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
