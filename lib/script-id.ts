/** Script id parsing for "แก้ไขสคริปต์ที่มีอยู่" (pure, no aliases: unit-tested in tests/import.test.ts). */
/** Importing an existing script failed for a reason the user can act on. */
export class ImportError extends Error {
  readonly code: "BAD_SCRIPT_ID" | "DEPLOYMENT_URL" | "NO_ACCESS";
  constructor(code: "BAD_SCRIPT_ID" | "DEPLOYMENT_URL" | "NO_ACCESS", message: string) {
    super(message);
    this.name = "ImportError";
    this.code = code;
  }
}

// starts with a letter or digit, so an id can never be read as a command-line option
export const SCRIPT_ID = /^[A-Za-z0-9][\w-]{24,119}$/;

/** A script id from a pasted id or editor URL. A web-app /exec URL holds a DEPLOYMENT id, not the script's. */
export function parseScriptId(input: string): string {
  const s = String(input ?? "").trim();
  if (/script\.google\.com\/macros\/s\//.test(s) || /^AKfy/.test(s)) {
    throw new ImportError("DEPLOYMENT_URL", "ลิงก์นี้เป็นลิงก์ของเว็บแอป (/exec) ไม่ใช่รหัสสคริปต์ เปิดสคริปต์ใน script.google.com แล้วคัดลอกลิงก์จากหน้าแก้โค้ด หรือรหัสสคริปต์ในการตั้งค่าโปรเจกต์");
  }
  const fromUrl = s.match(/script\.google\.com\/(?:u\/\d+\/)?(?:d|home\/projects)\/([\w-]{25,120})/)?.[1];
  const id = fromUrl ?? s;
  if (!SCRIPT_ID.test(id)) throw new ImportError("BAD_SCRIPT_ID", "รูปแบบรหัสสคริปต์ไม่ถูกต้อง");
  return id;
}

