import type { SourceFile } from "./dispatcher.ts";
import { INSTALL_SCRIPT_PATH, installScript } from "./pwa-install.ts";

/**
 * "ติดตั้งเป็นแอปบนหน้าจอ" (Pro, lib/pro-features.ts): the files that make the GitHub Pages copy
 * installable — a web manifest, a small service worker, an SVG icon and the install invitation
 * (lib/pages/pwa-install.ts) — plus the head tags that point
 * at them. Written by the app, never by the AI. Paths are relative: a project page lives under
 * https://<user>.github.io/<repo>/.
 *
 * The service worker only keeps the page itself for offline start-up. It never touches requests to other
 * origins, so every call to the GAS backend (script.google.com) goes straight to the network.
 */

export const MANIFEST_PATH = "manifest.webmanifest";
export const SERVICE_WORKER_PATH = "sw.js";
export const ICON_PATH = "icon.svg";

const HEX = /^#[0-9a-f]{6}$/i;

export interface PwaOptions {
  name: string;
  /** theme colour, #rrggbb; anything else falls back to the app's green */
  color?: string | null;
}

/** The app's short name on a home screen: the first word-ish chunk, at most 12 characters. */
export function shortName(name: string): string {
  const clean = name.replace(/\s+/g, " ").trim() || "แอป";
  if (clean.length <= 12) return clean;
  if (typeof Intl.Segmenter === "function") {
    let out = "";
    for (const { segment } of new Intl.Segmenter("th", { granularity: "word" }).segment(clean)) {
      if (out.length + segment.length > 12) break;
      out += segment;
    }
    if (out.trim()) return out.trim();
  }
  return clean.slice(0, 12);
}

function iconSvg(name: string, color: string): string {
  const letter = [...(name.trim() || "A")][0].replace(/[<>&"']/g, "");
  return (
    `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512">` +
    `<rect width="512" height="512" rx="112" fill="${color}"/>` +
    `<text x="256" y="256" dy=".35em" text-anchor="middle" font-family="system-ui,'Noto Sans Thai',sans-serif" font-size="260" font-weight="700" fill="#fff">${letter}</text>` +
    `</svg>`
  );
}

const SW = `// EasyGAS: keeps the page for offline start-up; calls to other sites (the Google backend) are left alone
const CACHE = "egs-v1";
self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(["./", "./index.html"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (e) => {
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(
    fetch(req)
      .then((res) => {
        const copy = res.clone();
        caches.open(CACHE).then((c) => c.put(req, copy));
        return res;
      })
      .catch(() => caches.match(req).then((hit) => hit || caches.match("./index.html")))
  );
});
`;

/** The extra files and the head tags for an installable page. */
export function pwaFiles(opts: PwaOptions): { files: SourceFile[]; head: string[] } {
  const color = opts.color && HEX.test(opts.color) ? opts.color : "#047857";
  const name = opts.name.replace(/\s+/g, " ").trim().slice(0, 60) || "แอป";
  const manifest = {
    name,
    short_name: shortName(name),
    start_url: "./",
    scope: "./",
    display: "standalone",
    background_color: "#ffffff",
    theme_color: color,
    icons: [{ src: ICON_PATH, sizes: "any", type: "image/svg+xml", purpose: "any maskable" }],
  };
  return {
    files: [
      { path: MANIFEST_PATH, content: JSON.stringify(manifest, null, 2) + "\n" },
      { path: SERVICE_WORKER_PATH, content: SW },
      { path: ICON_PATH, content: iconSvg(name, color) },
      // the "ติดตั้งเป็นแอป" pop-up + the app's [data-egs-install] buttons (lib/pages/pwa-install.ts)
      { path: INSTALL_SCRIPT_PATH, content: installScript(name, color) },
    ],
    head: [
      `<link rel="manifest" href="${MANIFEST_PATH}">`,
      `<meta name="theme-color" content="${color}">`,
      `<link rel="icon" href="${ICON_PATH}" type="image/svg+xml">`,
      `<link rel="apple-touch-icon" href="${ICON_PATH}">`,
      `<meta name="apple-mobile-web-app-capable" content="yes">`,
      `<script src="${INSTALL_SCRIPT_PATH}" defer></script>`,
      `<script>if("serviceWorker" in navigator)addEventListener("load",function(){navigator.serviceWorker.register("${SERVICE_WORKER_PATH}").catch(function(){})})</script>`,
    ],
  };
}
