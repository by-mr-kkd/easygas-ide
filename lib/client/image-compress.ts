/**
 * Browser-side image compression for chat attachments. Reference images don't need full
 * resolution — we downscale to a sane max dimension and re-encode as JPEG to keep the upload
 * (and the model's image-token cost) small. Runs entirely on the client; no upload here.
 */

const MAX_DIM = 1280; // longest edge (px) — well under Anthropic's 1568 sweet spot
const QUALITY = 0.82;
const OUTPUT_TYPE = "image/jpeg"; // universal + small; transparency/animation not needed for refs

export interface CompressedImage {
  /** data: URL for local preview */
  dataUrl: string;
  /** raw base64 (no prefix) for upload */
  dataBase64: string;
  mediaType: string;
}

export async function compressImage(file: File, maxDim = MAX_DIM): Promise<CompressedImage> {
  return compressBitmap(await createImageBitmap(file), maxDim);
}

/** The same for a picture already in hand as a data URL (a preview capture): shrunk and re-encoded like a file. */
export async function compressDataUrl(dataUrl: string, maxDim = MAX_DIM): Promise<CompressedImage> {
  const blob = await (await fetch(dataUrl)).blob();
  return compressBitmap(await createImageBitmap(blob), maxDim);
}

/** Centre-crop and scale a picture to exactly `w`×`h` (an image model answers in its own boxes; the share page and social
 *  posts want the box the user picked). JPEG, like the rest. */
export async function cropDataUrl(dataUrl: string, w: number, h: number, quality = 0.9): Promise<CompressedImage> {
  const blob = await (await fetch(dataUrl)).blob();
  const bitmap = await createImageBitmap(blob);
  try {
    const scale = Math.max(w / bitmap.width, h / bitmap.height);
    const sw = Math.min(bitmap.width, Math.round(w / scale));
    const sh = Math.min(bitmap.height, Math.round(h / scale));
    const sx = Math.round((bitmap.width - sw) / 2);
    const sy = Math.round((bitmap.height - sh) / 2);
    const canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("canvas_unavailable");
    ctx.drawImage(bitmap, sx, sy, sw, sh, 0, 0, w, h);
    const out = canvas.toDataURL(OUTPUT_TYPE, quality);
    return { dataUrl: out, dataBase64: out.slice(out.indexOf(",") + 1), mediaType: OUTPUT_TYPE };
  } finally {
    bitmap.close?.();
  }
}

/** `dataUrl` → the parts the upload wants, for a picture that is already the right size. */
export function splitDataUrl(dataUrl: string): CompressedImage {
  const comma = dataUrl.indexOf(",");
  const mediaType = /^data:([^;,]+)/.exec(dataUrl)?.[1] ?? OUTPUT_TYPE;
  return { dataUrl, dataBase64: dataUrl.slice(comma + 1), mediaType };
}

async function compressBitmap(bitmap: ImageBitmap, maxDim: number): Promise<CompressedImage> {
  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest > maxDim) {
    const scale = maxDim / longest;
    width = Math.round(width * scale);
    height = Math.round(height * scale);
  }

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close?.();
    throw new Error("canvas_unavailable");
  }
  ctx.drawImage(bitmap, 0, 0, width, height);
  bitmap.close?.();

  const dataUrl = canvas.toDataURL(OUTPUT_TYPE, QUALITY);
  const dataBase64 = dataUrl.slice(dataUrl.indexOf(",") + 1);
  return { dataUrl, dataBase64, mediaType: OUTPUT_TYPE };
}
