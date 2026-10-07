import { createHash } from "node:crypto";
import { mkdir, readdir, readFile, rm, stat, writeFile as fsWriteFile } from "node:fs/promises";
import { dirname, join, relative } from "node:path";
import { resolveInSrc, srcDir } from "@/lib/local/paths";
import type { EgsFile } from "@/types/db";

/**
 * Project files (server-only). The files on disk under <project>/src are the source of truth — the
 * CLI engines and clasp both work on that folder directly. Paths are always validated to stay inside
 * src/ (lib/local/paths.resolveInSrc).
 */

/** Files clasp/engines keep in src/ that are not part of the user's project. */
const HIDDEN = new Set([".clasp.json", ".claspignore"]);

function sha256(s: string): string {
  return createHash("sha256").update(s).digest("hex");
}

/**
 * Stable hash of a set of files — identical path+content → identical hash, order-independent.
 * Used for deploy change-detection (skip a re-deploy when nothing changed).
 */
export function hashFiles(files: { path: string; content: string; content_hash?: string }[]): string {
  const payload = [...files]
    .sort((a, b) => a.path.localeCompare(b.path))
    .map((f) => `${f.path}\u0000${f.content_hash ?? sha256(f.content)}`)
    .join("\n");
  return sha256(payload);
}

async function walk(root: string, dir: string, out: string[]): Promise<void> {
  let entries;
  try {
    entries = await readdir(dir, { withFileTypes: true });
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return;
    throw e;
  }
  for (const ent of entries) {
    if (ent.name.startsWith(".") && ent.isDirectory()) continue;
    const abs = join(dir, ent.name);
    if (ent.isDirectory()) await walk(root, abs, out);
    else if (ent.isFile() && !HIDDEN.has(ent.name)) out.push(relative(root, abs).replace(/\\/g, "/"));
  }
}

async function toEgsFile(projectId: string, path: string): Promise<EgsFile | null> {
  const abs = resolveInSrc(projectId, path);
  try {
    const [content, info] = await Promise.all([readFile(abs, "utf8"), stat(abs)]);
    return {
      id: `${projectId}:${path}`,
      project_id: projectId,
      path,
      content,
      content_hash: sha256(content),
      updated_at: info.mtime.toISOString(),
    };
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return null;
    throw e;
  }
}

export async function getFiles(projectId: string): Promise<EgsFile[]> {
  const root = srcDir(projectId);
  const paths: string[] = [];
  await walk(root, root, paths);
  paths.sort();
  const files = await Promise.all(paths.map((p) => toEgsFile(projectId, p)));
  return files.filter((f): f is EgsFile => f !== null);
}

export async function getFile(projectId: string, path: string): Promise<EgsFile | null> {
  return toEgsFile(projectId, path);
}

export async function writeFile(projectId: string, path: string, content: string): Promise<void> {
  const abs = resolveInSrc(projectId, path);
  await mkdir(dirname(abs), { recursive: true });
  await fsWriteFile(abs, content, "utf8");
}

export async function deleteFile(projectId: string, path: string): Promise<void> {
  await rm(resolveInSrc(projectId, path), { force: true });
}
