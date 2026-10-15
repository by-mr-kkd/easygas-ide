import { NextResponse, type NextRequest } from "next/server";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { mapGoogleError } from "@/lib/api-helpers";
import { getClaspAccount } from "@/lib/clasp";
import { deployProject } from "@/lib/deploy";
import { finishDeployProgress, noteDeployStep, startDeployProgress } from "@/lib/deploy-progress";
import { probeExec } from "@/lib/gas-verify";
import { getCurrentUser, getProject } from "@/lib/projects";
import { snapshotProject } from "@/lib/versions";
import { getFile } from "@/lib/files";
import { runUrlFor } from "@/lib/run-link";
import { reportClonePublished } from "@/lib/share/source";

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
  const lock = await acquireProjectRun(id, "deploy");
  if (!lock)
    return NextResponse.json(
      { error: "already_running", message: "โปรเจกต์นี้กำลังประมวลผลอยู่ รอให้เสร็จก่อนแล้วลองใหม่นะครับ" },
      { status: 409 },
    );

  // the publish dialog follows the steps through GET /api/deploy-progress/<id>
  startDeployProgress(id);
  try {
    const result = await deployProject(user.id, project, { onStep: (s, d) => noteDeployStep(id, s, d ?? null) });
    if (!result.unchanged) await snapshotProject(id, "deploy");
    void reportClonePublished(id); // a clone in use: its share's reviews read "ใช้งานจริง" (best effort, once)
    // Auto-probe the live /exec for an immediate "opened OK / has a problem" verdict. Best-effort.
    let probe: Awaited<ReturnType<typeof probeExec>> | undefined;
    if (result.execUrl) {
      noteDeployStep(id, "probe", "เปิดลิงก์ของแอปดูว่าโหลดได้");
      try {
        probe = await probeExec(result.execUrl);
      } catch {
        /* probe is a bonus — never fail the deploy over it */
      }
    }
    // a public app opens through run.easygaside.tech (lib/run-link.ts); the /exec link stays for the owner's Allow
    const runUrl = runUrlFor(result.execUrl, (await getFile(id, "appsscript.json").catch(() => null))?.content);
    finishDeployProgress(id);
    return NextResponse.json({ ok: true, ...result, runUrl, probe });
  } catch (e) {
    finishDeployProgress(id, "เผยแพร่ไม่สำเร็จ");
    return mapGoogleError(e, (await getClaspAccount().catch(() => null))?.email);
  } finally {
    await releaseProjectRun(id, lock);
  }
}
