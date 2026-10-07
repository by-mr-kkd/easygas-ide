import { randomUUID } from "node:crypto";
import { mkdir, readdir, readFile, rm, writeFile as fsWriteFile } from "node:fs/promises";
import { join, relative } from "node:path";
import { claspError, claspOrThrow, runClasp } from "@/lib/clasp";
import { ImportError, RemoteChangedError } from "@/lib/errors";
import { parseScriptId } from "@/lib/script-id";
import { deleteFile, getFiles, hashFiles, writeFile } from "@/lib/files";
import { readJson, writeJsonAtomic } from "@/lib/local/json-store";
import { dataRoot, projectDir, srcDir } from "@/lib/local/paths";
import { createProject, getProject, listProjects, saveDeployment, updateProject } from "@/lib/projects";
import { listDriveScripts } from "@/lib/drive-scripts";
import { decideSync, type SyncStatus } from "@/lib/sync-status";
import { snapshotProject } from "@/lib/versions";
import type { EgsProject } from "@/types/db";

/**
 * Editing an existing Apps Script (server-only). The user picks one of their scripts; it is cloned into a
 * new local project marked origin "imported". Rules that differ from projects made in the app:
 *  - the manifest is never rewritten (it may be a sheet-bound script, or a web app limited to a domain);
 *  - Google's copy is re-read before every push, and a push is refused when someone edited it on
 *    script.google.com since the last sync (clasp push replaces the whole project);
 *  - only files changed since the last sync count for the lint, so the AI does not "fix" untouched code;
 *  - publishing updates the script's existing deployment (same /exec URL) and never creates a new one.
 * The last-synced files are kept in <project>/remote-baseline.json.
 */

export interface SourceFile {
  path: string;
  content: string;
}

const PUSHED = /\.(gs|js|html)$/i;
const isScriptFile = (path: string): boolean => path === "appsscript.json" || PUSHED.test(path);

/** clasp writes server files as .js; the app works in .gs (clasp pushes both as server code). */
const normalizePath = (path: string): string => path.replace(/\.js$/i, ".gs");

const baselinePath = (projectId: string): string => join(projectDir(projectId), "remote-baseline.json");
/** Scripts the user hid from the list (ids), kept on this computer. */
const hiddenPath = (): string => join(dataRoot(), "hidden-scripts.json");

// ---- reading Google's copy ------------------------------------------------------------------

async function walk(root: string, dir: string, out: SourceFile[]): Promise<void> {
  for (const ent of await readdir(dir, { withFileTypes: true })) {
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!ent.name.startsWith(".")) await walk(root, abs, out);
      continue;
    }
    const rel = relative(root, abs).replace(/\\/g, "/");
    if (ent.isFile() && isScriptFile(rel)) out.push({ path: normalizePath(rel), content: await readFile(abs, "utf8") });
  }
}

