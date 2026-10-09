export interface SourceFile {
  path: string;
  content: string;
}

/** The file the app adds to the GAS project so a page outside GAS can call its server functions. */
export const DISPATCHER_PATH = "EgsRemote.gs";

/** The project already has a doPost — the dispatcher cannot be added without breaking it. */
export class DoPostConflictError extends Error {
  readonly code = "DOPOST_CONFLICT";
  readonly file: string;
  constructor(file: string) {
    super(`ไฟล์ ${file} มี doPost อยู่แล้ว หน้าเว็บภายนอกต้องใช้ doPost เป็นช่องทางเรียกฟังก์ชัน กรุณาเปลี่ยนชื่อหรือลบ doPost เดิมก่อน`);
    this.name = "DoPostConflictError";
    this.file = file;
  }
}

/**
 * The dispatcher's GAS source (`EgsRemote.gs`) is Pro content fetched from the licence server
 * (lib/pages/runtime.ts, lib/premium/content.ts) — it is not in this source. It is plain V8 GAS: the page
 * outside GAS POSTs `{fn, args}` as text/plain (no preflight) and gets `{ok:true,value}` or
 * `{ok:false,error:{name,message}}` back as JSON. Only project functions are callable: the same rule as
 * google.script.run (no trailing `_`), plus no doGet/doPost and nothing native.
 */
const SERVER_FILE_RE = /\.(gs|js)$/i;

/** Strip comments so a commented-out doPost does not count. Good enough for the conflict check. */
function stripComments(code: string): string {
  return code
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .split("\n")
    .filter((line) => !line.trim().startsWith("//"))
    .join("\n");
}

/** `function doPost(` or `doPost = ...` at any nesting; good enough for the conflict check. */
export function definesDoPost(code: string): boolean {
  const src = stripComments(code);
  return /\bfunction\s+doPost\s*\(/.test(src) || /(^|[^.\w$])doPost\s*=[^=]/.test(src);
}

function isDispatcherFile(path: string): boolean {
  return path.toLowerCase() === DISPATCHER_PATH.toLowerCase();
}

/**
 * The project's files plus the dispatcher (doPost). Throws DoPostConflictError when the project
 * defines its own doPost. An earlier copy of the dispatcher is replaced, never duplicated.
 */
export function withDispatcher(files: SourceFile[], dispatcher: string): SourceFile[] {
  const own = files.filter((f) => !isDispatcherFile(f.path));
  const conflict = own.find((f) => SERVER_FILE_RE.test(f.path) && definesDoPost(f.content));
  if (conflict) throw new DoPostConflictError(conflict.path);
  return [...own, { path: DISPATCHER_PATH, content: dispatcher }];
}
