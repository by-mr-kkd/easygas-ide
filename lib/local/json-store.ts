import { appendFile, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname } from "node:path";
import { randomUUID } from "node:crypto";

/**
 * Tiny JSON-on-disk helpers (server-only). Single user, single process, so we need atomic writes
 * (a crash mid-write must never leave a half-written project.json) but not cross-process locking.
 */

export async function readJson<T>(path: string, fallback: T): Promise<T> {
  try {
    return JSON.parse(await readFile(path, "utf8")) as T;
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return fallback;
    throw e;
  }
}

/** Write to a temp file in the same directory, then rename over the target (atomic on NTFS + POSIX). */
export async function writeJsonAtomic(path: string, data: unknown): Promise<void> {
  await mkdir(dirname(path), { recursive: true });
  const tmp = `${path}.${randomUUID()}.tmp`;
  await writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await rename(tmp, path);
}

export async function appendJsonl(path: string, rows: unknown[]): Promise<void> {
  if (rows.length === 0) return;
  await mkdir(dirname(path), { recursive: true });
  await appendFile(path, rows.map((r) => JSON.stringify(r)).join("\n") + "\n", "utf8");
}

/** Read a JSONL file; a torn last line (crash during append) is skipped instead of failing the read. */
export async function readJsonl<T>(path: string): Promise<T[]> {
  let text: string;
  try {
    text = await readFile(path, "utf8");
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  const out: T[] = [];
  for (const line of text.split("\n")) {
    if (!line.trim()) continue;
    try {
      out.push(JSON.parse(line) as T);
    } catch {
      console.error("[json-store] skipped unreadable line in", path);
    }
  }
  return out;
}
