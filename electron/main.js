// EasyGAS IDE — desktop shell (Electron main process).
//
// The app itself is the Next.js server (resources/app/server.js, the standalone build). This file only:
//   1. starts that server as a child process on a free 127.0.0.1 port (Electron's own Node, no shell),
//   2. shows it in one locked-down window,
//   3. sends every outside link to the user's real browser, and
//   4. stops the server (and anything it started) when the app quits, and
//   5. while "use from a phone" is on (lib/remote, docs/REMOTE-PLAN.md): keeps running in the tray when the
//      window is closed, keeps the PC from sleeping, and shows the gateway's notifications.
// It holds no secrets and gives the page no Node access: contextIsolation on, nodeIntegration off,
// sandbox on, no preload.
const { app, BrowserWindow, Menu, Notification, Tray, dialog, nativeImage, nativeTheme, powerSaveBlocker, session, shell } = require("electron");
const { spawn, execFile } = require("node:child_process");
const fs = require("node:fs");
const http = require("node:http");
const net = require("node:net");
const path = require("node:path");

const PRODUCT = "EasyGAS IDE";
const START_TIMEOUT_MS = 45_000;
const MAX_LOG_BYTES = 1_000_000;
const TITLEBAR_HEIGHT = 48; // px — matches the top bar's height (h-12) in components/AppTopBar.tsx

// The app's data lives in %APPDATA%\EasyGAS IDE (lib/local/paths.ts). Electron's own files (cache,
// window state, logs) go in a subfolder so the two never mix.
app.setName(PRODUCT);
// EASYGAS_DATA_DIR (testing) moves Electron's folder too, so a test copy has its own single-instance lock and
// can run beside the installed app
app.setPath("userData", path.join(process.env.EASYGAS_DATA_DIR?.trim() ? path.resolve(process.env.EASYGAS_DATA_DIR.trim()) : path.join(app.getPath("appData"), PRODUCT), "electron"));

let win = null;
let server = null;
let quitting = false;
let started = false; // the app page is on screen
let appPort = 0;

// ------------------------------------------------------------------ remote access (tray, awake, notices)
// The server writes <data>/remote-state.json (lib/remote/store.ts RemoteState); we only read it.
// same folder as lib/local/paths.ts dataRoot(), including its EASYGAS_DATA_DIR override (testing)
const dataDir = () => (process.env.EASYGAS_DATA_DIR?.trim() ? path.resolve(process.env.EASYGAS_DATA_DIR.trim()) : path.join(app.getPath("appData"), PRODUCT));
const remoteStatePath = () => path.join(dataDir(), "remote-state.json");

// ── app updates ──
// electron-updater against GitHub Releases (resources/app-update.yml, written by electron-builder). Runs at
// launch when Settings → ข้อมูลในเครื่อง → "อัปเดตอัตโนมัติเมื่อเปิดโปรแกรม" is on (settings.json
// app.app_auto_update, default on): downloads in the background and installs when the app quits. We write
// <data>/update-state.json; the server only reads it (lib/app-update.ts) for the Settings card and the notice.
// The other way round, Settings' "ตรวจสอบการอัปเดต" / "ติดตั้งและเปิดใหม่" buttons write
// <data>/update-request.json ({action, id}); we watch it, as remote-state.json.
const updateStatePath = () => path.join(dataDir(), "update-state.json");
const updateRequestPath = () => path.join(dataDir(), "update-request.json");
const UPDATE_CHECK_DELAY_MS = 8_000;
let updateState = null;
let updater = null;
/** the user asked for this check: a download it brings installs on quit even with auto-update off */
let manualUpdate = false;
let lastUpdateRequest = null;

function autoUpdateOn() {
  try {
    const s = JSON.parse(fs.readFileSync(path.join(dataDir(), "settings.json"), "utf8"));
    return s?.app?.app_auto_update !== "off";
  } catch {
    return true; // no settings yet: the default
  }
}

