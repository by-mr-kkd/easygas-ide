import { randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import { readJson, writeJsonAtomic } from "@/lib/local/json-store";
import { projectMetaPath, projectsRoot, srcDir } from "@/lib/local/paths";
import { LOCAL_USER_ID, type EgsDeployment, type EgsProject, type ProjectKind } from "@/types/db";

/**
 * Project data layer (server-only), backed by <data root>/projects/<id>/project.json.
 * There is one local user, so there is no ownership filtering — every project on disk is theirs.
 */

export interface LocalUser {
  id: string;
  email: string | null;
}

const LOCAL_USER: LocalUser = { id: LOCAL_USER_ID, email: null };

/** Kept for call-site compatibility with the hosted version (there is no login locally). */
export async function getCurrentUserId(): Promise<string> {
  return LOCAL_USER.id;
}

export async function getCurrentUser(): Promise<LocalUser> {
  return LOCAL_USER;
}

/** A missing, unreadable or corrupt project.json reads as "no project" (and is logged) — one bad
 *  folder must never take down the whole project list. */
async function readProject(id: string): Promise<EgsProject | null> {
  try {
    return await readJson<EgsProject | null>(projectMetaPath(id), null);
  } catch (e) {
    if ((e as Error).message !== "invalid_project_id") console.error("[projects] unreadable project", id, e);
    return null;
  }
}

// Serialize read-modify-write of each project.json (agent turn, deploy, spec update and delete can
// overlap — without this, one write silently drops another's fields).
const g = globalThis as unknown as { __egsProjectWrites?: Map<string, Promise<unknown>> };
const writeQueue = (g.__egsProjectWrites ??= new Map<string, Promise<unknown>>());

function withProjectWrite<T>(id: string, fn: () => Promise<T>): Promise<T> {
  const run = (writeQueue.get(id) ?? Promise.resolve()).catch(() => {}).then(fn);
  writeQueue.set(id, run);
  void run.finally(() => {
    if (writeQueue.get(id) === run) writeQueue.delete(id);
  });
  return run;
}

export async function listProjects(): Promise<EgsProject[]> {
  let ids: string[];
  try {
    ids = (await readdir(projectsRoot(), { withFileTypes: true })).filter((d) => d.isDirectory()).map((d) => d.name);
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const projects = await Promise.all(ids.map((id) => readProject(id)));
  return projects
    .filter((p): p is EgsProject => p !== null && p.deleted_at === null)
    .sort((a, b) => b.updated_at.localeCompare(a.updated_at));
}

export async function getProject(id: string): Promise<EgsProject | null> {
  const p = await readProject(id);
  return p && p.deleted_at === null ? p : null;
}

type ProjectPatch = Partial<Omit<EgsProject, "id" | "owner_id" | "created_at">>;

/**
 * Read-modify-write a project record in ONE queued step: `change` sees the record as it is on disk
 * right now and returns the patch. Use this whenever the new value depends on the old one (merging
 * prefs, counters) — a separate getProject() + updateProject() can drop a concurrent write.
 */
export async function mutateProject(id: string, change: (current: EgsProject) => ProjectPatch): Promise<EgsProject> {
  return withProjectWrite(id, async () => {
    const current = await readProject(id);
    if (!current || current.deleted_at !== null) throw new Error("project_not_found");
    const next: EgsProject = { ...current, ...change(current), updated_at: new Date().toISOString() };
    await writeJsonAtomic(projectMetaPath(id), next);
    return next;
  });
}

/** Merge a patch into a project record and bump updated_at. Returns the saved record. */
export async function updateProject(id: string, patch: ProjectPatch): Promise<EgsProject> {
  return withProjectWrite(id, async () => {
    const current = await readProject(id);
    if (!current) throw new Error("project_not_found");
    const next: EgsProject = { ...current, ...patch, updated_at: new Date().toISOString() };
    await writeJsonAtomic(projectMetaPath(id), next);
    return next;
  });
}

/** Create a project; a duplicate name is auto-suffixed ("ชื่อ", "ชื่อ (2)", …). Returns the new id. */
export async function createProject(
  name: string,
  kind: ProjectKind = "webapp",
  spec: Record<string, unknown> | null = null,
): Promise<string> {
  const base = name.trim() || "โปรเจกต์ใหม่";
  const taken = new Set((await listProjects()).map((p) => p.name));
  let candidate = base;
  for (let n = 2; taken.has(candidate); n++) candidate = `${base} (${n})`;

  const now = new Date().toISOString();
  const project: EgsProject = {
    id: randomUUID(),
    owner_id: LOCAL_USER.id,
    name: candidate,
    kind,
    target: "gas",
    spec,
    script_id: null,
    bound_sheet_id: null,
    scratch_script_id: null,
    token_spend_input: 0,
    token_spend_output: 0,
    llm_provider: null,
    engine_session_id: null,
    deployment: null,
    created_at: now,
    updated_at: now,
    deleted_at: null,
  };
  await mkdir(srcDir(project.id), { recursive: true });
  await writeJsonAtomic(projectMetaPath(project.id), project);
  return project.id;
}

/** Soft-delete: hide the project but keep its folder (the user can still recover the files on disk). */
export async function softDeleteProject(id: string): Promise<void> {
  await updateProject(id, { deleted_at: new Date().toISOString() });
}

export async function saveDeployment(id: string, deployment: EgsDeployment): Promise<void> {
  await updateProject(id, { deployment });
}

/** Map of project_id → live exec URL for deployed web apps. */
export async function getDeployedMap(): Promise<Record<string, string>> {
  const map: Record<string, string> = {};
  for (const p of await listProjects()) if (p.deployment?.exec_url) map[p.id] = p.deployment.exec_url;
  return map;
}

/** Live /exec URL for a single project's deployed web app (null if not deployed yet). */
export async function getDeployedUrl(projectId: string): Promise<string | null> {
  return (await getProject(projectId))?.deployment?.exec_url ?? null;
}
