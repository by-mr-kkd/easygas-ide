import { readFile } from "node:fs/promises";
import { NextResponse, type NextRequest } from "next/server";
import { chatImageFile } from "@/lib/chat-images";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";

/** GET /api/images/[id]/[name] — a chat image attached to a project (name is validated, no traversal). */
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string; name: string }> }) {
  const { id, name } = await params;
  if (!(await getProject(id))) return NextResponse.json({ error: "not_found" }, { status: 404 });
  const file = chatImageFile(id, name);
  if (!file) return NextResponse.json({ error: "not_found" }, { status: 404 });
  try {
    const bytes = await readFile(file.abs);
    return new NextResponse(new Uint8Array(bytes), {
      headers: { "Content-Type": file.mediaType, "Cache-Control": "private, max-age=3600" },
    });
  } catch {
    return NextResponse.json({ error: "not_found" }, { status: 404 });
  }
}
