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

export async function compressImage(file: File): Promise<CompressedImage> {
  const bitmap = await createImageBitmap(file);
  let { width, height } = bitmap;
  const longest = Math.max(width, height);
  if (longest > MAX_DIM) {
    const scale = MAX_DIM / longest;
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
