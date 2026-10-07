import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { deleteFile, getFiles, writeFile } from "@/lib/files";
import { readJson, writeJsonAtomic } from "@/lib/local/json-store";
import { assertProjectId, versionsDir } from "@/lib/local/paths";

/**
 * Code version history (server-only): whole-file-set snapshots in <project>/versions/<stamp>.json,
 * taken on meaningful events (ai generation, manual edit, deploy, restore) so the user can roll back.
 * A version id is "<projectId>.<stamp>" so restore/lookup need nothing but the id.
 */

/** import = the untouched original of a script cloned from Google; pull = Google's copy taken in later. */
export type VersionSource = "ai" | "manual" | "deploy" | "restore" | "import" | "pull";

interface VersionFile {
  path: string;
  content: string;
}

interface StoredVersion {
  source: VersionSource;
  label: string | null;
  created_at: string;
  files: VersionFile[];
}

export interface VersionMeta {
  id: string;
  source: VersionSource;
  label: string | null;
  created_at: string;
  fileCount: number;
  /** what changed against the version before it (like a commit): file paths */
  changes: { added: string[]; modified: string[]; removed: string[] };
}

const STAMP = /^\d{13}(-\d+)?$/;

function parseVersionId(versionId: string): { projectId: string; stamp: string } | null {
  const dot = versionId.lastIndexOf(".");
  if (dot < 0) return null;
  const projectId = versionId.slice(0, dot);
  const stamp = versionId.slice(dot + 1);
  try {
    assertProjectId(projectId);
  } catch {
    return null;
  }
  return STAMP.test(stamp) ? { projectId, stamp } : null;
}

async function listStamps(projectId: string): Promise<string[]> {
  try {
    return (await readdir(versionsDir(projectId)))
      .filter((n) => n.endsWith(".json"))
      .map((n) => n.slice(0, -5))
      .filter((s) => STAMP.test(s))
      .sort()
      .reverse(); // newest first
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
}

const versionPath = (projectId: string, stamp: string): string => join(versionsDir(projectId), `${stamp}.json`);

function sameFiles(a: VersionFile[], b: VersionFile[]): boolean {
  if (a.length !== b.length) return false;
  const map = new Map(a.map((f) => [f.path, f.content]));
  return b.every((f) => map.get(f.path) === f.content);
}

/**
 * Snapshot the project's current files. Best-effort (never throws). Dedupes against the latest
 * snapshot; with throttleSeconds, also skips when the latest snapshot is newer than that window.
 */
export async function snapshotProject(
  projectId: string,
  source: VersionSource,
  opts: { label?: string; throttleSeconds?: number } = {},
): Promise<void> {
  try {
    const current = (await getFiles(projectId)).map((f) => ({ path: f.path, content: f.content }));
    if (current.length === 0) return;
    const [latestStamp] = await listStamps(projectId);
    if (latestStamp) {
      const latest = await readJson<StoredVersion | null>(versionPath(projectId, latestStamp), null);
      if (latest && sameFiles(latest.files ?? [], current)) return;
      if (latest && opts.throttleSeconds && Date.now() - new Date(latest.created_at).getTime() < opts.throttleSeconds * 1000)
        return;
    }
    // Strictly increasing so sort order = creation order, even within one millisecond.
    const latestMs = latestStamp ? Number(latestStamp.split("-")[0]) : 0;
    const latestSeq = latestStamp?.includes("-") ? Number(latestStamp.split("-")[1]) : 0;
    const now = Date.now();
    const stamp = now > latestMs ? String(now) : `${latestMs}-${String(latestSeq + 1).padStart(4, "0")}`;
    const version: StoredVersion = { source, label: opts.label ?? null, created_at: new Date().toISOString(), files: current };
    await writeJsonAtomic(versionPath(projectId, stamp), version);
  } catch (e) {
    console.error("[versions] snapshot failed (non-fatal):", e);
  }
}

function diffFiles(older: VersionFile[], newer: VersionFile[]): VersionMeta["changes"] {
  const before = new Map(older.map((f) => [f.path, f.content]));
  const after = new Map(newer.map((f) => [f.path, f.content]));
  return {
    added: [...after.keys()].filter((k) => !before.has(k)),
    modified: [...after.keys()].filter((k) => before.has(k) && before.get(k) !== after.get(k)),
    removed: [...before.keys()].filter((k) => !after.has(k)),
  };
}

/**
 * Metadata for a project's snapshots, newest first (no file bodies), each with what changed against the
 * one before it. The import snapshot (the untouched original from Google) is always included, even when
 * it is older than `limit`, so the way back to the original never scrolls away.
 */
export async function listVersionsMeta(projectId: string, limit = 50): Promise<VersionMeta[]> {
  const all = await listStamps(projectId);
  const read = (stamp: string) => readJson<StoredVersion | null>(versionPath(projectId, stamp), null);
  // one extra so the oldest listed version can still be compared with its predecessor
  const window = all.slice(0, limit + 1);
  const rows = await Promise.all(window.map(async (stamp) => ({ stamp, v: await read(stamp) })));
  const pinned: { stamp: string; v: StoredVersion | null }[] = [];
  for (const stamp of all.slice(limit + 1)) {
    const v = await read(stamp);
    if (v?.source === "import") pinned.push({ stamp, v });
  }
  const valid = rows.filter((r): r is { stamp: string; v: StoredVersion } => r.v !== null);
  const meta = (v: StoredVersion, stamp: string, prev: VersionFile[]): VersionMeta => ({
    id: `${projectId}.${stamp}`,
    source: v.source ?? "manual",
    label: v.label ?? null,
    created_at: v.created_at,
    fileCount: Array.isArray(v.files) ? v.files.length : 0,
    changes: diffFiles(prev, Array.isArray(v.files) ? v.files : []),
  });
  const listed = valid.slice(0, limit).map((r, i) => meta(r.v, r.stamp, valid[i + 1]?.v.files ?? []));
  // a pinned import is the project's first snapshot: nothing before it
  const extra = pinned.map((p) => meta(p.v as StoredVersion, p.stamp, []));
  return [...listed, ...extra];
}

/** A version's files (for the diff view). */
export async function getVersionFiles(versionId: string): Promise<VersionFile[] | null> {
  const parsed = parseVersionId(versionId);
  if (!parsed) return null;
  const v = await readJson<StoredVersion | null>(versionPath(parsed.projectId, parsed.stamp), null);
  return v && Array.isArray(v.files) ? v.files : null;
}

/** The project a version belongs to. */
export async function getVersionProjectId(versionId: string): Promise<string | null> {
  return parseVersionId(versionId)?.projectId ?? null;
}

/**
 * Overwrite the project's files with a snapshot, then snapshot the restored state as a new "restore"
 * version so the restore itself is undoable. Returns the restored files.
 */
export async function restoreVersion(versionId: string): Promise<VersionFile[] | null> {
  const parsed = parseVersionId(versionId);
  if (!parsed) return null;
  const { projectId, stamp } = parsed;
  const ver = await readJson<StoredVersion | null>(versionPath(projectId, stamp), null);
  if (!ver) return null;
  const files = (ver.files ?? []).filter((f) => f && typeof f.path === "string");

  const current = await getFiles(projectId);
  const keep = new Set(files.map((f) => f.path));
  await Promise.all(current.filter((f) => !keep.has(f.path)).map((f) => deleteFile(projectId, f.path)));
  await Promise.all(files.map((f) => writeFile(projectId, f.path, f.content)));

  await snapshotProject(projectId, "restore");
  return files;
}
