/** Browser-side: shrink a picture before it goes to the hub (the website re-encodes it again to WebP). */

const EDGE = { cover: 1800, logo: 600, icon: 256 } as const;
export const HUB_IMAGE_ACCEPT = "image/jpeg,image/png,image/webp,image/gif";

/** base64 (no data: prefix) of a JPEG/PNG at most EDGE[kind] on its longest side; throws a Thai message. */
export async function shrinkHubImage(file: File, kind: keyof typeof EDGE): Promise<string> {
  if (!/^image\/(jpeg|png|webp|gif)$/.test(file.type)) throw new Error("เลือกไฟล์รูป JPG, PNG หรือ WebP");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("อ่านรูปไม่ได้ ลองเลือกรูปอื่น");
  });
  try {
    const scale = Math.min(1, EDGE[kind] / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // a logo / icon keeps its transparency (PNG); a cover photo is smaller as JPEG
    const url = kind === "cover" ? canvas.toDataURL("image/jpeg", 0.85) : canvas.toDataURL("image/png");
    const b64 = url.slice(url.indexOf(",") + 1);
    if (b64.length * 0.75 > 3 * 1024 * 1024) throw new Error("รูปใหญ่เกินไป ลองรูปที่เล็กกว่านี้");
    return b64;
  } finally {
    bitmap.close();
  }
}
