import type { CliEngine } from "@/lib/ai-choice";
import { buildReviewRequest, criticResultFromText, type CriticResult, type ReviewMode } from "@/lib/critic";
import { claudeOneShot } from "@/lib/engines/claude-cli";
import { codexOneShot } from "@/lib/engines/codex-cli";
import { museOneShot } from "@/lib/engines/muse-cli";
import type { EgsProject } from "@/types/db";

/**
 * The rulebook review ("ให้ AI ตรวจซ้ำ") through the user's own CLI, for when the AI they picked is a
 * monthly-plan program rather than an API key. One question, one answer, no session: the rubric and
 * the numbered files go in the prompt, and the reply is read exactly like an API critic's.
 * Each review spends one request of the user's plan, so it only runs when they press the button.
 */
export async function reviewProjectWithCli(
  project: EgsProject,
  engine: CliEngine,
  model?: string,
  mode: ReviewMode = "check",
): Promise<CriticResult> {
  const request = await buildReviewRequest(project, project.id, mode);
  if (!request) return criticResultFromText('{"issues":[]}');
  const prompt =
    `${request.system}\n\n=====\nThe project to review follows. You have no tools and need none: everything is in this message. ` +
    `Reply with the JSON object only.\n\n${request.user}`;
  const text =
    engine === "muse-cli"
      ? await museOneShot(project.id, prompt, model)
      : engine === "codex-cli"
        ? await codexOneShot(project.id, prompt, model)
        : await claudeOneShot(project.id, prompt, model);
  return criticResultFromText(text);
}
