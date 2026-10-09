/**
 * The two pieces that make a page hosted outside Apps Script work, pure:
 *   shim        browser code that stands in for `google.script.run` (POSTs `{fn,args}` to the deployed /exec)
 *   dispatcher  `EgsRemote.gs`, the doPost inside the GAS project that answers those calls
 * Neither text is in this source. They are Pro content served by the licence server (premium-content id
 * "pages_runtime", JSON {v, shim, dispatcher}) to a registered machine and cached in premium.json — the same
 * arrangement as the camera instructions (lib/premium/content.ts). This module only checks the shape.
 */

export interface PagesRuntime {
  shim: string;
  dispatcher: string;
}

/** In the shim text, replaced by the JS string literal of the /exec URL at publish. */
export const RUNTIME_URL_PLACEHOLDER = "__EGS_EXEC_URL__";

export class PagesRuntimeMissingError extends Error {
  readonly code = "RUNTIME_MISSING";
  constructor() {
    super("ส่วนเผยแพร่ขึ้น GitHub เป็นของ Pro และต้องดาวน์โหลดจากเซิร์ฟเวอร์ครั้งแรก — ต่ออินเทอร์เน็ต แล้วดูว่า ตั้งค่า → Pro ขึ้นว่าเปิดใช้แล้ว");
    this.name = "PagesRuntimeMissingError";
  }
}

/** The server's body (a JSON string or the parsed object), or null when it is not a runtime we can use. */
export function parsePagesRuntime(body: unknown): PagesRuntime | null {
  let raw: unknown = body;
  if (typeof raw === "string") {
    try {
      raw = JSON.parse(raw);
    } catch {
      return null;
    }
  }
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const shim = o.shim;
  const dispatcher = o.dispatcher;
  if (typeof shim !== "string" || typeof dispatcher !== "string") return null;
  // the shim is inlined into a <script>: a "</" or "<!--" would cut the page
  if (!shim.includes(RUNTIME_URL_PLACEHOLDER) || !shim.includes("google") || /<\/|<!--/.test(shim)) return null;
  if (!dispatcher.includes("function doPost(e)") || !dispatcher.includes("egsRemoteHandle_")) return null;
  return { shim, dispatcher };
}
