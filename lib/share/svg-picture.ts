/**
 * An AI-drawn picture for the share page (lib/share/picture.ts): the engines that have no image model draw an
 * SVG, which the browser then turns into a JPEG (lib/client/svg-raster.ts). This file is the gate between the
 * model's text and the <img> that renders it — pure, tested in tests/svg-picture.test.ts.
 *
 * Only a self-contained drawing passes: no script, no event handlers, no foreignObject, no outside references
 * (href / url() may only point inside the document), no raster <image>. Size is capped. Fonts are the viewer's
 * system fonts (an <img> loads no web font), so the prompt asks for `sans-serif`.
 */

export const SVG_MAX_BYTES = 80_000;
export const COVER_W = 1600;
export const COVER_H = 900;
export const PHOTO_W = 1600;
export const PHOTO_H = 1200;

const BANNED_TAGS = /<\s*(script|foreignObject|image|iframe|object|embed|video|audio|animate|set|animateTransform|animateMotion|style)\b/i;
const EVENT_ATTR = /\son[a-z]+\s*=/i;
const OUTSIDE_REF = /(?:href|xlink:href)\s*=\s*(["'])(?!#)/i;
const OUTSIDE_URL = /url\(\s*["']?\s*(?!#)/i;
const ENTITY = /<!ENTITY|<!DOCTYPE/i;

export type SvgCheck = { ok: true; svg: string } | { ok: false; reason: string };

/** Pull the drawing out of the model's answer (it may wrap it in a code fence or add a sentence). */
export function extractSvg(text: string): string | null {
  const s = (text ?? "").replace(/\r\n?/g, "\n");
  const start = s.search(/<svg\b/i);
  if (start < 0) return null;
  const end = s.toLowerCase().lastIndexOf("</svg>");
  if (end < start) return null;
  return s.slice(start, end + "</svg>".length).trim();
}

/** The drawing with the sizes the share page expects, or why it was refused. */
export function checkSvg(text: string, size: { w: number; h: number }): SvgCheck {
  const svg = extractSvg(text);
  if (!svg) return { ok: false, reason: "no_svg" };
  if (Buffer.byteLength(svg, "utf8") > SVG_MAX_BYTES) return { ok: false, reason: "too_big" };
  if (ENTITY.test(text)) return { ok: false, reason: "entity" }; // on the whole answer: a DOCTYPE sits before <svg
  if (BANNED_TAGS.test(svg)) return { ok: false, reason: "banned_tag" };
  if (EVENT_ATTR.test(svg)) return { ok: false, reason: "event_attr" };
  if (OUTSIDE_REF.test(svg) || OUTSIDE_URL.test(svg)) return { ok: false, reason: "outside_ref" };
  // the root carries our size and viewBox, whatever the model wrote (a drawing made for another box is scaled)
  const rootEnd = svg.indexOf(">");
  const root = svg.slice(0, rootEnd);
  const viewBox = /viewBox\s*=\s*["']([^"']+)["']/i.exec(root)?.[1]?.trim() || `0 0 ${size.w} ${size.h}`;
  let attrs = root
    .replace(/^<svg\b/i, "")
    .replace(/\s(width|height|viewBox|xmlns|xmlns:xlink|preserveAspectRatio)\s*=\s*("[^"]*"|'[^']*')/gi, "");
  attrs = `${attrs} xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${size.w}" height="${size.h}" viewBox="${viewBox}" preserveAspectRatio="xMidYMid slice"`;
  return { ok: true, svg: `<svg${attrs.replace(/\s+/g, " ")}>${svg.slice(rootEnd + 1)}` };
}

export const sizeFor = (kind: "cover" | "photo"): { w: number; h: number } => (kind === "cover" ? { w: COVER_W, h: COVER_H } : { w: PHOTO_W, h: PHOTO_H });
