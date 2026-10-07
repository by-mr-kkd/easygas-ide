import { NextResponse, type NextRequest } from "next/server";
import { isProjectBusy } from "@/lib/agent-lock";
import { writeFile } from "@/lib/files";
import { getProject } from "@/lib/projects";
import { snapshotProject } from "@/lib/versions";

export const runtime = "nodejs";

const VALID_PATH = /^[A-Za-z0-9_-]+\.(gs|html|json)$/;

/** PUT /api/files/[id]  body { path, content } — autosave editor edits to the project folder. */
export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let path = "";
  let content = "";
  try {
    const body = (await req.json()) as { path?: string; content?: string };
    path = String(body.path ?? "");
    content = String(body.content ?? "");
  } catch {
    return NextResponse.json({ error: "bad_body" }, { status: 400 });
  }
  if (!VALID_PATH.test(path) || path.includes("..") || path.includes("/")) {
    return NextResponse.json({ error: "bad_path" }, { status: 400 });
  }

  // never write underneath a running AI turn / deploy / restore — the client keeps the file dirty.
  // (Only a check, not a lock: the client saves several files in parallel.)
  if (isProjectBusy(id)) return NextResponse.json({ error: "busy", message: "AI กำลังทำงานกับโปรเจกต์นี้ บันทึกอีกครั้งเมื่อเสร็จ" }, { status: 409 });
  try {
    await writeFile(id, path, content);
    // version the manual edit (coalesces a burst of autosaves into one snapshot)
    await snapshotProject(id, "manual", { throttleSeconds: 120 });
    return NextResponse.json({ ok: true });
  } catch (e) {
    if ((e as Error).message === "invalid_file_path") return NextResponse.json({ error: "bad_path" }, { status: 400 });
    console.error("[files] save error:", e);
    return NextResponse.json({ error: "save_failed" }, { status: 500 });
  }
}