function writeUpdateState(patch) {
  updateState = { status: "off", current: app.getVersion(), version: null, percent: null, error: null, ...(updateState ?? {}), ...patch, at: new Date().toISOString() };
  const file = updateStatePath();
  try {
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(`${file}.tmp`, JSON.stringify(updateState));
    fs.renameSync(`${file}.tmp`, file);
  } catch {
    /* the notice is a convenience; the update itself does not depend on it */
  }
}

/** electron-updater, set up once (at launch when auto-update is on, else at the first manual check). */
function ensureUpdater() {
  if (updater) return updater;
  try {
    ({ autoUpdater: updater } = require("electron-updater"));
  } catch (e) {
    writeUpdateState({ status: "error", error: `updater: ${e.message}` });
    return null;
  }
  updater.logger = null;
  updater.autoDownload = true;
  updater.autoInstallOnAppQuit = true;
  let lastPercent = -1;
  updater.on("checking-for-update", () => writeUpdateState({ status: "checking", error: null }));
  updater.on("update-not-available", () => writeUpdateState({ status: "latest", version: null, percent: null }));
  updater.on("update-available", (info) => writeUpdateState({ status: "downloading", version: info.version, percent: 0 }));
  updater.on("download-progress", (p) => {
    const pct = Math.floor(p.percent);
    if (pct < lastPercent + 5) return;
    lastPercent = pct;
    writeUpdateState({ status: "downloading", percent: pct });
  });
  updater.on("update-downloaded", (info) => writeUpdateState({ status: "ready", version: info.version, percent: 100 }));
  updater.on("error", (e) => {
    if (updateState?.status !== "ready") writeUpdateState({ status: "error", error: String(e?.message ?? e).slice(0, 200) });
  });
  return updater;
}

function checkForUpdate() {
  if (quitting || ["checking", "downloading", "ready"].includes(updateState?.status)) return;
  const u = ensureUpdater();
  if (!u) return;
  writeUpdateState({ status: "checking", error: null });
  u.checkForUpdates().catch(() => {}); // failures arrive through "error"
}

/** "ติดตั้งและเปิดใหม่": install the downloaded version now and start it again. */
function installUpdateNow() {
  if (!updater || updateState?.status !== "ready") return;
  quitting = true;
  updater.quitAndInstall(true, true);
}

function readUpdateRequest(initial) {
  let req;
  try {
    req = JSON.parse(fs.readFileSync(updateRequestPath(), "utf8"));
  } catch {
    return;
  }
  if (!req || typeof req.id !== "string" || req.id === lastUpdateRequest) return;
  lastUpdateRequest = req.id;
  if (initial) return; // left by the last run: not a request to this one
  if (req.action === "check") {
    manualUpdate = true;
    checkForUpdate();
  } else if (req.action === "install") installUpdateNow();
}

function startAutoUpdate() {
  if (!app.isPackaged) return;
  readUpdateRequest(true);
  fs.watchFile(updateRequestPath(), { interval: 1000 }, () => readUpdateRequest(false));
  // a fresh state every launch: a "ready" left by the last run was installed when that run quit
  writeUpdateState({ status: "off", version: null, percent: null, error: null });
  if (!autoUpdateOn()) return;
  if (!ensureUpdater()) return;
  setTimeout(checkForUpdate, UPDATE_CHECK_DELAY_MS);
}
let remote = { enabled: false, on: false, url: null, devices: 0, event: null };
let tray = null;
let awake = null; // powerSaveBlocker id
let lastEventId = null;
let toldAboutTray = false;

function showWindow(pathAfter) {
  if (!win) return;
  if (pathAfter && appPort) win.loadURL(`http://127.0.0.1:${appPort}${pathAfter}`);
  if (win.isMinimized()) win.restore();
  win.show();
  win.focus();
}

// ------------------------------------------------------------------ easygas:// links (shared code)
// The website's "โคลนลง EasyGAS IDE" button opens easygas://clone/<slug>. Windows hands the link to the
// running app as a second instance's argv (or as this instance's argv on a cold start); the app page that
// takes it is /projects?mode=clone&clone=<slug> (components/projects/CloneFromLink.tsx). Only that one
// shape is honoured — anything else in the link is ignored.
const PROTOCOL = "easygas";
let pendingAppPath = null; // a link that arrived before the server was up

