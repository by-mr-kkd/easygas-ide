/**
 * Storage bridge for apps opened through run.easygaside.tech (lib/run-link.ts), pure: applied to the PUSHED copy
 * of every html file of a Google-hosted project (lib/deploy.ts, like lib/share/install-hide.ts), never to src/.
 *
 * Why: the run page embeds the app in an `<iframe credentialless>` (that is what makes it open with several Google
 * accounts signed in), and a credentialless frame gets a NEW, ephemeral storage partition on every load — the app's
 * localStorage (remembered PIN, dark mode, "จำเครื่องนี้") is wiped on each refresh, while the plain /exec link keeps
 * it. The run page's own localStorage is ordinary, so it keeps the app's values for it, per deployment id:
 *
 *   app (shim, first script of the page) ──"storage-get"──▶ run page
 *   app ◀──"storage" {local, session}── run page            → the shim writes them into the frame's storage
 *   app ──"storage-set / -remove / -clear"──▶ run page      → every later write is mirrored
 *
 * The app's own scripts must not run before the values are there (they read dark mode / the PIN at start, and the
 * reply is asynchronous), so every classic `<script>` becomes `type="text/egs-wait"` and the shim replays them in
 * order once the page is parsed AND the values arrived (or 1.5 s passed: the parent said nothing). Listeners for
 * DOMContentLoaded / load added by a replayed script still run (they fire after the replay), and `document.readyState`
 * reads "loading" while the replay runs so ready-checks take the listener path. Outside the run page (the /exec
 * link, where `location.ancestorOrigins` does not end in RUN_ORIGIN) nothing is asked or mirrored: the scripts replay
 * at once when the page is parsed.
 *
 * The shim never reads anything but the app's own storage and talks only to RUN_ORIGIN; the run page keys its copy
 * by the deployment id, so one app never sees another's values.
 */
import { RUN_ORIGIN } from "./run-link.ts";

export const BRIDGE_MARK = "data-egs-run-bridge";
export const WAIT_TYPE = "text/egs-wait";

/** how long the shim waits for the run page's reply before starting the app anyway */
export const BRIDGE_WAIT_MS = 1500;

// Plain ES5 so it runs in every browser the run page supports; one line keeps the pushed html readable.
const SHIM_JS = `(function(){if(window.__egsBridge)return;window.__egsBridge=1;
var RUN=${JSON.stringify(RUN_ORIGIN)},WAIT=${JSON.stringify(WAIT_TYPE)},ao=location.ancestorOrigins,topOrigin=ao&&ao.length?ao[ao.length-1]:null;
var bridged=topOrigin===RUN&&window.top!==window,seeded=!bridged,domFired=false,loadFired=false,started=false,replaying=false,domQ=[],loadQ=[];
function send(m){try{window.top.postMessage(m,RUN)}catch(e){}}
if(bridged){try{var sp=Storage.prototype,si=sp.setItem,ri=sp.removeItem,ci=sp.clear;
function kind(s){try{return s===window.localStorage?"local":s===window.sessionStorage?"session":null}catch(e){return null}}
sp.setItem=function(k,v){si.call(this,k,v);var t=kind(this);if(t&&seeded)send({egs:"storage-set",kind:t,key:String(k),value:String(v)})};
sp.removeItem=function(k){ri.call(this,k);var t=kind(this);if(t&&seeded)send({egs:"storage-remove",kind:t,key:String(k)})};
sp.clear=function(){ci.call(this);var t=kind(this);if(t&&seeded)send({egs:"storage-clear",kind:t})};
function seedInto(s,o){if(!o||typeof o!=="object")return;for(var k in o)if(Object.prototype.hasOwnProperty.call(o,k)&&typeof o[k]==="string")si.call(s,k,o[k])}
window.addEventListener("message",function(e){if(e.origin!==RUN||!e.data||e.data.egs!=="storage"||seeded)return;
try{seedInto(window.localStorage,e.data.local);seedInto(window.sessionStorage,e.data.session)}catch(x){}seeded=true;ready()});
send({egs:"storage-get"});setTimeout(function(){if(!seeded){seeded=true;ready()}},${BRIDGE_WAIT_MS})}catch(e){seeded=true}}
var dAdd=document.addEventListener,wAdd=window.addEventListener;
document.addEventListener=function(t,fn,o){if(t==="DOMContentLoaded"&&domFired&&typeof fn==="function"){domQ.push(fn);return}return dAdd.call(document,t,fn,o)};
window.addEventListener=function(t,fn,o){if(typeof fn==="function"&&((t==="load"&&loadFired)||(t==="DOMContentLoaded"&&domFired))){(t==="load"?loadQ:domQ).push(fn);return}return wAdd.call(window,t,fn,o)};
var onloadFn=null;try{Object.defineProperty(window,"onload",{configurable:true,get:function(){return onloadFn},set:function(fn){onloadFn=fn;if(loadFired&&typeof fn==="function")loadQ.push(fn)}})}catch(e){}
function flush(q,target,name){while(q.length){var fn=q.shift();try{fn.call(target,new Event(name))}catch(e){setTimeout(function(){throw e})}}}
function finish(){replaying=false;try{delete document.readyState}catch(e){}flush(domQ,document,"DOMContentLoaded");if(loadFired)flush(loadQ,window,"load")}
function replay(){var list=Array.prototype.slice.call(document.querySelectorAll('script[type="'+WAIT+'"]'));replaying=true;
try{Object.defineProperty(document,"readyState",{configurable:true,get:function(){return replaying?"loading":"complete"}})}catch(e){}
(function next(i){if(i>=list.length)return finish();var old=list[i],s=document.createElement("script");
for(var a=0;a<old.attributes.length;a++){var at=old.attributes[a];if(at.name!=="type"&&at.name!=="data-egs-type")s.setAttribute(at.name,at.value)}
var realType=old.getAttribute("data-egs-type");if(realType)s.type=realType;
if(old.getAttribute("src")){s.async=false;s.onload=s.onerror=function(){next(i+1)};old.parentNode.replaceChild(s,old)}
else{s.text=old.text;old.parentNode.replaceChild(s,old);next(i+1)}})(0)}
function ready(){if(started||!seeded||!domFired)return;started=true;replay()}
dAdd.call(document,"DOMContentLoaded",function(){domFired=true;ready()});
wAdd.call(window,"load",function(){loadFired=true;if(started&&!replaying)flush(loadQ,window,"load")});
})();`;

