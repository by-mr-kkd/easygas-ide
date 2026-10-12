/**
 * "ติดตั้งเป็นแอป" invitation for the GitHub Pages copy (Pro `pwa`, lib/pages/pwa.ts adds it). Written by the
 * app, never by the AI: the AI only places `<button data-egs-install>` on a profile / settings screen.
 *
 *   - a pop-up once, a few seconds after the page opens (a "ไว้ทีหลัง" is remembered for a week);
 *   - every `[data-egs-install]` element opens the same help, and is hidden once the app is installed;
 *   - the help follows the device: Android / desktop Chrome-Edge get the browser's own install prompt
 *     (`beforeinstallprompt`); iPhone/iPad have none, so the steps of the share sheet are shown; in-app
 *     browsers (LINE, Facebook, Instagram) cannot install at all → "open in Safari / Chrome" + copy link.
 *
 * Plain ES5 in a string (the page has no build step). Its look lives in a shadow root, so the app's own CSS
 * and the pop-up never touch each other. Tested in tests/pwa-install.test.ts.
 */

export const INSTALL_SCRIPT_PATH = "install.js";

/**
 * The device, from the user agent alone. Kept as source text so the test runs the very same function.
 *   ios-safari · ios-other (Chrome/Edge/Firefox on iOS) · ios-inapp · android · android-inapp · desktop
 */
export const PLATFORM_SRC = `function egsPlatform(ua, platform, touch) {
  ua = ua || "";
  var inApp = /\\bLine\\/|FBAN|FBAV|FB_IAB|Instagram|MicroMessenger|; wv\\)/.test(ua);
  var ios = /iPad|iPhone|iPod/.test(ua) || (platform === "MacIntel" && touch > 1);
  if (ios) return inApp ? "ios-inapp" : /CriOS|FxiOS|EdgiOS|OPiOS/.test(ua) ? "ios-other" : "ios-safari";
  if (/Android/i.test(ua)) return inApp ? "android-inapp" : "android";
  return "desktop";
}`;

const SHARE_ICON =
  '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" style="vertical-align:-3px"><path d="M12 3v12M7 8l5-5 5 5"/><path d="M5 12v7a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-7"/></svg>';

