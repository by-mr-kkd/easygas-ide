import { NextResponse, type NextRequest } from "next/server";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { mapGoogleError } from "@/lib/api-helpers";
import { getClaspAccount } from "@/lib/clasp";
import { deployProject } from "@/lib/deploy";
import { probeExec } from "@/lib/gas-verify";
import { getCurrentUser, getProject } from "@/lib/projects";
import { snapshotProject } from "@/lib/versions";

export const runtime = "nodejs";
export const maxDuration = 300;

/** POST /api/deploy/[id] → push the project's files to the user's own Google account and publish. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  // Shared per-project lock with agent/verify: a double-click (or a deploy overlapping a generation)
  // must not create two scripts or push a half-written file set.
  const lock = await acquireProjectRun(id);
  if (!lock)
    return NextResponse.json(
      { error: "already_running", message: "โปรเจกต์นี้กำลังประมวลผลอยู่ รอให้เสร็จก่อนแล้วลองใหม่นะครับ" },
      { status: 409 },
    );

  try {
    const result = await deployProject(user.id, project);
    if (!result.unchanged) await snapshotProject(id, "deploy");
    // Auto-probe the live /exec for an immediate "opened OK / has a problem" verdict. Best-effort.
    let probe: Awaited<ReturnType<typeof probeExec>> | undefined;
    if (result.execUrl) {
      try {
        probe = await probeExec(result.execUrl);
      } catch {
        /* probe is a bonus — never fail the deploy over it */
      }
    }
    return NextResponse.json({ ok: true, ...result, probe });
  } catch (e) {
    return mapGoogleError(e, (await getClaspAccount().catch(() => null))?.email);
  } finally {
    await releaseProjectRun(id, lock);
  }
}
