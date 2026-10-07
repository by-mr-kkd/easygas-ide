import { mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { imagesDir } from "@/lib/local/paths";

/**
 * Chat image attachments (server-only). The client compresses images and sends them as base64; the
 * same base64 is fed to the model for the turn it was attached, and a copy is kept in
 * <project>/images so the chat can re-show it when the project is reopened.
 *
 * History note: image blocks are deliberately NOT kept in the message history — they would be
 * re-sent to the model (and re-billed as image tokens) on every later turn.
 */

export const MAX_CHAT_IMAGES = 4;
const MAX_IMAGE_B64 = 7_000_000; // ~5 MB decoded per image
const MAX_TOTAL_B64 = 16_000_000; // ~12 MB decoded total per turn

const ALLOWED_MEDIA = new Set(["image/jpeg", "image/png", "image/webp", "image/gif"]);
const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
};
const IMAGE_FILE = /^(\d{13})-(\d+)\.(jpg|png|webp|gif)$/;

export interface AttachedImage {
  /** raw base64 (no data: prefix) */
  dataBase64: string;
  mediaType: string;
}

/** Validate + clamp an incoming attachment list from an untrusted request body. */
export function parseAttachedImages(raw: unknown): AttachedImage[] {
  if (!Array.isArray(raw)) return [];
  const out: AttachedImage[] = [];
  let total = 0;
  for (const item of raw.slice(0, MAX_CHAT_IMAGES)) {
    if (!item || typeof item !== "object") continue;
    const mediaType = String((item as Record<string, unknown>).mediaType ?? "");
    let data = String((item as Record<string, unknown>).dataBase64 ?? "");
    const comma = data.indexOf(",");
    if (data.startsWith("data:") && comma !== -1) data = data.slice(comma + 1);
    if (!ALLOWED_MEDIA.has(mediaType) || data.length === 0) continue;
    if (data.length > MAX_IMAGE_B64) continue;
    if (total + data.length > MAX_TOTAL_B64) break;
    total += data.length;
    out.push({ dataBase64: data, mediaType });
  }
  return out;
}

/** Save attachments to the project's images folder. Best-effort: a failure never blocks the turn. */
export async function storeChatImages(projectId: string, images: AttachedImage[]): Promise<void> {
  if (images.length === 0) return;
  const dir = imagesDir(projectId);
  const stamp = Date.now();
  try {
    await mkdir(dir, { recursive: true });
    await Promise.all(
      images.map((img, i) =>
        writeFile(join(dir, `${stamp}-${i}.${EXT[img.mediaType] ?? "png"}`), Buffer.from(img.dataBase64, "base64")),
      ),
    );
  } catch (e) {
    console.error("[chat-images] store error:", e);
  }
}

export interface StoredChatImage {
  path: string;
  url: string; // served by /api/images/[id]/[name]
  createdAt: string;
}

/** A project's previously-attached chat images, oldest first, as app-served URLs. */
export async function listProjectChatImages(projectId: string): Promise<StoredChatImage[]> {
  let names: string[];
  try {
    names = await readdir(imagesDir(projectId));
  } catch (e) {
    if ((e as NodeJS.ErrnoException).code === "ENOENT") return [];
    throw e;
  }
  return names
    .map((n) => ({ n, m: IMAGE_FILE.exec(n) }))
    .filter((x): x is { n: string; m: RegExpExecArray } => x.m !== null)
    .sort((a, b) => a.n.localeCompare(b.n))
    .map(({ n, m }) => ({
      path: n,
      url: `/api/images/${projectId}/${n}`,
      createdAt: new Date(Number(m[1])).toISOString(),
    }));
}

/** Resolve a stored image for serving; null unless the name is one of ours. */
export function chatImageFile(projectId: string, name: string): { abs: string; mediaType: string } | null {
  const m = IMAGE_FILE.exec(name);
  if (!m) return null;
  const mediaType = Object.entries(EXT).find(([, ext]) => ext === m[3])?.[0] ?? "application/octet-stream";
  return { abs: join(imagesDir(projectId), name), mediaType };
}

export async function removeProjectChatImages(projectId: string): Promise<void> {
  await rm(imagesDir(projectId), { recursive: true, force: true });
}
