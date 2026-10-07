import { NextResponse } from "next/server";
import pkg from "@/package.json";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Liveness probe — the desktop shell polls this until the local server is ready to show. */
export function GET() {
  return NextResponse.json({ status: "ok", service: "easygas-ide", version: pkg.version, time: new Date().toISOString() });
}
