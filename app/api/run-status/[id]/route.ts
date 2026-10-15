import { NextResponse } from "next/server";
import { readRunStatus } from "@/lib/agent-lock";

/**
 * GET /api/run-status/<projectId> → { run: { kind, startedAt, text } | null, now }: the run holding the project
 * right now (an AI turn, the re-check, a publish) and the last status line it streamed. The chat polls it for a
 * run this page did not start — a phone, another tab, a reload that cut the stream — and shows the same line
 * the starting page sees, then reloads the page with the result when the run ends. A route, not a server action:
 * Next queues actions behind a running one. Short Thai text only, nothing secret.
 */
export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ID = /^[0-9a-f-]{36}$/i;

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!ID.test(id)) return NextResponse.json({ run: null }, { status: 400 });
  return NextResponse.json({ run: readRunStatus(id), now: Date.now() }, { headers: { "cache-control": "no-store" } });
}
