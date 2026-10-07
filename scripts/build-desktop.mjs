// Build the Windows desktop app.
//
//   node scripts/build-desktop.mjs          → installer in dist/desktop/out (EasyGAS-IDE-Setup-<version>.exe)
//   node scripts/build-desktop.mjs --dir    → unpacked app only (dist/desktop/out/win-unpacked), faster
//   add --skip-next to reuse the existing .next build
//
// Layout it produces (see electron/main.js for how they are used):
//   dist/desktop/shell/            the Electron app proper: main.js + a package.json with NO dependencies
//   dist/desktop/resources/app/    the Next.js standalone server (+ static assets)
//   dist/desktop/resources/clasp/  Google's clasp CLI bundled into one file (clasp.mjs)
// The server and clasp ship as plain folders next to the app (extraResources), not inside app.asar:
// both are started as separate Node processes and need real files on disk.
import { execFileSync, execSync } from "node:child_process";
import { build } from "esbuild";
import pngjs from "pngjs";
import { cpSync, existsSync, mkdirSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const out = join(root, "dist", "desktop");
const args = new Set(process.argv.slice(2));
const pkg = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const run = (command) => execSync(command, { cwd: root, stdio: "inherit" }); // fixed strings only — nothing user-supplied
const step = (text) => console.log(`\n▸ ${text}`);

const { PNG } = pngjs;
const ICON_FILES = { 192: "android-icon-192x192.png", 96: "favicon-96x96.png", 48: "android-icon-48x48.png", 32: "favicon-32x32.png", 16: "favicon-16x16.png" };

/** Downscale a PNG to exactly half size by averaging each 2×2 block (alpha-weighted colour). */
function halvePng(bytes) {
  const src = PNG.sync.read(bytes);
  const w = src.width >> 1;
  const h = src.height >> 1;
  const out = new PNG({ width: w, height: h });
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      let r = 0, g = 0, b = 0, a = 0;
      for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) {
        const i = ((2 * y + dy) * src.width + (2 * x + dx)) * 4;
        const alpha = src.data[i + 3];
        r += src.data[i] * alpha;
        g += src.data[i + 1] * alpha;
        b += src.data[i + 2] * alpha;
        a += alpha;
      }
      const o = (y * w + x) * 4;
      out.data[o] = a ? Math.round(r / a) : 0;
      out.data[o + 1] = a ? Math.round(g / a) : 0;
      out.data[o + 2] = a ? Math.round(b / a) : 0;
      out.data[o + 3] = Math.round(a / 4);
    }
  }
  return PNG.sync.write(out);
}

/** A .ico that embeds PNG images (supported since Windows Vista): 6-byte header, 16-byte entries, data. */
function buildIco(pngs) {
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0); // reserved
  header.writeUInt16LE(1, 2); // type: icon
  header.writeUInt16LE(pngs.length, 4);
  const entries = [];
  let offset = 6 + 16 * pngs.length;
  for (const png of pngs) {
    if (png.readUInt32BE(0) !== 0x89504e47) throw new Error("icon source is not a PNG");
    const width = png.readUInt32BE(16);
    const height = png.readUInt32BE(20);
    const e = Buffer.alloc(16);
    e.writeUInt8(width >= 256 ? 0 : width, 0);
    e.writeUInt8(height >= 256 ? 0 : height, 1);
    e.writeUInt8(0, 2); // no palette
    e.writeUInt8(0, 3);
    e.writeUInt16LE(1, 4); // colour planes
    e.writeUInt16LE(32, 6); // bits per pixel
    e.writeUInt32LE(png.length, 8);
    e.writeUInt32LE(offset, 12);
    offset += png.length;
    entries.push(e);
  }
  return Buffer.concat([header, ...entries, ...pngs]);
}

// ── 1. the web app ──
if (!args.has("--skip-next")) {
  step("building the Next.js app (with the bundle check)");
  run("npm run build");
}
const standalone = join(root, ".next", "standalone");
if (!existsSync(join(standalone, "server.js"))) throw new Error(".next/standalone/server.js is missing — run without --skip-next");

step("staging the server");
rmSync(out, { recursive: true, force: true });
const appDir = join(out, "resources", "app");
cpSync(standalone, appDir, { recursive: true });
cpSync(join(root, ".next", "static"), join(appDir, ".next", "static"), { recursive: true });
if (existsSync(join(root, "public"))) cpSync(join(root, "public"), join(appDir, "public"), { recursive: true });
// the server's entry point in the packaged app: stops the server when the shell disappears
cpSync(join(root, "electron", "server-entry.js"), join(appDir, "desktop-entry.js"));
// The standalone build must never carry local data or secrets (check-trace guards the build; this
// guards the copy).
for (const name of [".env", ".env.local", "settings.json", "lessons.json"]) {
  if (existsSync(join(appDir, name))) throw new Error(`refusing to package ${name}`);
}