export const BRIDGE_SCRIPT = `<script ${BRIDGE_MARK}>${SHIM_JS}</script>`;

/** classic-script types the replay understands; anything else (json, templates, modules, babel) is left alone */
const CLASSIC_TYPES = new Set(["", "text/javascript", "application/javascript", "text/ecmascript", "application/ecmascript", "module"]);
const SCRIPT_OPEN = /<script\b([^>]*)>/gi;
const TYPE_ATTR = /\stype\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s>]+))/i;

/** Every classic `<script>` (inline or src) made to wait for the shim; modules keep their type on `data-egs-type`. */
export function holdScripts(html: string): string {
  return html.replace(SCRIPT_OPEN, (tag, attrs: string) => {
    if (new RegExp(`\\s${BRIDGE_MARK}(?![-\\w])`).test(attrs)) return tag;
    const m = TYPE_ATTR.exec(attrs);
    const type = (m ? (m[1] ?? m[2] ?? m[3] ?? "") : "").trim().toLowerCase();
    if (!CLASSIC_TYPES.has(type)) return tag;
    const rest = m ? attrs.slice(0, m.index) + attrs.slice(m.index + m[0].length) : attrs;
    const keep = type === "module" ? ` data-egs-type="module"` : "";
    return `<script type="${WAIT_TYPE}"${keep}${rest}>`;
  });
}

/** The shim first (right after `<head>`, else at the top of a partial), then the scripts held. Idempotent. */
export function bridgeHtml(html: string): string {
  if (html.includes(BRIDGE_MARK)) return html;
  const held = holdScripts(html);
  const head = /<head\b[^>]*>/i.exec(held);
  if (head) return held.slice(0, head.index + head[0].length) + BRIDGE_SCRIPT + held.slice(head.index + head[0].length);
  return BRIDGE_SCRIPT + "\n" + held;
}

/** The push set with every html file bridged (the project's own files are never rewritten). */
export function bridgeFiles<T extends { path: string; content: string; content_hash?: string }>(files: T[]): T[] {
  // the rewritten copy must hash by its CONTENT: a stored content_hash (lib/files hashFiles prefers it) would make the
  // publisher take the bridged push set for the unbridged one it pushed last time and skip the publish as "unchanged"
  return files.map((f) => (/\.html$/i.test(f.path) ? { ...f, content: bridgeHtml(f.content), content_hash: undefined } : f));
}
