/**
 * The few pages the remote gateway serves itself (pure): pair with a code, enter the PIN, resume on a
 * new link (Pro), and "not allowed". Plain HTML + inline CSS, Thai, phone-first, light/dark. The app
 * behind the gateway never sees a request that has not passed these.
 *
 * Look: the same as the Pro app on easygaside.tech (EasyGAS-Site lib/remote-app.ts) — paper white, ink,
 * brand green, IBM Plex Sans Thai — so going phone app → computer feels like one app. The font comes from
 * Google Fonts (these pages run before the device is let in, so the app's own font files are not served
 * yet); the system Thai font stands in when it cannot load.
 */

const esc = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);

const LOGO = `<svg viewBox="0 0 88 88" width="30" height="30" aria-hidden="true"><defs><linearGradient id="g" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#2ad49a"/><stop offset="1" stop-color="#10a979"/></linearGradient></defs><path d="M24 16h40a14 14 0 0 1 14 14v22a14 14 0 0 1-14 14H34l-12 11a2 2 0 0 1-3.3-1.6V66.2A14 14 0 0 1 10 52V30a14 14 0 0 1 14-14z" fill="url(#g)"/><g fill="none" stroke="#0b7d58" stroke-width="5" stroke-linecap="round" stroke-linejoin="round" opacity=".55"><path d="M33 33l-8 8 8 8"/><path d="M55 33l8 8-8 8"/><path d="M48 30l-8 22"/></g></svg>`;

const ICON = (d: string) =>
  `<span class="badge-ic"><svg viewBox="0 0 24 24" width="26" height="26" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${d}</svg></span>`;
const LOCK = ICON('<rect x="4.5" y="10.5" width="15" height="10" rx="2.5"/><path d="M8 10.5V7.5a4 4 0 0 1 8 0v3"/><circle cx="12" cy="15.5" r="1.2"/>');
const LINK = ICON('<rect x="2.5" y="4" width="13" height="9" rx="1.5"/><path d="M6 17h6M9 13v4"/><rect x="16.5" y="8" width="5" height="12" rx="1.3"/>');
const WAIT = ICON('<circle cx="12" cy="12" r="8.5"/><path d="M12 7.5V12l3 2"/>');

const CSS = `
:root{--paper:#fff;--paper2:#f3f7f4;--ink:#1b2432;--ink2:#4b5563;--faint:#8a94a0;--line:#e2e8e4;--green:#16a34a;--green-deep:#15803d;--mint-soft:#dcfce7;--bad:#dc2626;color-scheme:light}
@media (prefers-color-scheme:dark){:root{--paper:#0d1117;--paper2:#151b23;--ink:#e6edf3;--ink2:#a3adba;--faint:#6b7684;--line:#232b36;--green:#34d399;--green-deep:#4ade80;--mint-soft:#0f2a1d;--bad:#f87171;color-scheme:dark}}
*{box-sizing:border-box;-webkit-tap-highlight-color:transparent}html,body{margin:0}
body{min-height:100dvh;background:var(--paper);color:var(--ink);font-family:"IBM Plex Sans Thai","Noto Sans Thai","Leelawadee UI",system-ui,sans-serif;font-size:16px;line-height:1.6;text-wrap:pretty}
.shell{max-width:440px;margin:0 auto;min-height:100dvh;display:flex;flex-direction:column;padding:calc(env(safe-area-inset-top) + 14px) 20px calc(env(safe-area-inset-bottom) + 28px)}
.top{display:flex;align-items:center;gap:10px;height:44px;font-weight:700;letter-spacing:-.01em}
main{flex:1;display:flex;flex-direction:column;justify-content:center;padding-bottom:8vh}
.badge-ic{width:56px;height:56px;border-radius:18px;display:grid;place-items:center;background:var(--mint-soft);color:var(--green-deep);margin-bottom:18px}
h1{font-size:28px;line-height:1.2;font-weight:700;letter-spacing:-.02em;margin:0 0 6px}
p{margin:0 0 22px;color:var(--ink2);font-size:15px}
.nw{white-space:nowrap}b{color:var(--ink);font-weight:600}
.code{position:relative;display:grid;grid-template-columns:repeat(6,1fr);gap:8px}
.code input{width:100%;font:600 26px/1 "IBM Plex Mono",ui-monospace,Consolas,monospace;letter-spacing:.3em;text-align:center;padding:14px 8px;border:1.5px solid var(--line);border-radius:12px;background:var(--paper);color:var(--ink);grid-column:1/-1}
.js .code input{position:absolute;inset:0;opacity:0;padding:0;border:0;caret-color:transparent;color:transparent}
.cell{display:none}
.js .cell{display:grid;place-items:center;aspect-ratio:1/1.15;max-height:58px;border:1.5px solid var(--line);border-radius:12px;background:var(--paper);font:600 24px/1 "IBM Plex Mono",ui-monospace,Consolas,monospace;color:var(--ink);transition:border-color .12s,box-shadow .12s}
.js .code.focus .cell.at{border-color:var(--green);box-shadow:0 0 0 3px color-mix(in srgb,var(--green) 18%,transparent)}
.js .code.bad .cell{border-color:var(--bad)}
.dotc{width:12px;height:12px;border-radius:50%;background:var(--ink)}
button{margin-top:18px;width:100%;padding:14px;border:0;border-radius:14px;background:var(--ink);color:var(--paper);font:inherit;font-weight:600;font-size:17px;cursor:pointer}
button:disabled{opacity:.5}
.err{color:var(--bad);font-weight:600;font-size:14px;margin:12px 2px 0}
.fine{font-size:13px;color:var(--faint);margin:22px 2px 0}
.spin{width:28px;height:28px;border-radius:50%;border:3px solid var(--line);border-top-color:var(--green);animation:r .8s linear infinite;margin:0 0 18px}
@keyframes r{to{transform:rotate(360deg)}}@media (prefers-reduced-motion:reduce){.spin{animation:none}}
`;