// ── 2. clasp, bundled into one file ──
// clasp + its dependency tree is 4,600 small files (Google's API library alone is 900). On a fresh
// install Windows scans every one on first use: the first Google account check took over 20 s and
// timed out, and the installer itself took far longer. One bundled file starts in about a second.
// Verified against Google with this bundle: sign-in status, list deployments, pull, push.
step("bundling clasp");
const claspRoot = join(out, "resources", "clasp");
mkdirSync(claspRoot, { recursive: true });
const claspPkg = JSON.parse(readFileSync(join(root, "node_modules", "@google", "clasp", "package.json"), "utf8"));
await build({
  entryPoints: [join(root, "node_modules", "@google", "clasp", claspPkg.bin.clasp)],
  outfile: join(claspRoot, "clasp.mjs"),
  bundle: true,
  minify: true,
  platform: "node",
  format: "esm",
  target: "node22",
  legalComments: "external", // third-party licence notices → clasp.mjs.LEGAL.txt, shipped beside it
  // CommonJS dependencies inside an ES module bundle still call require()
  banner: { js: "import { createRequire as __egsCreateRequire } from 'node:module'; const require = __egsCreateRequire(import.meta.url);" },
  logLevel: "warning",
});
// clasp reads its version from the nearest package.json; "type": "module" also marks the folder as ESM
writeFileSync(join(claspRoot, "package.json"), JSON.stringify({ name: claspPkg.name, version: claspPkg.version, type: "module", license: claspPkg.license }, null, 2));
for (const name of ["LICENSE", "LICENSE.md"]) {
  const src = join(root, "node_modules", "@google", "clasp", name);
  if (existsSync(src)) cpSync(src, join(claspRoot, "LICENSE-clasp.txt"));
}
// prove the bundle starts before shipping it
const claspVersion = execFileSync(process.execPath, [join(claspRoot, "clasp.mjs"), "--version"], { encoding: "utf8" }).trim();
if (claspVersion !== claspPkg.version) throw new Error(`bundled clasp reports "${claspVersion}", expected ${claspPkg.version}`);
console.log(`  clasp ${claspVersion} bundled`);

// ── 3. the Electron shell ──
step("staging the shell");
const shell = join(out, "shell");
mkdirSync(shell, { recursive: true });
cpSync(join(root, "electron", "main.js"), join(shell, "main.js"));
writeFileSync(
  join(shell, "package.json"),
  JSON.stringify(
    {
      name: pkg.name,
      productName: "EasyGAS IDE",
      version: pkg.version,
      description: "AI coding app for Google Apps Script — Powered by Mr.KKD",
      author: "Mr.KKD",
      license: "SEE LICENSE IN LICENSE",
      main: "main.js",
    },
    null,
    2,
  ),
);

mkdirSync(join(root, "build"), { recursive: true });
// The Windows icon is assembled here as a .ico of ready-made PNG sizes. Left to electron-builder, it
// converts a PNG with a WebAssembly tool that fails outright when the machine is short of memory
// ("WebAssembly.Memory(): could not allocate memory") and stops the whole build.
// Windows (and electron-builder) want a 256-px image: made by halving the 512-px icon exactly.
const icon256 = halvePng(readFileSync(join(root, "public", "icon", "pwa-icon-512x512.png")));
writeFileSync(
  join(root, "build", "icon.ico"),
  buildIco([icon256, ...[192, 96, 48, 32, 16].map((px) => readFileSync(join(root, "public", "icon", ICON_FILES[px])))]),
);
// The installer's licence page (Thai): what the app does by itself and a plain summary, then the
// licence itself in English — the English text is the binding one. One paragraph per line: the page
// wraps text itself, so hard line breaks only produce ragged lines.
// Written as UTF-8 WITH a byte-order mark: without it NSIS reads the file in the Windows ANSI code page
// and every non-ASCII character comes out garbled (an em dash showed as "â€”"). electron-builder adds
// the mark only to per-language licence files, not to an explicitly named one like ours.
const notice = [
  "EasyGAS IDE · Powered by Mr.KKD",
  "",
  "ก่อนติดตั้ง โปรดอ่าน",
  "• แอปทำงานในเครื่องนี้ และใช้บัญชี AI กับบัญชี Google ของคุณเอง ไม่มีเซิร์ฟเวอร์กลาง",
  "• แอปตรวจหาชุดกฎรุ่นใหม่จาก GitHub วันละครั้งแล้วดาวน์โหลดมาใช้ โดยไม่ส่งข้อมูลของคุณหรือโปรเจกต์ใด ๆ ออกไป ปิดได้ในหน้า ตั้งค่า",
  "• โปรแกรมนี้ใช้ได้ฟรี",
  "",
  "สรุปสัญญาอนุญาต (ข้อความที่มีผลทางกฎหมายคือฉบับภาษาอังกฤษด้านล่าง)",
  "• ใช้ แก้ไข และแจกต่อได้ รวมถึงใช้ในงานของบริษัท",
  "• ห้ามขายโปรแกรมนี้ หรือเปิดเป็นบริการเก็บเงินที่มูลค่ามาจากโปรแกรมนี้ (Commons Clause)",
  "• โค้ด Apps Script ที่คุณสร้างด้วยแอปนี้เป็นของคุณ นำไปใช้เชิงพาณิชย์ได้",
  "",
  "=".repeat(60),
  "",
].join("\r\n");
const licenseText = notice + readFileSync(join(root, "LICENSE"), "utf8").replace(/^﻿/, "").replace(/\r?\n/g, "\r\n");
writeFileSync(join(root, "build", "license.txt"), Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from(licenseText, "utf8")]));

const size = (dir) => {
  let total = 0;
  for (const e of readdirSync(dir, { withFileTypes: true })) total += e.isDirectory() ? size(join(dir, e.name)) : statSync(join(dir, e.name)).size;
  return total;
};
console.log(`  server ${Math.round(size(appDir) / 1e6)} MB · clasp ${Math.round(size(claspRoot) / 1e6)} MB`);

// ── 4. package ──
step(args.has("--dir") ? "packaging (unpacked only)" : "packaging the installer");
run(`npx electron-builder --win --x64 ${args.has("--dir") ? "--dir " : ""}--publish never`);
console.log(`\ndone → ${join("dist", "desktop", "out")}`);
