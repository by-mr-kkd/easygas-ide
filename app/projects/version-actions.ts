"use server";

import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { getFiles } from "@/lib/files";
import { getCurrentUser, getProject } from "@/lib/projects";
import {
  getVersionFiles,
  getVersionProjectId,
  listVersionsMeta,
  restoreVersion,
  type VersionMeta,
} from "@/lib/versions";

/** List a project's code snapshots (newest first). RLS-equivalent ownership check via getProject. */
export async function listVersionsAction(projectId: string): Promise<VersionMeta[]> {
  const user = await getCurrentUser();
  if (!user) return [];
  const project = await getProject(projectId); // RLS-scoped → null if not owned
  if (!project) return [];
  return listVersionsMeta(projectId);
}

/** Roll the project's files back to a snapshot. Verifies the version belongs to the user's project. */
export async function restoreVersionAction(versionId: string): Promise<{ ok: boolean }> {
  const user = await getCurrentUser();
  if (!user) return { ok: false };
  const projectId = await getVersionProjectId(versionId);
  if (!projectId) return { ok: false };
  const project = await getProject(projectId); // RLS ownership check
  if (!project) return { ok: false };
  const lock = await acquireProjectRun(projectId);
  if (!lock) return { ok: false }; // an AI turn / deploy is running — never swap files underneath it
  try {
    return { ok: (await restoreVersion(versionId)) !== null };
  } finally {
    await releaseProjectRun(projectId, lock);
  }
}

/** A version's files next to the current ones, for "ดูความต่าง". */
export async function versionDiffAction(
  versionId: string,
): Promise<{ ok: true; version: { path: string; content: string }[]; current: { path: string; content: string }[] } | { ok: false }> {
  const projectId = await getVersionProjectId(versionId);
  if (!projectId || !(await getProject(projectId))) return { ok: false };
  const version = await getVersionFiles(versionId);
  if (!version) return { ok: false };
  const current = (await getFiles(projectId)).map((f) => ({ path: f.path, content: f.content }));
  return { ok: true, version, current };
}
