/**
 * Where a publish to the user's Google account is right now, per project, kept in this server process only
 * (nothing secret: step names, times and a short Thai detail). The publish dialog reads it through
 * GET /api/deploy-progress/<id> while POST /api/deploy runs, the same way the GitHub Pages dialog follows
 * lib/pages/progress.ts — so a Google publish shows its steps instead of a silent wait.
 */

export type DeployStep = "prepare" | "create" | "push" | "version" | "deploy" | "probe";

export type DeployProgress = {
  startedAt: number;
  step: DeployStep;
  /** when each step began (ms since epoch) */
  at: Partial<Record<DeployStep, number>>;
  detail: string | null;
  finishedAt: number | null;
  error: string | null;
};

const g = globalThis as unknown as { __egsDeployProgress?: Map<string, DeployProgress> };
const runs = (g.__egsDeployProgress ??= new Map());

export function startDeployProgress(projectId: string): void {
  const now = Date.now();
  runs.set(projectId, { startedAt: now, step: "prepare", at: { prepare: now }, detail: null, finishedAt: null, error: null });
}

export function noteDeployStep(projectId: string, step: DeployStep, detail: string | null = null): void {
  const p = runs.get(projectId);
  if (!p || p.finishedAt) return;
  if (p.step !== step) p.at[step] ??= Date.now();
  p.step = step;
  p.detail = detail;
}

export function finishDeployProgress(projectId: string, error: string | null = null): void {
  const p = runs.get(projectId);
  if (!p) return;
  p.finishedAt = Date.now();
  p.error = error;
}

export function readDeployProgress(projectId: string): DeployProgress | null {
  const p = runs.get(projectId);
  return p ? { ...p, at: { ...p.at } } : null;
}

/** What the dialog shows: four steps the user knows, from the six the publisher runs. */
export const DEPLOY_UI_STEPS: { label: string; steps: DeployStep[] }[] = [
  { label: "เตรียมไฟล์และตรวจการตั้งค่า", steps: ["prepare"] },
  { label: "ส่งโค้ดขึ้นบัญชี Google ของคุณ", steps: ["create", "push"] },
  { label: "ออกเวอร์ชันใหม่และเผยแพร่", steps: ["version", "deploy"] },
  { label: "ลองเปิดแอปดูว่าใช้ได้", steps: ["probe"] },
];

/** short lines shown while Google works (the longest wait is the push), one every few seconds */
export const DEPLOY_WHILE_YOU_WAIT = [
  "ครั้งแรกใช้เวลาประมาณ 1 นาที ครั้งต่อไปเร็วกว่านี้",
  "ลิงก์ของแอปเป็นลิงก์เดิมทุกครั้งที่เผยแพร่ใหม่ ไม่ต้องส่งลิงก์ให้ผู้ใช้ใหม่",
  "โค้ดและข้อมูลอยู่ในบัญชี Google ของคุณเท่านั้น EasyGAS ไม่ได้เก็บไว้",
  "ครั้งแรกที่เปิดแอป Google จะขอสิทธิ์หนึ่งครั้ง กด Advanced → Allow",
];
