/**
 * Where a GitHub Pages publish is right now, per project, kept in this server process only (nothing secret: step
 * names, times and a short Thai detail). The publish dialog reads it through GET /api/pages-progress/<id> while the
 * publish runs — a server action cannot be polled: Next queues it behind the running publish action.
 */

export type ProgressStep = "deploy" | "build" | "repo" | "upload" | "pages" | "wait" | "save";

export type PagesProgress = {
  startedAt: number;
  step: ProgressStep;
  /** when each step began (ms since epoch) */
  at: Partial<Record<ProgressStep, number>>;
  detail: string | null;
  finishedAt: number | null;
  error: string | null;
};

const g = globalThis as unknown as { __egsPagesProgress?: Map<string, PagesProgress> };
const runs = (g.__egsPagesProgress ??= new Map());

export function startProgress(projectId: string): void {
  const now = Date.now();
  runs.set(projectId, { startedAt: now, step: "deploy", at: { deploy: now }, detail: null, finishedAt: null, error: null });
}

export function noteStep(projectId: string, step: ProgressStep, detail: string | null = null): void {
  const p = runs.get(projectId);
  if (!p || p.finishedAt) return;
  if (p.step !== step) p.at[step] ??= Date.now();
  p.step = step;
  p.detail = detail;
}

export function finishProgress(projectId: string, error: string | null = null): void {
  const p = runs.get(projectId);
  if (!p) return;
  p.finishedAt = Date.now();
  p.error = error;
}

export function readProgress(projectId: string): PagesProgress | null {
  const p = runs.get(projectId);
  return p ? { ...p, at: { ...p.at } } : null;
}

/** What the dialog shows: four steps the user knows, from the seven the publisher runs. */
export const UI_STEPS: { label: string; steps: ProgressStep[] }[] = [
  { label: "เผยแพร่ระบบหลังบ้านบน Google", steps: ["deploy"] },
  { label: "แปลงหน้าเว็บเป็นไฟล์", steps: ["build"] },
  { label: "ส่งขึ้น GitHub", steps: ["repo", "upload", "pages"] },
  { label: "รอ GitHub Pages สร้างหน้าเว็บ", steps: ["wait", "save"] },
];

export const uiIndexOf = (step: ProgressStep): number => UI_STEPS.findIndex((s) => s.steps.includes(step));
