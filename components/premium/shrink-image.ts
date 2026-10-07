/** Browser-side: read a slip image and shrink it so the upload stays well under the server's 4 MB cap. */

const MAX_EDGE = 1600;
const TARGET_BYTES = 2 * 1024 * 1024;

export const SLIP_ACCEPT = "image/jpeg,image/png,image/webp";

function dataUrlToBase64(dataUrl: string): string {
  return dataUrl.slice(dataUrl.indexOf(",") + 1);
}

/** Returns base64 JPEG (no `data:` prefix). Throws a Thai message when the file is not a readable image. */
export async function shrinkSlipImage(file: File): Promise<string> {
  if (!/^image\/(jpeg|png|webp)$/.test(file.type)) throw new Error("เลือกรูปสลิปเป็น JPEG หรือ PNG");
  const bitmap = await createImageBitmap(file).catch(() => {
    throw new Error("อ่านรูปไม่ได้ ลองเลือกรูปอื่น");
  });
  try {
    const scale = Math.min(1, MAX_EDGE / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) throw new Error("เบราว์เซอร์นี้ย่อรูปไม่ได้");
    ctx.fillStyle = "#fff"; // a transparent PNG must not turn black in JPEG
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    // step the quality down until the result is small enough
    for (const quality of [0.9, 0.8, 0.7, 0.6]) {
      const b64 = dataUrlToBase64(canvas.toDataURL("image/jpeg", quality));
      if (b64.length * 0.75 <= TARGET_BYTES) return b64;
    }
    throw new Error("รูปใหญ่เกินไป ลองถ่ายภาพหน้าจอสลิปแทน");
  } finally {
    bitmap.close();
  }
}