/** Six boxes drawn over one real field (so autofill, paste and the form post all see a single value). */
const CODE_JS = `document.documentElement.className="js";
document.querySelectorAll(".code").forEach(function(box){
  var inp=box.querySelector("input"),mask=box.hasAttribute("data-mask"),cells=[];
  for(var i=0;i<6;i++){var c=document.createElement("span");c.className="cell";c.setAttribute("aria-hidden","true");box.appendChild(c);cells.push(c)}
  function draw(){var v=inp.value;cells.forEach(function(c,i){c.innerHTML="";if(v[i]){if(mask){var d=document.createElement("span");d.className="dotc";c.appendChild(d)}else c.textContent=v[i]}c.classList.toggle("at",i===Math.min(v.length,5))})}
  inp.addEventListener("input",function(){var v=inp.value.replace(/\\D/g,"").slice(0,6);if(v!==inp.value)inp.value=v;box.classList.remove("bad");draw();if(v.length===6){var b=inp.form.querySelector("button");b.disabled=true;inp.form.submit()}});
  inp.addEventListener("focus",function(){box.classList.add("focus")});inp.addEventListener("blur",function(){box.classList.remove("focus")});
  box.addEventListener("click",function(){inp.focus()});draw();
});`;

function page(title: string, body: string, script = ""): string {
  return `<!doctype html><html lang="th"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="robots" content="noindex,nofollow"><meta name="referrer" content="no-referrer">
<meta name="theme-color" content="#ffffff" media="(prefers-color-scheme: light)"><meta name="theme-color" content="#0d1117" media="(prefers-color-scheme: dark)">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@600&family=IBM+Plex+Sans+Thai:wght@400;600;700&display=swap">
<title>${esc(title)} · EasyGAS IDE</title>
<style>${CSS}</style></head><body><div class="shell"><div class="top">${LOGO}EasyGAS</div><main>${body}</main></div><script>${CODE_JS}${script}</script></body></html>`;
}

const codeForm = (opts: { action: string; name: string; value?: string; next?: string; mask?: boolean; label: string; button: string; bad?: boolean }): string =>
  `<form method="post" action="${opts.action}" autocomplete="off">
<div class="code${opts.bad ? " bad" : ""}"${opts.mask ? " data-mask" : ""}><input name="${opts.name}" value="${esc(opts.value ?? "")}" ${opts.mask ? 'type="password" ' : 'autocomplete="one-time-code" '}inputmode="numeric" pattern="[0-9]{6}" maxlength="6" required autofocus aria-label="${opts.label}"></div>
${opts.next ? `<input type="hidden" name="next" value="${esc(opts.next)}">` : ""}<button type="submit">${opts.button}</button></form>`;