/** Clone the script into a throw-away folder and read it back. clone (not pull) needs no prior state. */
export async function readRemote(scriptId: string): Promise<{ files: SourceFile[]; hash: string }> {
  const dir = join(dataRoot(), "tmp", `clone-${randomUUID()}`);
  await mkdir(dir, { recursive: true });
  try {
    const r = await runClasp(["clone-script", scriptId, "--rootDir", "."], { projectDir: dir });
    const text = `${r.stdout}\n${r.stderr}`;
    if (r.code !== 0 || /^Error:/m.test(r.stderr)) {
      if (/not found|Requested entity was not found|permission|PERMISSION_DENIED|403|404/i.test(text)) {
        throw new ImportError("NO_ACCESS", "เปิดสคริปต์นี้ไม่ได้ บัญชี Google ที่เชื่อมไว้ไม่ใช่เจ้าของหรือผู้แก้ไข หรือรหัสไม่ถูกต้อง");
      }
      throw claspError("clone-script", r);
    }
    const files: SourceFile[] = [];
    await walk(dir, dir, files);
    files.sort((a, b) => a.path.localeCompare(b.path));
    return { files, hash: hashFiles(files) };
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// ---- listing ----------------------------------------------------------------------------------

export type ScriptBadge = "created" | "imported" | null;

export interface GoogleScript {
  id: string;
  name: string;
  badge: ScriptBadge;
  /** the local project for this script, if there is one */
  projectId: string | null;
  /** last edit on Google (ISO), "" when unknown */
  modifiedTime: string;
  hidden: boolean;
}

async function hiddenIds(): Promise<Set<string>> {
  const ids = await readJson<unknown>(hiddenPath(), []);
  return new Set(Array.isArray(ids) ? ids.map(String) : []);
}

/** Hide a script from the list on this computer (nothing changes on Google), or show it again. */
export async function setScriptHidden(scriptId: string, hidden: boolean): Promise<void> {
  const ids = await hiddenIds();
  if (hidden) ids.add(scriptId);
  else ids.delete(scriptId);
  await writeJsonAtomic(hiddenPath(), [...ids]);
}

/** Drive first (it leaves out the trash and knows the last edit); clasp's list when Drive cannot be asked. */
async function scriptsOnGoogle(): Promise<{ id: string; name: string; modifiedTime: string }[]> {
  const fromDrive = await listDriveScripts();
  if (fromDrive) return fromDrive;
  const out = await claspOrThrow(["list-scripts", "--json", "--noShorten"]);
  const start = out.indexOf("[");
  const raw = start >= 0 ? (JSON.parse(out.slice(start)) as { id?: unknown; name?: unknown }[]) : [];
  return raw
    .filter((s): s is { id: string; name: string } => typeof s.id === "string" && typeof s.name === "string")
    .map((s) => ({ id: s.id, name: s.name, modifiedTime: "" }));
}

/** The user's standalone scripts (Google does not list sheet-bound ones), marked by what this app did. */
export async function listGoogleScripts(): Promise<GoogleScript[]> {
  const [scripts, hidden] = await Promise.all([scriptsOnGoogle(), hiddenIds()]);
  const local = new Map<string, EgsProject>();
  for (const p of await listProjects()) if (p.script_id && !p.deleted_at) local.set(p.script_id, p);
  return scripts.map((s) => {
    const p = local.get(s.id);
    return {
      ...s,
      badge: p ? (p.origin === "imported" ? "imported" : "created") : null,
      projectId: p?.id ?? null,
      hidden: hidden.has(s.id),
    };
  });
}

// ---- importing ----------------------------------------------------------------------------------

export { parseScriptId };

async function writeBaseline(projectId: string, files: SourceFile[], hash: string): Promise<void> {
  await writeJsonAtomic(baselinePath(projectId), { hash, files });
}

async function readBaseline(projectId: string): Promise<{ hash: string; files: SourceFile[] } | null> {
  return readJson<{ hash: string; files: SourceFile[] } | null>(baselinePath(projectId), null);
}

/** Replace the project's script files with `files` (other files in src/ stay). */
async function replaceScriptFiles(projectId: string, files: SourceFile[]): Promise<void> {
  for (const f of await getFiles(projectId)) if (isScriptFile(f.path)) await deleteFile(projectId, f.path);
  for (const f of files) await writeFile(projectId, f.path, f.content);
}

async function writeClaspConfig(projectId: string, scriptId: string): Promise<void> {
  await fsWriteFile(join(srcDir(projectId), ".clasp.json"), JSON.stringify({ scriptId, rootDir: "" }, null, 2), "utf8");
}

const hasWebApp = (files: SourceFile[]): boolean => {
  const m = files.find((f) => f.path === "appsscript.json")?.content;
  try {
    return Boolean(m && (JSON.parse(m) as { webapp?: unknown }).webapp);
  } catch {
    return false;
  }
};

/**
 * Remember the script's existing deployment so publishing keeps its URL: the versioned deployment with
 * the highest version (Google's list has no dates). None → publishing only updates the code.
 */
async function adoptDeployment(projectId: string, files: SourceFile[]): Promise<void> {
  const out = await claspOrThrow(["list-deployments", "--json"], srcDir(projectId));
  const start = out.indexOf("[");
  const list = start >= 0 ? (JSON.parse(out.slice(start)) as { deploymentId: string; versionNumber?: number | null }[]) : [];
  const best = list.filter((d) => typeof d.versionNumber === "number").sort((a, b) => (b.versionNumber ?? 0) - (a.versionNumber ?? 0))[0];
  if (!best) return;
  const now = new Date().toISOString();
  await saveDeployment(projectId, {
    id: randomUUID(),
    project_id: projectId,
    deployment_id: best.deploymentId,
    entry_type: "webapp",
    exec_url: hasWebApp(files) ? `https://script.google.com/macros/s/${best.deploymentId}/exec` : "",
    version_number: best.versionNumber ?? 0,
    content_hash: "", // the first publish from the app always pushes
    oauth_scopes: [],
    created_at: now,
    updated_at: now,
  });
}

/**
 * Clone an existing script into a new local project. A script that already has a local project opens
 * that project instead of making a second copy.
 */
export async function importScript(input: string, nameHint?: string): Promise<{ projectId: string; existed: boolean }> {
  const scriptId = parseScriptId(input);
  const existing = (await listProjects()).find((p) => p.script_id === scriptId && !p.deleted_at);
  if (existing) return { projectId: existing.id, existed: true };

  const remote = await readRemote(scriptId);
  const title = (nameHint ?? "").trim().slice(0, 120) || "สคริปต์ที่นำเข้า";
  const projectId = await createProject(title, hasWebApp(remote.files) ? "webapp" : "bound", { description: null, imported: true });
  await replaceScriptFiles(projectId, remote.files);
  await writeClaspConfig(projectId, scriptId);
  await writeBaseline(projectId, remote.files, remote.hash);
  await updateProject(projectId, {
    script_id: scriptId,
    origin: "imported",
    remote: { hash: remote.hash, synced_at: new Date().toISOString(), title },
  });
  // the untouched original is always one click away in the history
  await snapshotProject(projectId, "import", { label: "ต้นฉบับจาก Google (ก่อนแก้)" });
  try {
    await adoptDeployment(projectId, remote.files);
  } catch (e) {
    console.warn("[import] could not read deployments (publishing will only update the code):", e);
  }
  return { projectId, existed: false };
}

// ---- keeping in sync --------------------------------------------------------------------------

/** Throws RemoteChangedError when Google's copy is not what we last synced. */
export async function assertRemoteUnchanged(project: EgsProject): Promise<void> {
  if (!project.script_id || !project.remote) return;
  const { hash } = await readRemote(project.script_id);
  if (hash !== project.remote.hash) throw new RemoteChangedError();
}

/** After our own push: record what Google holds now as the new sync point, and what we pushed. */
export async function recordRemote(project: EgsProject, pushedHash: string): Promise<void> {
  if (!project.script_id) return;
  const remote = await readRemote(project.script_id);
  await writeBaseline(project.id, remote.files, remote.hash);
  await updateProject(project.id, {
    remote: { hash: remote.hash, synced_at: new Date().toISOString(), title: project.remote?.title ?? project.name, pushed: pushedHash },
  });
}

/**
 * "ดึงของล่าสุดจาก Google": keep the local state in the history, then take Google's copy as the project's
 * files and the new sync point.
 */
export async function pullRemote(project: EgsProject): Promise<void> {
  if (!project.script_id) throw new Error("not_imported");
  await snapshotProject(project.id, "manual", { label: "ก่อนดึงของล่าสุดจาก Google" });
  const remote = await readRemote(project.script_id);
  await replaceScriptFiles(project.id, remote.files);
  await writeClaspConfig(project.id, project.script_id);
  await writeBaseline(project.id, remote.files, remote.hash);
  await updateProject(project.id, { remote: { hash: remote.hash, synced_at: new Date().toISOString(), title: project.remote?.title ?? project.name } });
  await snapshotProject(project.id, "pull", { label: "ดึงจาก Google" });
}

/**
 * Lint scope for an imported project: a file counts only when it differs from the last sync, so problems
 * that were already in the user's code are not pushed onto the AI as things to repair. Created projects:
 * every file counts.
 */
export async function lintScope(project: EgsProject): Promise<(file: string) => boolean> {
  if (project.origin !== "imported") return () => true;
  const base = await readBaseline(project.id);
  if (!base) return () => true;
  const before = new Map(base.files.map((f) => [f.path, f.content]));
  const current = await getFiles(project.id);
  const changed = new Set(current.filter((f) => before.get(f.path) !== f.content).map((f) => f.path));
  return (file: string) => changed.has(file);
}

export interface GoogleCheck {
  status: SyncStatus;
  /** "อัปเดตจาก Google" makes sense: Google has something the local copy does not */
  canUpdate: boolean;
}

/**
 * "เช็คกับ Google": compare the local copy with what is on Google now. A project whose front page lives
 * on GitHub cannot be compared (Google holds a backend version of it), so it returns null.
 */
export async function checkWithGoogle(project: EgsProject): Promise<GoogleCheck | null> {
  if (!project.script_id) throw new Error("not_on_google");
  if (project.origin !== "imported" && project.hosting === "github") return null;
  const remote = await readRemote(project.script_id);
  const local = (await getFiles(project.id)).filter((f) => isScriptFile(f.path)).map((f) => ({ path: f.path, content: f.content }));
  const baseline = project.origin === "imported" ? ((await readBaseline(project.id))?.files ?? null) : null;
  const deployed = project.deployment?.content_hash;
  const status = decideSync({ local, remote: remote.files, baseline, localChangedSinceDeploy: !deployed || hashFiles(local) !== deployed });
  return { status, canUpdate: status === "google_newer" || status === "both" };
}

export async function getImportedProject(id: string): Promise<EgsProject | null> {
  const p = await getProject(id);
  return p && p.origin === "imported" ? p : null;
}
