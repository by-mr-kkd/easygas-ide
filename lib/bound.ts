/**
 * Projects bound to a Google Sheet (kind "bound"), pure parts. The first publish creates a NEW Google Sheet
 * with the script inside it (`clasp create-script --type sheets --json`); every later one pushes into that
 * same script. There is no web-app deployment: the script runs from the Sheet (menus, triggers, sidebars).
 */

const ID = /^[\w-]{20,}$/;

/** `{ scriptId, parentId }` from `clasp create-script --type sheets --json` (the JSON is the last object printed). */
export function parseBoundCreate(stdout: string): { scriptId: string; sheetId: string } | null {
  // the JSON starts on a line of its own; progress text may come before it
  const starts = [...stdout.matchAll(/^\{/gm)].map((m) => m.index).reverse();
  for (const i of starts) {
    let j: { scriptId?: unknown; parentId?: unknown };
    try {
      j = JSON.parse(stdout.slice(i)) as typeof j;
    } catch {
      continue;
    }
    const scriptId = typeof j.scriptId === "string" ? j.scriptId : "";
    const sheetId = typeof j.parentId === "string" ? j.parentId : "";
    return ID.test(scriptId) && ID.test(sheetId) ? { scriptId, sheetId } : null;
  }
  return null;
}

export const sheetUrl = (sheetId: string): string => `https://docs.google.com/spreadsheets/d/${sheetId}/edit`;

/**
 * A bound script's manifest: V8 and the Bangkok time zone (when none is set), everything else as the AI wrote
 * it — and NO web-app block is added (a bound project is not published as a web app).
 */
export function enforceBoundManifest(current: string | null): string {
  const base = { timeZone: "Asia/Bangkok", dependencies: {}, exceptionLogging: "STACKDRIVER", runtimeVersion: "V8" };
  if (!current) return JSON.stringify(base, null, 2);
  try {
    const m = JSON.parse(current) as Record<string, unknown>;
    return JSON.stringify({ ...m, timeZone: typeof m.timeZone === "string" && m.timeZone ? m.timeZone : base.timeZone, runtimeVersion: "V8" }, null, 2);
  } catch {
    return current; // malformed manifest — leave as-is (lint/critic flags it)
  }
}

type CodeFile = { path: string; content: string };
const isCode = (f: CodeFile): boolean => /\.(gs|js)$/i.test(f.path);

/**
 * The code only works inside a container (a Sheet): it reads "the active" spreadsheet / sheet / range or the
 * Sheet's UI. Tutorials teach exactly this (open a Sheet → Extensions → Apps Script), and such code is often
 * ALSO a web app — so this, not the manifest's web-app section, says where the script must live.
 */
export function usesContainer(files: CodeFile[]): boolean {
  return files.some((f) => isCode(f) && /\b(?:getActiveSpreadsheet|getActiveSheet|getActiveRange|getActiveCell|getUi)\s*\(/.test(f.content));
}

/** The script serves a web page (`doGet`): it gets a web-app deployment and an /exec link. */
export const hasDoGet = (files: CodeFile[]): boolean => files.some((f) => isCode(f) && /\bfunction\s+doGet\s*\(/.test(f.content));

/** The manifest has a web-app section (Google gives a deployment an /exec entry point only then). */
export function manifestHasWebApp(files: CodeFile[]): boolean {
  const m = files.find((f) => f.path === "appsscript.json")?.content;
  try {
    return Boolean(m && (JSON.parse(m) as { webapp?: unknown }).webapp);
  } catch {
    return false;
  }
}

/** Where an existing script (imported, or a clone of a share) belongs: in a Sheet, or a standalone web app. */
export const kindForExisting = (files: CodeFile[]): "webapp" | "bound" => (usesContainer(files) || !manifestHasWebApp(files) ? "bound" : "webapp");
