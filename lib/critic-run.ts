import { isCliEngine, sanitizeChoice } from "@/lib/ai-choice";
import { resolveChoice } from "@/lib/ai-options";
import { getCriticInfo, reviewProject, type CriticIssue, type ReviewMode } from "@/lib/critic";
import { reviewProjectWithCli } from "@/lib/engines/cli-review";
import { updateProject } from "@/lib/projects";
import { getAppSetting } from "@/lib/settings";
import type { EgsProject } from "@/types/db";

export interface CriticRun {
  /** the project, with the AI picked for this run saved on it */
  project: EgsProject;
  issues: CriticIssue[];
  /** the review could not run or its reply was unreadable: never a clean pass */
  failed: boolean;
  tokens: number;
}

/**
 * Run the rulebook critic with the AI picked in the chat (`requested`, as the client sent it), the way
 * "ให้ AI ตรวจซ้ำ" and "วิเคราะห์โค้ด" both do: a critic the user set aside in settings.app wins; otherwise
 * a CLI pick reviews through that CLI, and an API pick through its key. No usable AI → failed.
 */
export async function runCritic(project: EgsProject, requested: unknown, mode: ReviewMode): Promise<CriticRun> {
  const picked = sanitizeChoice(requested);
  const choice = await resolveChoice(project, picked);
  if (picked) project = await updateProject(project.id, { ai: choice });
  const cliEngine = isCliEngine(choice.engine) && !(await getAppSetting("critic_provider")) ? choice.engine : null;

  if (!cliEngine && !(await getCriticInfo(project)).configured) return { project, issues: [], failed: true, tokens: 0 };
  try {
    const r = cliEngine
      ? await reviewProjectWithCli(project, cliEngine, choice.model, mode)
      : await reviewProject(project, project.id, mode);
    // an unparseable/truncated verdict is NOT "clean" — surface it as "couldn't check"
    return { project, issues: r.degraded ? [] : r.issues, failed: r.degraded, tokens: r.inputTokens + r.outputTokens };
  } catch (e) {
    console.error(`[critic:${mode}] failed:`, e);
    return { project, issues: [], failed: true, tokens: 0 };
  }
}