/** The script for one app: its name and colour are baked in (both already cleaned by pwaFiles). */
export function installScript(name: string, color: string): string {
  const js = (v: string) => JSON.stringify(v).replace(/</g, "\\u003c");
  return `// EasyGAS: invites the visitor to install this page as an app (written by the app, not by the AI)
(function () {
  ${PLATFORM_SRC}
  var NAME = ${js(name)}, COLOR = ${js(color)}, KEY = "egs-install-later", WEEK = 7 * 864e5;
  var nav = navigator, deferred = null, host = null;
  var kind = egsPlatform(nav.userAgent, nav.platform, nav.maxTouchPoints || 0);

  function installed() {
    try { if (matchMedia("(display-mode: standalone)").matches) return true; } catch (e) {}
    return nav.standalone === true;
  }
  function later(set) {
    try {
      if (set) { localStorage.setItem(KEY, String(Date.now())); return true; }
      return Date.now() - Number(localStorage.getItem(KEY) || 0) < WEEK;
    } catch (e) { return false; }
  }
  function markInstalled() {
    document.documentElement.classList.add("egs-installed");
    close();
  }

  // installed → every install button goes away, whatever screen draws it later
  var css = document.createElement("style");
  css.textContent = "html.egs-installed [data-egs-install]{display:none!important}";
  (document.head || document.documentElement).appendChild(css);
  if (installed()) document.documentElement.classList.add("egs-installed");

  addEventListener("beforeinstallprompt", function (e) { e.preventDefault(); deferred = e; });
  addEventListener("appinstalled", markInstalled);

  function steps(list) {
    return "<ol>" + list.map(function (s) { return "<li>" + s + "</li>"; }).join("") + "</ol>";
  }
  function body() {
    if (deferred) return { text: "เปิดจากไอคอนบนหน้าจอได้ทันที เต็มจอ ไม่มีแถบเบราว์เซอร์", main: "ติดตั้ง" };
    switch (kind) {
      case "ios-safari":
        return { text: steps(["กดปุ่มแชร์ ${SHARE_ICON.replace(/"/g, '\\"')} ที่แถบด้านล่าง", "เลื่อนลงแล้วเลือก <b>เพิ่มไปยังหน้าจอโฮม</b>", "กด <b>เพิ่ม</b> ที่มุมขวาบน"]) };
      case "ios-other":
        return { text: steps(["กดปุ่มแชร์ ${SHARE_ICON.replace(/"/g, '\\"')} ที่ช่องที่อยู่ด้านบน", "เลือก <b>เพิ่มไปยังหน้าจอโฮม</b>", "กด <b>เพิ่ม</b>"]) };
      case "ios-inapp":
        return { text: "แอปที่เปิดลิงก์นี้อยู่ติดตั้งไม่ได้ เปิดลิงก์ใน <b>Safari</b> ก่อน (กด ⋯ หรือ ↗ แล้วเลือกเปิดในเบราว์เซอร์) แล้วกดปุ่มติดตั้งอีกครั้ง", copy: true };
      case "android-inapp":
        return { text: "แอปที่เปิดลิงก์นี้อยู่ติดตั้งไม่ได้ เปิดลิงก์ใน <b>Chrome</b> ก่อน (กด ⋮ แล้วเลือกเปิดในเบราว์เซอร์) แล้วกดปุ่มติดตั้งอีกครั้ง", copy: true };
      case "android":
        return { text: steps(["กดเมนู <b>⋮</b> มุมขวาบนของ Chrome", "เลือก <b>ติดตั้งแอป</b> หรือ <b>เพิ่มลงในหน้าจอหลัก</b>"]) };
      default:
        return { text: "ใช้ <b>Chrome</b> หรือ <b>Edge</b>: กดไอคอนติดตั้งท้ายช่องที่อยู่ หรือเมนู ⋮ → <b>ติดตั้ง " + esc(NAME) + "</b> (Safari บน Mac: เมนู File → Add to Dock)" };
    }
  }
  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }

  function close() { if (host) { host.remove(); host = null; } }
  function open(auto) {
    if (installed() || host) return;
    var b = body();
    host = document.createElement("div");
    host.setAttribute("data-egs-install-popup", "");
    var root = host.attachShadow ? host.attachShadow({ mode: "open" }) : host;
    root.innerHTML =
      "<style>" +
      ":host,.wrap{all:initial}" +
      ".wrap{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:flex-end;justify-content:center;background:rgba(15,23,42,.35);font:15px/1.55 system-ui,'Noto Sans Thai',sans-serif;color:#0f172a}" +
      "@media(min-width:640px){.wrap{align-items:center}}" +
      ".card{width:min(420px,100%);margin:12px;background:#fff;border-radius:16px;padding:18px;box-shadow:0 12px 40px rgba(0,0,0,.25)}" +
      ".head{display:flex;gap:12px;align-items:center;margin-bottom:10px}" +
      ".icon{width:44px;height:44px;border-radius:11px;background:" + COLOR + ";color:#fff;display:grid;place-items:center;font-weight:700;font-size:20px;flex:none}" +
      "h2{margin:0;font-size:16px;font-weight:700}p,ol{margin:0 0 4px;color:#334155}ol{padding-left:20px}li{margin:3px 0}" +
      ".row{display:flex;gap:8px;justify-content:flex-end;margin-top:14px;flex-wrap:wrap}" +
      "button{font:inherit;border-radius:10px;padding:8px 14px;cursor:pointer;border:1px solid #cbd5e1;background:#fff;color:#0f172a}" +
      "button.main{background:" + COLOR + ";border-color:" + COLOR + ";color:#fff;font-weight:600}" +
      "</style>" +
      '<div class="wrap" part="wrap"><div class="card" role="dialog" aria-modal="true" aria-label="ติดตั้งเป็นแอป">' +
      '<div class="head"><div class="icon">' + esc(Array.from(NAME)[0] || "A") + "</div><div><h2>ติดตั้ง " + esc(NAME) + " เป็นแอป</h2></div></div>" +
      (/^<ol>/.test(b.text) ? b.text : "<p>" + b.text + "</p>") +
      '<div class="row">' +
      (b.copy ? '<button data-act="copy">คัดลอกลิงก์</button>' : "") +
      '<button data-act="later">' + (b.main ? "ไว้ทีหลัง" : "ปิด") + "</button>" +
      (b.main ? '<button class="main" data-act="install">' + b.main + "</button>" : "") +
      "</div></div></div>";
    root.addEventListener("click", function (e) {
      var t = e.target, btn = t && t.closest ? t.closest("[data-act]") : null;
      // a tap on the dimmed backdrop = "ไว้ทีหลัง"
      var act = btn ? btn.getAttribute("data-act") : t && t.classList && t.classList.contains("wrap") ? "later" : null;
      if (act === "later") { if (auto) later(true); close(); }
      if (act === "copy") {
        try { navigator.clipboard.writeText(location.href); btn.textContent = "คัดลอกแล้ว"; } catch (err) {}
      }
      if (act === "install" && deferred) {
        var p = deferred; deferred = null; close();
        p.prompt();
        p.userChoice.then(function (c) { if (c && c.outcome === "accepted") markInstalled(); }, function () {});
      }
    });
    document.body.appendChild(host);
  }

  // the app's own buttons (a profile or settings screen): open the help, or the browser prompt straight away
  document.addEventListener("click", function (e) {
    var el = e.target && e.target.closest ? e.target.closest("[data-egs-install]") : null;
    if (!el) return;
    e.preventDefault();
    if (deferred) {
      var p = deferred; deferred = null;
      p.prompt();
      p.userChoice.then(function (c) { if (c && c.outcome === "accepted") markInstalled(); }, function () {});
    } else open(false);
  });

  // the invitation: once, a moment after opening — not on a desktop that offers no prompt (nothing to press)
  addEventListener("load", function () {
    setTimeout(function () {
      if (installed() || later(false)) return;
      if (kind === "desktop" && !deferred) return;
      open(true);
    }, 4000);
  });

  window.EgsInstall = { open: function () { open(false); }, platform: kind, installed: installed };
})();
`;
}
