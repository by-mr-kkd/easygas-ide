import { NextResponse, type NextRequest } from "next/server";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { mapGoogleError } from "@/lib/api-helpers";
import { getClaspAccount } from "@/lib/clasp";
import { pushHeadPreview } from "@/lib/deploy";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const maxDuration = 120;

/** POST /api/preview/[id] → push current files to the script's HEAD and return its /dev URL. */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });
  if (!project.script_id)
    return NextResponse.json({ error: "NOT_DEPLOYED", message: "เผยแพร่ครั้งแรกก่อน แล้วค่อยเปิด /dev" }, { status: 400 });

  const lock = await acquireProjectRun(id);
  if (!lock)
    return NextResponse.json(
      { error: "already_running", message: "โปรเจกต์นี้กำลังประมวลผลอยู่ รอให้เสร็จก่อนนะครับ" },
      { status: 409 },
    );
  try {
    return NextResponse.json(await pushHeadPreview(project));
  } catch (e) {
    return mapGoogleError(e, (await getClaspAccount().catch(() => null))?.email);
  } finally {
    await releaseProjectRun(id, lock);
  }
}
