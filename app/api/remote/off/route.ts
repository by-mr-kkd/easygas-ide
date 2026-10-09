import { NextResponse } from "next/server";
import { isRemoteRequest } from "@/lib/remote/request";
import { setRemoteEnabled } from "@/lib/remote/runtime";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * POST /api/remote/off — the tray menu's "ปิดรีโมท" (electron/main.js). Loopback only like every route
 * (middleware.ts), and never through the gateway: a phone cannot switch off the computer's own setting.
 */
export async function POST() {
  if (await isRemoteRequest()) return NextResponse.json({ error: "forbidden" }, { status: 403 });
  await setRemoteEnabled(false);
  return NextResponse.json({ ok: true });
}