/** The in-app path for a protocol link, or null when it is not one we know. */
function appPathForLink(raw) {
  if (typeof raw !== "string") return null;
  const m = raw.match(/^easygas:\/\/clone\/([A-Za-z0-9]{6,16})\/?(?:[?#].*)?$/);
  return m ? `/projects?mode=clone&clone=${m[1].toLowerCase()}` : null;
}

/** The first protocol link among process arguments (Windows puts it last). */
function linkFromArgv(argv) {
  return (argv || []).map(appPathForLink).find(Boolean) || null;
}

function openAppPath(appPath) {
  if (!appPath) return;
  if (started && appPort) showWindow(appPath);
  else pendingAppPath = appPath; // showApp() opens it once the server answers
}

function registerProtocol() {
  try {
    // in development the handler must point at electron.exe + this script, not at the bare exe
    if (process.defaultApp && process.argv.length >= 2) app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
    else app.setAsDefaultProtocolClient(PROTOCOL);
  } catch {
    // not registered: the website's fallback (paste the link in the app) still works
  }
}

/** Ask the app's own server to switch remote access off (a loopback request, so middleware.ts lets it in). */
function turnRemoteOff() {
  if (!appPort) return;
  const req = http.request({ host: "127.0.0.1", port: appPort, method: "POST", path: "/api/remote/off", timeout: 5000 }, (res) => res.resume());
  req.on("error", () => {});
  req.end();
}

function trayMenu() {
  const status = remote.on ? `รีโมทเปิดอยู่ · จับคู่ ${remote.devices} เครื่อง` : "รีโมทกำลังเชื่อมต่อ…";
  return Menu.buildFromTemplate([
    { label: status, enabled: false },
    { type: "separator" },
    { label: "เปิดหน้าต่าง", click: () => showWindow() },
    { label: "ตั้งค่าการใช้จากมือถือ", click: () => showWindow("/settings?s=remote") },
    { label: "ปิดรีโมท", click: turnRemoteOff },
    { type: "separator" },
    {
      label: "ออกจาก EasyGAS IDE",
      click: () => {
        quitting = true;
        app.quit();
      },
    },
  ]);
}

// The tray icon is our own file (resources/icon.ico, put there by scripts/desktop-after-pack.cjs). Asking
// Windows for the exe's icon (app.getFileIcon) answers from its icon cache, which handed back the generic
// program icon after an install over an older version. The exe's icon stays the fallback.
async function trayIcon() {
  const file = app.isPackaged ? path.join(process.resourcesPath, "icon.ico") : path.join(__dirname, "..", "build", "icon.ico");
  const own = nativeImage.createFromPath(file);
  if (!own.isEmpty()) return own;
  return app.getFileIcon(process.execPath, { size: "small" }).catch(() => null);
}

async function applyRemoteState(next, initial) {
  remote = next;
  if (remote.enabled && awake === null) awake = powerSaveBlocker.start("prevent-app-suspension");
  if (!remote.enabled && awake !== null) {
    powerSaveBlocker.stop(awake);
    awake = null;
  }
  if (remote.enabled && !tray) {
    const icon = await trayIcon();
    if (!remote.enabled || tray || !icon) return;
    tray = new Tray(icon);
    tray.setToolTip(`${PRODUCT} · ใช้จากมือถือได้`);
    tray.on("click", () => showWindow());
  }
  if (!remote.enabled && tray) {
    tray.destroy();
    tray = null;
    if (win && !win.isVisible()) win.show(); // never leave a hidden window without a way back
  }
  if (tray) tray.setContextMenu(trayMenu());
  const ev = remote.event;
  if (ev && ev.id !== lastEventId) {
    lastEventId = ev.id;
    if (!initial && Notification.isSupported()) {
      const n = new Notification({ title: ev.title, body: ev.body });
      const target = typeof ev.path === "string" && ev.path.startsWith("/") && !ev.path.startsWith("//") ? ev.path : "/settings?s=remote";
      n.on("click", () => showWindow(target));
      n.show();
    }
  }
}

function readRemoteState(initial = false) {
  fs.readFile(remoteStatePath(), "utf8", (err, text) => {
    if (err) return;
    try {
      const s = JSON.parse(text);
      void applyRemoteState(
        { enabled: s.enabled === true, on: s.on === true, url: s.url ?? null, devices: Number(s.devices) || 0, event: s.event ?? null },
        initial,
      );
    } catch {
      // a half-written file is replaced atomically, so this is a rare stale read: the next change fixes it
    }
  });
}

function watchRemoteState() {
  readRemoteState(true);
  fs.watchFile(remoteStatePath(), { interval: 1500 }, () => readRemoteState(false));
}

const resourcesDir = () => (app.isPackaged ? process.resourcesPath : path.join(__dirname, "..", "dist", "desktop", "resources"));

const validPort = (n) => Number.isInteger(n) && n > 1023 && n < 65536;
const portFile = () => path.join(app.getPath("userData"), "port.json");

/** `port` when nothing else is listening on it, else a port the OS hands out. */
const probePort = (port) =>
  new Promise((resolve, reject) => {
    const probe = net.createServer();
    probe.once("error", (e) => (port ? resolve(0) : reject(e)));
    probe.listen(port, "127.0.0.1", () => {
      const got = probe.address().port;
      probe.close(() => resolve(got));
    });
  });

/**
 * The port the server will listen on. The same one as last time whenever it is free: the page's
 * origin is http://127.0.0.1:<port>, and the browser keeps localStorage (theme, tour) per origin,
 * so a new port each launch would forget all of it.
 */
async function freePort() {
  const fixed = Number(process.env.EASYGAS_PORT); // testing only
  if (validPort(fixed)) return fixed;
  let last = 0;
  try {
    const saved = JSON.parse(fs.readFileSync(portFile(), "utf8")).port;
    if (validPort(saved)) last = saved;
  } catch {
    // first launch, or an unreadable file: pick a new port
  }
  const port = (last && (await probePort(last))) || (await probePort(0));
  if (port !== last) {
    try {
      fs.writeFileSync(portFile(), JSON.stringify({ port }));
    } catch {
      // not remembered: the next launch gets a new port, nothing worse
    }
  }
  return port;
}

/** The bundled clasp CLI: one file (scripts/build-desktop.mjs bundles clasp and its dependencies). */
const claspEntry = () => path.join(resourcesDir(), "clasp", "clasp.mjs");

/**
 * server.log, kept to about two files of MAX_LOG_BYTES (current + .old) however long the app runs.
 * It holds the server's own console output — errors and stack traces, never API keys.
 */
function openLog() {
  const file = path.join(app.getPath("userData"), "server.log");
  fs.mkdirSync(path.dirname(file), { recursive: true });
  let size = 0;
  try {
    size = fs.statSync(file).size;
  } catch {
    /* no log yet */
  }
  let stream = null;
  const rotate = () => {
    if (stream) stream.end();
    try {
      fs.renameSync(file, `${file}.old`);
    } catch {
      /* nothing to rotate */
    }
    size = 0;
  };
  if (size > MAX_LOG_BYTES) rotate();
  stream = fs.createWriteStream(file, { flags: "a" });
  return {
    write(chunk) {
      size += Buffer.byteLength(chunk);
      if (size > MAX_LOG_BYTES) {
        rotate();
        stream = fs.createWriteStream(file, { flags: "a" });
        size = Buffer.byteLength(chunk);
      }
      stream.write(chunk);
    },
  };
}

function startServer(port) {
  const serverDir = path.join(resourcesDir(), "app");
  const log = openLog();
  log.write(`\n[${new Date().toISOString()}] starting ${PRODUCT} ${app.getVersion()} on 127.0.0.1:${port}\n`);
  // desktop-entry.js (electron/server-entry.js) watches its stdin, which we hold open: if this shell
  // dies without running its quit handlers, the server notices and stops itself.
  server = spawn(process.execPath, [path.join(serverDir, "desktop-entry.js")], {
    cwd: serverDir,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: "1", // run Electron's binary as plain Node
      NODE_ENV: "production",
      PORT: String(port),
      HOSTNAME: "127.0.0.1", // never bind to the network
      EASYGAS_CLASP_ENTRY: claspEntry(),
      EASYGAS_DESKTOP: "1",
    },
    stdio: ["pipe", "pipe", "pipe"],
    windowsHide: true,
  });
  server.stdin.on("error", () => {}); // the pipe closing when the server exits is not an error for us
  server.stdout.on("data", (d) => log.write(d));
  server.stderr.on("data", (d) => log.write(d));
  server.once("exit", (code) => {
    log.write(`[${new Date().toISOString()}] server exited (${code})\n`);
    if (quitting || !started) return; // a failure during start-up is reported once, by the caller
    dialog.showErrorBox(PRODUCT, `ส่วนประมวลผลของแอปหยุดทำงาน (รหัส ${code})\nเปิดแอปใหม่อีกครั้ง ถ้ายังเป็นอยู่ ดูรายละเอียดใน:\n${path.join(app.getPath("userData"), "server.log")}`);
    app.quit();
  });
}

function stopServer() {
  if (!server || server.exitCode !== null) return;
  // the server may have clasp or an AI CLI running under it — end the whole tree
  if (process.platform === "win32") execFile("taskkill", ["/PID", String(server.pid), "/T", "/F"], () => {});
  else server.kill("SIGTERM");
}

function waitUntilReady(port) {
  const deadline = Date.now() + START_TIMEOUT_MS;
  return new Promise((resolve, reject) => {
    const attempt = () => {
      if (!server || server.exitCode !== null) return reject(new Error("server exited during start"));
      const req = http.get({ host: "127.0.0.1", port, path: "/api/health", timeout: 2000 }, (res) => {
        res.resume();
        if (res.statusCode !== 200) return retry();
        // Someone answered — make sure it is OUR server: had another program taken the port first,
        // ours would have failed to bind and be gone by now.
        setTimeout(() => (server && server.exitCode === null ? resolve() : reject(new Error("the port was taken by another program"))), 400);
      });
      req.on("error", retry);
      req.on("timeout", () => req.destroy());
    };
    const retry = () => (Date.now() > deadline ? reject(new Error("server did not start in time")) : setTimeout(attempt, 300));
    attempt();
  });
}

// Shown the moment the app starts, so a double-click is answered at once while the server warms up.
// Self-contained (no network, no files): the logo is drawn in SVG after the app icon, a ring turns
// around it, and a note appears if the start takes long (the first run after an install does).
const SPLASH_BG = { dark: "#0d1117", light: "#f6f7f5" };
const SPLASH =
  "data:text/html;charset=utf-8," +
  encodeURIComponent(`<!doctype html>
<html lang="th"><head><meta charset="utf-8"><title>${PRODUCT}</title>
<style>
  :root { --bg: ${SPLASH_BG.light}; --fg: #1c2430; --muted: #5b6573; --track: #e3e7e4; --ring: #10b981; }
  @media (prefers-color-scheme: dark) { :root { --bg: ${SPLASH_BG.dark}; --fg: #e6edf3; --muted: #8b96a5; --track: #1f2937; --ring: #34d399; } }
  html, body { margin: 0; height: 100%; }
  body { display: grid; place-items: center; background: var(--bg); color: var(--fg); -webkit-app-region: drag; user-select: none;
         font: 15px "Leelawadee UI", "Segoe UI", system-ui, sans-serif; }
  .box { display: flex; flex-direction: column; align-items: center; gap: 22px; }
  .logo { position: relative; width: 132px; height: 132px; }
  .ring { position: absolute; inset: 0; animation: spin 1.4s linear infinite; }
  .mark { position: absolute; inset: 22px; animation: breathe 2.8s ease-in-out infinite; }
  .spark { transform-origin: 74px 12.5px; animation: twinkle 2.8s ease-in-out infinite; }
  h1 { margin: 0; font-size: 22px; font-weight: 700; letter-spacing: .2px; }
  .status { margin-top: -12px; padding-left: 1.2em; color: var(--muted); }
  .dots::after { content: ""; display: inline-block; width: 1.2em; text-align: left; animation: dots 1.4s steps(4, end) infinite; }
  .slow { max-width: 300px; text-align: center; font-size: 13px; color: var(--muted); opacity: 0; animation: show .6s ease 8s forwards; }
  .by { position: fixed; bottom: 18px; font-size: 12px; color: var(--muted); }
  @keyframes spin { to { transform: rotate(360deg); } }
  @keyframes breathe { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.04); } }
  @keyframes twinkle { 0%, 100% { transform: scale(1) rotate(0); opacity: 1; } 50% { transform: scale(.7) rotate(25deg); opacity: .65; } }
  @keyframes dots { 0% { content: ""; } 25% { content: "."; } 50% { content: ".."; } 75% { content: "..."; } }
  @keyframes show { to { opacity: 1; } }
  @media (prefers-reduced-motion: reduce) { .ring, .mark, .spark, .dots::after { animation: none; } .slow { animation-duration: .01s; } }
</style></head>
<body>
  <div class="box" role="status" aria-live="polite">
    <div class="logo" aria-hidden="true">
      <svg class="ring" viewBox="0 0 132 132">
        <circle cx="66" cy="66" r="62" fill="none" stroke="var(--track)" stroke-width="4"/>
        <circle cx="66" cy="66" r="62" fill="none" stroke="var(--ring)" stroke-width="4" stroke-linecap="round" stroke-dasharray="90 300"/>
      </svg>
      <svg class="mark" viewBox="0 0 88 88">
        <defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ad49a"/><stop offset="1" stop-color="#10a979"/></linearGradient></defs>
        <path d="M24 16h40a14 14 0 0 1 14 14v22a14 14 0 0 1-14 14H34l-12 11a2 2 0 0 1-3.3-1.6V66.2A14 14 0 0 1 10 52V30a14 14 0 0 1 14-14z" fill="url(#g)"/>
        <g fill="none" stroke="#0b7d58" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".55">
          <path d="M33 33l-8 8 8 8"/><path d="M55 33l8 8-8 8"/><path d="M48 30l-8 22"/>
        </g>
        <path class="spark" d="M74 1c1.2 7.2 4.3 10.3 11.5 11.5-7.2 1.2-10.3 4.3-11.5 11.5-1.2-7.2-4.3-10.3-11.5-11.5 7.2-1.2 10.3-4.3 11.5-11.5z" fill="#f2b632"/>
      </svg>
    </div>
    <h1>${PRODUCT}</h1>
    <div class="status"><span>กำลังเปิดแอป</span><span class="dots"></span></div>
    <div class="slow">ครั้งแรกหลังติดตั้งอาจใช้เวลานานกว่าปกติ เพราะ Windows ตรวจไฟล์ของแอปอยู่</div>
  </div>
  <div class="by">Powered by Mr.KKD</div>
</body></html>`);

function createWindow() {
  win = new BrowserWindow({
    width: 1360,
    height: 860,
    minWidth: 900,
    minHeight: 600,
    title: PRODUCT,
    // the splash follows the system theme; matching it avoids a dark flash on a light desktop
    backgroundColor: nativeTheme.shouldUseDarkColors ? SPLASH_BG.dark : SPLASH_BG.light,
    autoHideMenuBar: true,
    // One bar, not two: the page's own top bar is the title bar (it carries the drag region, see
    // `.titlebar` in app/globals.css) and Windows draws only its three window buttons over it.
    // The buttons sit on a see-through strip with mid-grey glyphs, readable on the light and dark themes.
    titleBarStyle: "hidden",
    titleBarOverlay: { color: "#00000000", symbolColor: "#8a94a0", height: TITLEBAR_HEIGHT },
    webPreferences: { contextIsolation: true, nodeIntegration: false, sandbox: true, spellcheck: false },
  });
  // With remote access on, closing the window keeps the app (and the phone's way in) running in the tray.
  win.on("close", (e) => {
    if (quitting || !remote.enabled || !tray) return;
    e.preventDefault();
    win.hide();
    if (!toldAboutTray && Notification.isSupported()) {
      toldAboutTray = true;
      new Notification({ title: PRODUCT, body: "ยังทำงานอยู่ให้มือถือใช้ได้ เปิดหน้าต่างหรือออกจากแอปได้ที่ไอคอนมุมขวาล่าง" }).show();
    }
  });
  // a Windows shutdown / sign-out must close the app, not hide it
  win.on("session-end", () => {
    quitting = true;
  });
  win.on("closed", () => {
    win = null;
  });
  win.loadURL(SPLASH);
}

/** Point the window at the running app and lock its navigation to it. */
function showApp(port) {
  if (!win) return; // the user closed the window while the server was starting
  const origin = `http://127.0.0.1:${port}`;
  const inApp = (url) => url === origin || url.startsWith(`${origin}/`);
  const openOutside = (url) => {
    if (/^https:\/\//i.test(url)) shell.openExternal(url); // only real web links leave the app
  };
  // No device permissions at all. The one thing the app's own pages need is writing text to the
  // clipboard ("copy" buttons); frames from other origins (the Google preview) get nothing.
  const allowed = (permission, requester) => permission === "clipboard-sanitized-write" && typeof requester === "string" && inApp(requester.replace(/\/$/, ""));
  session.defaultSession.setPermissionRequestHandler((_wc, permission, callback, details) => callback(allowed(permission, details.requestingUrl)));
  session.defaultSession.setPermissionCheckHandler((_wc, permission, requestingOrigin) => allowed(permission, requestingOrigin));
  // New windows are never created: an in-app link loads here, anything else opens in the browser.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (inApp(url)) win.loadURL(url);
    else openOutside(url);
    return { action: "deny" };
  });
  // The window itself never leaves the app.
  win.webContents.on("will-navigate", (event, url) => {
    if (inApp(url)) return;
    event.preventDefault();
    openOutside(url);
  });
  started = true;
  appPort = port;
  watchRemoteState();
  const first = pendingAppPath || linkFromArgv(process.argv) || "/";
  pendingAppPath = null;
  win.loadURL(`${origin}${first}`);
}

if (!app.requestSingleInstanceLock()) {
  app.quit();
} else {
  app.on("second-instance", (_event, argv) => {
    const appPath = linkFromArgv(argv);
    if (appPath) openAppPath(appPath);
    else showWindow();
  });
  // macOS delivers protocol links as events; harmless on Windows
  app.on("open-url", (event, url) => {
    event.preventDefault();
    openAppPath(appPathForLink(url));
  });

  app.whenReady().then(async () => {
    Menu.setApplicationMenu(null);
    app.setAppUserModelId("com.mrkkd.easygas-ide"); // electron-builder.yml appId: Windows notifications need it
    registerProtocol();
    // nothing is permitted until the app's own origin is known (showApp installs the real handlers)
    session.defaultSession.setPermissionRequestHandler((_wc, _permission, callback) => callback(false));
    session.defaultSession.setPermissionCheckHandler(() => false);
    createWindow();
    try {
      const port = await freePort();
      if (quitting) return; // the window was closed before the server was even started
      startServer(port);
      await waitUntilReady(port);
      showApp(port);
      startAutoUpdate();
    } catch (e) {
      if (quitting) return; // the window was closed during start-up — nothing to report
      quitting = true;
      stopServer();
      dialog.showErrorBox(PRODUCT, `เปิดแอปไม่สำเร็จ: ${e.message}\nดูรายละเอียดใน:\n${path.join(app.getPath("userData"), "server.log")}`);
      app.quit();
    }
  });

  app.on("window-all-closed", () => app.quit());
  app.on("before-quit", () => {
    quitting = true;
    // switched off after the download: keep this version (unless the user fetched it by hand this run)
    if (updater && !autoUpdateOn() && !manualUpdate) updater.autoInstallOnAppQuit = false;
    fs.unwatchFile(remoteStatePath());
    fs.unwatchFile(updateRequestPath());
    if (awake !== null) powerSaveBlocker.stop(awake);
    if (tray) tray.destroy();
    stopServer();
  });
}
