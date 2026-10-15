import { NextResponse } from "next/server";
import { readDeployProgress } from "@/lib/deploy-progress";

/**
 * GET /api/deploy-progress/<projectId> → where a publish to Google is (lib/deploy-progress.ts), or null.
 * Polled by the publish dialog while POST /api/deploy runs. Step names, times and a short Thai line only.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ progress: null }, { status: 400 });
  return NextResponse.json({ progress: readDeployProgress(id), now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
