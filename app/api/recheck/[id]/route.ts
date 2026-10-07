import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { NextResponse, type NextRequest } from "next/server";
import type { CriticIssue } from "@/lib/critic";
import { runCritic } from "@/lib/critic-run";
import { getFiles } from "@/lib/files";
import { validateGasFiles } from "@/lib/gas-codegen";
import { getProject } from "@/lib/projects";

export const runtime = "nodejs";
export const maxDuration = 120;

/**
 * POST /api/recheck/[id] — re-check the project's CURRENT files on demand (after manual edits):
 *   Gate 0 = regex/structure lint (free, deterministic)  +  Gate 1 = rulebook critic (LLM-as-judge).
 * Gate 0 always runs; Gate 1 is best-effort and needs an API key for some provider in Settings.
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const found = await getProject(id);
  if (!found) return NextResponse.json({ error: "not_found" }, { status: 404 });
  // the AI picked in the chat right now (it may not have answered a message yet)
  const requested = await req.json().then((b: { ai?: unknown }) => b?.ai).catch(() => null);

  const gas = await getFiles(id);
  const lint = validateGasFiles(
    gas.map((f) => ({ name: f.path, content: f.content })),
    { isWebApp: found.kind !== "bound", allowCamera: cameraAllowedFor(found) },
  );
  const gate0: CriticIssue[] = [...lint.errors, ...lint.warnings].map((e) => ({
    file: e.file,
    severity: e.severity === "error" ? "high" : "medium",
    problem: e.message,
    fix: "",
  }));

  const gate1 = await runCritic(found, requested, "check");
  return NextResponse.json({ issues: [...gate0, ...gate1.issues], criticError: gate1.failed, tokens: gate1.tokens });
}
