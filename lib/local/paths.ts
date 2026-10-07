import { isAbsolute, join, relative, resolve, sep } from "node:path";

/**
 * On-disk layout of the local app (server-only). Everything lives under one data root:
 *
 *   <root>/settings.json                 provider choice + API keys
 *   <root>/rulebook/                     downloaded (signed) rulebook pack, when newer than the bundled one
 *   <root>/lessons.json                  the user's lesson book (mistakes worth remembering across projects)
 *   <root>/projects/<id>/project.json    project record + last deployment
 *   <root>/projects/<id>/messages.jsonl  chat history (append-only)
 *   <root>/projects/<id>/versions/       file-set snapshots
 *   <root>/projects/<id>/images/         chat image attachments
 *   <root>/projects/<id>/src/            the Apps Script project itself (source of truth; clasp rootDir)
 *   <root>/projects/<id>/engine/         per-turn files for the CLI engine (system prompt, rule cards, io/)
 *
 * App metadata stays OUTSIDE src/ on purpose: clasp pushes every .json in its rootDir, and the CLI
 * engines are sandboxed to src/.
 */

/**
 * A user-profile directory from the environment, read through a computed key on purpose: Next's
 * build-time file tracer statically evaluates os.homedir()-based paths and copies that whole folder
 * (other apps' credentials included) into the standalone bundle. scripts/check-trace.mjs guards it.
 */
export function userDir(kind: "config" | "home"): string {
  const env = process.env;
  const keys = kind === "config" ? ["APPDATA", "XDG_CONFIG_HOME"] : ["USERPROFILE", "HOME"];
  for (const k of keys) {
    const v = env[k]?.trim();
    if (v) return v;
  }
  return kind === "config" ? join(userDir("home"), ".config") : resolve(".");
}

export function dataRoot(): string {
  const fromEnv = process.env.EASYGAS_DATA_DIR?.trim();
  if (fromEnv) return resolve(fromEnv);
  return join(userDir("config"), "EasyGAS IDE");
}

export const settingsPath = (): string => join(dataRoot(), "settings.json");
export const projectsRoot = (): string => join(dataRoot(), "projects");
export const rulebookDir = (): string => join(dataRoot(), "rulebook");
export const lessonsPath = (): string => join(dataRoot(), "lessons.json");

const PROJECT_ID = /^[a-z0-9-]{8,64}$/;

/** Reject anything that isn't one of our generated ids before it touches a path (no traversal). */
export function assertProjectId(id: string): string {
  if (!PROJECT_ID.test(id)) throw new Error("invalid_project_id");
  return id;
}

export const projectDir = (id: string): string => join(projectsRoot(), assertProjectId(id));
export const projectMetaPath = (id: string): string => join(projectDir(id), "project.json");
export const messagesPath = (id: string): string => join(projectDir(id), "messages.jsonl");
export const versionsDir = (id: string): string => join(projectDir(id), "versions");
export const imagesDir = (id: string): string => join(projectDir(id), "images");
export const srcDir = (id: string): string => join(projectDir(id), "src");
export const engineDir = (id: string): string => join(projectDir(id), "engine");

/**
 * Resolve a project-relative file path (as the editor/agent names it, e.g. "Code.gs") to an absolute
 * path inside src/. Throws on absolute paths, `..`, or anything that escapes src/, and on names
 * Windows treats specially: device names (CON, NUL, COM1…), alternate data streams ("a.gs:x"),
 * reserved characters, and segments ending in a dot or space (silently trimmed by Windows).
 */
const WINDOWS_RESERVED_CHARS = /[:<>"|?*\u0000-\u001f]/;
const WINDOWS_DEVICE = /^(con|prn|aux|nul|com\d|lpt\d)(\..*)?$/i;

function isSafeSegment(seg: string): boolean {
  return seg.length > 0 && !WINDOWS_RESERVED_CHARS.test(seg) && !WINDOWS_DEVICE.test(seg) && !/[. ]$/.test(seg);
}

export function resolveInSrc(id: string, relPath: string): string {
  const root = srcDir(id);
  const cleaned = relPath.replace(/\\/g, "/").trim();
  if (!cleaned || isAbsolute(cleaned) || /^[a-zA-Z]:/.test(cleaned)) throw new Error("invalid_file_path");
  if (!cleaned.split("/").filter((s) => s !== "").every((s) => s === ".." || isSafeSegment(s))) {
    throw new Error("invalid_file_path");
  }
  const abs = resolve(root, cleaned);
  const rel = relative(root, abs);
  if (!rel || rel.startsWith("..") || isAbsolute(rel) || rel.split(sep).includes("..")) {
    throw new Error("invalid_file_path");
  }
  return abs;
}
