"use client";

import { useEffect, useMemo, useState, useRef } from "react";
import { CommandLineIcon, ComputerDesktopIcon, DevicePhoneMobileIcon, EyeIcon } from "@heroicons/react/24/outline";
import { useProjectStore, type FileEntry } from "@/store/useProjectStore";
import { assemblePreview } from "@/lib/preview-includes";
import { Tooltip } from "@/components/ui/Tooltip";

const MOBILE_WIDTH = 390; // px — iPhone-ish viewport for the mobile preview

/**
 * Preview = the Tier-1 SIMULATED render only (inline srcdoc iframe + console shim).
 * The real GAS web app can't be embedded inline (Google blocks framing script.googleusercontent.com
 * and it needs the owner's login), so to run it for real use the เผยแพร่ button → open the /exec link.
 * The console stays folded away until the page logs an error — most users never need it.
 */
// a thin, faint scrollbar in the preview only (the app's own styles still win; the published page is untouched)
const SHIM = `<style>*{scrollbar-width:thin;scrollbar-color:rgba(100,116,139,.28) transparent}</style><script>
(function(){
  function ser(a){try{return typeof a==='object'?JSON.stringify(a):String(a)}catch(e){return String(a)}}
  function post(level,args){try{parent.postMessage({__egs:1,level:level,text:Array.prototype.map.call(args,ser).join(' ')},'*')}catch(e){}}
  ['log','info','warn','error'].forEach(function(l){var o=console[l];console[l]=function(){post(l,arguments);if(o)o.apply(console,arguments)}});
  window.onerror=function(m,s,line,col){post('error',[m+' ('+line+':'+col+')']);return false};
  window.addEventListener('unhandledrejection',function(ev){post('error',['Unhandled: '+((ev.reason&&ev.reason.message)||ev.reason)])});
  var noop=function(){};
  // google.script.run is stubbed in preview (no server). Log each server call so the console
  // shows activity and explains why data-loading "hangs" here — handlers never fire without deploy.
  var BUILDERS={withSuccessHandler:1,withFailureHandler:1,withUserObject:1};
  var runner=new Proxy({},{get:function(_,prop){
    return function(){
      if(BUILDERS[prop]) return runner;
      var a=Array.prototype.map.call(arguments,ser).join(', ');
      post('info',['google.script.run.'+String(prop)+'('+a+') จำลอง: ต้องเผยแพร่ก่อนจึงจะดึงข้อมูลจริง']);
      return runner;
    };
  }});
  window.google={script:{run:runner,host:{close:noop,setHeight:noop},url:{}}};
})();
</script>`;

interface ConsoleLine {
  level: string;
  text: string;
}

function buildSrcdoc(files: Record<string, FileEntry>): string | null {
  const page = assemblePreview(files);
  return page === null ? null : SHIM + page;
}

export function PreviewPane() {
  const files = useProjectStore((s) => s.files);
  const srcdoc = useMemo(() => buildSrcdoc(files), [files]);
  const [logs, setLogs] = useState<ConsoleLine[]>([]);
  const [view, setView] = useState<"desktop" | "mobile">("desktop");
  const [consoleOpen, setConsoleOpen] = useState(false);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const errorCount = logs.filter((l) => l.level === "error").length;

  useEffect(() => {
    function onMsg(e: MessageEvent) {
      // sandboxed iframe (no allow-same-origin) posts from opaque origin "null"
      if (e.origin !== "null" || e.source !== frameRef.current?.contentWindow) return;
      const d = e.data;
      if (d && d.__egs === 1)
        setLogs((l) => [...l.slice(-50), { level: String(d.level ?? "log"), text: String(d.text ?? "") }]);
    }
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, []);

  useEffect(() => setLogs([]), [srcdoc]);
  // an error is the one thing worth interrupting for: open the console by itself
  useEffect(() => {
    if (errorCount > 0) setConsoleOpen(true);
  }, [errorCount]);

  return (
    <div className="flex h-full w-full flex-col">
      <div className="flex h-11 flex-none items-center gap-2 border-b border-line px-3">
        <span className="icon-chip tone-info">
          <EyeIcon className="h-4 w-4" />
        </span>
        <h2 className="text-sm font-semibold">พรีวิว</h2>
        <Tooltip
          label="หน้าตาเหมือนของจริง แต่ปุ่มที่บันทึกหรือดึงข้อมูลยังไม่ทำงาน ต้องเผยแพร่ก่อนแล้วเปิดจากลิงก์ของแอป"
          placement="bottom"
        >
          <span className="badge cursor-help">จำลอง</span>
        </Tooltip>
        <span className="flex-1" />
        {srcdoc && (
          <>
            <div className="seg" role="group" aria-label="ขนาดจอ">
              <Tooltip label="จอคอมพิวเตอร์" placement="bottom">
                <button onClick={() => setView("desktop")} aria-label="จอคอมพิวเตอร์" aria-pressed={view === "desktop"} className="seg-item px-2">
                  <ComputerDesktopIcon className="h-4 w-4" />
                </button>
              </Tooltip>
              <Tooltip label="จอมือถือ" placement="bottom">
                <button onClick={() => setView("mobile")} aria-label="จอมือถือ" aria-pressed={view === "mobile"} className="seg-item px-2">
                  <DevicePhoneMobileIcon className="h-4 w-4" />
                </button>
              </Tooltip>
            </div>
            <Tooltip label="ข้อความและ error จากหน้าพรีวิว" placement="bottom">
              <button onClick={() => setConsoleOpen((o) => !o)} aria-pressed={consoleOpen} className="btn btn-ghost btn-sm">
                <CommandLineIcon className="h-4 w-4" />
                <span className="hidden sm:inline">Console</span>
                {errorCount > 0 && <span className="rounded-full bg-danger-soft px-1.5 text-xs font-semibold text-danger">{errorCount}</span>}
              </button>
            </Tooltip>
          </>
        )}
      </div>

      {srcdoc ? (
        <div className={`min-h-0 flex-1 overflow-auto ${view === "mobile" ? "grid place-items-start justify-center bg-sunken p-3" : "bg-white"}`}>
          {/* SECURITY: never add allow-same-origin / allow-popups-to-escape-sandbox —
              opaque-origin isolation is required for untrusted AI-generated content */}
          <iframe
            ref={frameRef}
            title="preview"
            sandbox="allow-scripts"
            style={view === "mobile" ? { width: MOBILE_WIDTH, maxWidth: "100%" } : undefined}
            className={`bg-white ${view === "mobile" ? "h-full min-h-[560px] rounded-2xl border border-line-strong" : "h-full w-full"}`}
            srcDoc={srcdoc}
          />
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 place-items-center px-6 text-center">
          <p className="hint">AI สร้างหน้าจอเสร็จแล้วจะเห็นตัวอย่างตรงนี้</p>
        </div>
      )}

      {srcdoc && consoleOpen && (
        <div className="h-32 flex-none overflow-auto border-t border-line bg-sunken px-3 py-2 font-mono text-xs leading-relaxed">
          {logs.length === 0 ? (
            <div className="text-faint">ยังไม่มีข้อความ ถ้าหน้าพรีวิวมี error จะแสดงที่นี่</div>
          ) : (
            logs.map((l, i) => (
              <div key={i} className={l.level === "error" ? "text-danger" : l.level === "warn" ? "text-warn-text" : "text-muted"}>
                {l.text}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
