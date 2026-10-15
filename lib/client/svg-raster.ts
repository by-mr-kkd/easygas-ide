/**
 * An AI-drawn SVG (lib/share/picture.ts, checked by lib/share/svg-picture.ts) becomes a JPEG in the browser: the
 * text goes into a Blob URL, an <img> renders it (no scripts run in an <img>, no outside fetches happen — the
 * check refused them anyway), a canvas re-encodes it. Thai text falls to the viewer's system sans-serif.
 */
import type { CompressedImage } from "./image-compress";

export function svgToJpeg(svg: string, width: number, height: number, quality = 0.9): Promise<CompressedImage> {
  return new Promise((resolve, reject) => {
    const url = URL.createObjectURL(new Blob([svg], { type: "image/svg+xml;charset=utf-8" }));
    const img = new Image();
    img.decoding = "async";
    img.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("canvas_unavailable");
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);
        const dataUrl = canvas.toDataURL("image/jpeg", quality);
        resolve({ dataUrl, dataBase64: dataUrl.slice(dataUrl.indexOf(",") + 1), mediaType: "image/jpeg" });
      } catch (e) {
        reject(e);
      } finally {
        URL.revokeObjectURL(url);
      }
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("svg_render_failed"));
    };
    img.src = url;
  });
}
