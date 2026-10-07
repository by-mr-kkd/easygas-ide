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
 * Plain V8 GAS source. The page outside GAS POSTs `{fn, args}` as text/plain (no preflight) and gets
 * `{ok:true,value}` or `{ok:false,error:{name,message}}` back as JSON. Only project functions are
 * callable: the same rule as google.script.run (no trailing `_`), plus no doGet/doPost and nothing
 * native (`eval`, `Function`, Object.prototype members reachable through globalThis).
 */
export const DISPATCHER_SOURCE = `/**
 * Added by EasyGAS IDE when the page is published outside Apps Script. Do not edit.
 * Lets that page call this project's server functions the way google.script.run does.
 */
function doPost(e) {
  var out;
  try {
    out = egsRemoteHandle_(e);
  } catch (err) {
    out = egsRemoteError_(err);
  }
  var text;
  try {
    text = JSON.stringify(out);
  } catch (err) {
    text = JSON.stringify(egsRemoteError_(err));
  }
  return ContentService.createTextOutput(text).setMimeType(ContentService.MimeType.JSON);
}

function egsRemoteHandle_(e) {
  var raw = e && e.postData && e.postData.contents;
  var req;
  try {
    req = JSON.parse(String(raw || ''));
  } catch (err) {
    return egsRemoteRefuse_('คำขอไม่ถูกต้อง (ไม่ใช่ JSON)');
  }
  if (!req || typeof req !== 'object') return egsRemoteRefuse_('คำขอไม่ถูกต้อง');
  var fn = req.fn;
  if (typeof fn !== 'string' || !fn) return egsRemoteRefuse_('ไม่ได้ระบุชื่อฟังก์ชัน');
  if (fn.charAt(fn.length - 1) === '_' || fn === 'doGet' || fn === 'doPost') {
    return egsRemoteRefuse_('ไม่อนุญาตให้เรียกฟังก์ชัน ' + fn);
  }
  var args = req.args;
  if (args === undefined || args === null) args = [];
  if (!Array.isArray(args)) return egsRemoteRefuse_('args ต้องเป็น array');
  var target = globalThis[fn];
  if (typeof target !== 'function' || egsRemoteIsNative_(target)) {
    return egsRemoteRefuse_('ไม่พบฟังก์ชัน ' + fn + ' ในโปรเจกต์');
  }
  var value = target.apply(null, args);
  return value === undefined ? { ok: true } : { ok: true, value: value };
}

// V8 prints built-ins as "function name() { [native code] }"; project code never looks like that.
function egsRemoteIsNative_(f) {
  var src = Function.prototype.toString.call(f);
  return /^function\\s*[\\w$]*\\(\\)\\s*\\{\\s*\\[native code\\]\\s*\\}$/.test(src);
}

function egsRemoteRefuse_(message) {
  return { ok: false, error: { name: 'EgsRemoteError', message: message } };
}

// name + message only: never the stack.
function egsRemoteError_(err) {
  var name = err && err.name ? String(err.name) : 'Error';
  var message = err && err.message !== undefined ? String(err.message) : String(err);
  return { ok: false, error: { name: name, message: message } };
}
`;

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
export function withDispatcher(files: SourceFile[]): SourceFile[] {
  const own = files.filter((f) => !isDispatcherFile(f.path));
  const conflict = own.find((f) => SERVER_FILE_RE.test(f.path) && definesDoPost(f.content));
  if (conflict) throw new DoPostConflictError(conflict.path);
  return [...own, { path: DISPATCHER_PATH, content: DISPATCHER_SOURCE }];
}