/** Not paired (no / wrong device cookie): type the 6-digit code shown on the computer. */
export function pairPage(opts: { code?: string; error?: string; auto?: boolean }): string {
  const body = `${LINK}<h1>จับคู่มือถือกับคอม</h1>
<p>บนคอม เปิด <b class="nw">ตั้งค่า → ใช้จากมือถือ</b> กด <b class="nw">จับคู่มือถือ</b> แล้วใส่ตัวเลข 6 หลักที่ขึ้น</p>
${codeForm({ action: "/__egs/pair", name: "c", value: opts.code, label: "ตัวเลข 6 หลัก", button: "จับคู่", bad: !!opts.error })}
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ""}
<p class="fine">จับคู่ครั้งเดียว <span class="nw">เครื่องนี้เข้าได้ 30 วัน</span> <span class="nw">ถอนได้ทุกเมื่อจากคอม</span></p>`;
  // a scanned QR carries the code: send it at once (a link preview that does not run scripts never pairs)
  return page("จับคู่", body, opts.auto && opts.code && !opts.error ? `document.forms[0].submit()` : "");
}

export function pinPage(opts: { next: string; error?: string }): string {
  return page(
    "ใส่ PIN",
    `${LOCK}<h1>ใส่ PIN</h1><p>PIN 6 หลักที่ตั้งไว้บนคอม <span class="nw">เพื่อเปิด EasyGAS ในมือถือนี้</span></p>
${codeForm({ action: "/__egs/pin", name: "pin", next: opts.next, mask: true, label: "PIN 6 หลัก", button: "ปลดล็อก", bad: !!opts.error })}
${opts.error ? `<p class="err">${esc(opts.error)}</p>` : ""}
<p class="fine">ลืม PIN? <span class="nw">ตั้งใหม่ได้บนคอมที่</span> <span class="nw">ตั้งค่า → ใช้จากมือถือ</span></p>`,
  );
}

export function lockedPage(minutes: number): string {
  return page(
    "ลองใหม่ภายหลัง",
    `${WAIT}<h1>ลองผิดหลายครั้งเกินไป</h1><p>ลองใหม่อีก ${minutes} นาที <span class="nw">คอมได้รับแจ้งเตือนแล้ว</span></p>`,
  );
}

/**
 * Pro: the Pro app (easygaside.tech/app or /r/<name>) sends the phone here with its device token after `#`;
 * trade it for a cookie on this host, then go to `next` (a path on this host, already checked by safeNext).
 */
export function resumePage(next: string): string {
  const script = `(function(){var t=location.hash.slice(1),next=${JSON.stringify(next).replace(/</g, "\\u003c")};history.replaceState(null,"",location.pathname);
var m=document.getElementById("m");function stop(x){m.textContent=x;document.getElementById("s").style.display="none"}if(!t){stop("ลิงก์ไม่ครบ เปิดจากแอป EasyGAS ในมือถืออีกครั้ง");return}
fetch("/__egs/resume",{method:"POST",headers:{"content-type":"application/x-www-form-urlencoded"},body:"t="+encodeURIComponent(t),credentials:"same-origin"})
.then(function(r){if(r.ok)location.replace(next);else stop(r.status===429?"ลองหลายครั้งเกินไป รอสักครู่":"เครื่องนี้ถูกถอนการจับคู่แล้ว จับคู่ใหม่จากหน้า ตั้งค่า บนคอม")})
.catch(function(){stop("เชื่อมต่อไม่ได้ ลองอีกครั้ง")})})();`;
  return page("กำลังเชื่อม", `<div class="spin" id="s"></div><h1>กำลังเชื่อมกับคอม</h1><p id="m">แป๊บเดียว</p>`, script);
}

export function errorPage(title: string, text: string): string {
  return page(title, `<h1>${esc(title)}</h1><p>${esc(text)}</p>`);
}
