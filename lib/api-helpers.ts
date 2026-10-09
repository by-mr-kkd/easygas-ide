import { NextResponse } from "next/server";
import { ImportError, NotConnectedError, RemoteChangedError, UserSettingsDisabledError } from "@/lib/errors";

/**
 * Build the usersettings link for the signed-in deploy account. The toggle is per-Google-account,
 * and a bare link opens whatever account is default in the browser; `authuser=<email>` pins it.
 */
export function userSettingsUrl(connectedEmail?: string | null): string {
  const base = "https://script.google.com/home/usersettings";
  return connectedEmail ? `${base}?authuser=${encodeURIComponent(connectedEmail)}` : base;
}

/** Map deploy errors (clasp / Apps Script) to safe client responses the IDE already understands. */
export function mapGoogleError(e: unknown, connectedEmail?: string | null): NextResponse {
  if (e instanceof UserSettingsDisabledError) {
    return NextResponse.json(
      {
        error: "USER_SETTINGS_DISABLED",
        enableUrl: userSettingsUrl(connectedEmail),
        message: connectedEmail
          ? `ยังไม่ได้เปิด Apps Script API สำหรับบัญชี ${connectedEmail} — เปิดลิงก์โดยล็อกอินด้วยบัญชีนั้น แล้วลองใหม่`
          : "ยังไม่ได้เปิด Apps Script API สำหรับบัญชี Google นี้ — เปิดที่ usersettings แล้วลองใหม่",
      },
      { status: 409 },
    );
  }
  if (e instanceof NotConnectedError) return NextResponse.json({ error: "NOT_CONNECTED" }, { status: 409 });
  if (e instanceof RemoteChangedError) {
    return NextResponse.json(
      { error: "REMOTE_CHANGED", message: "มีคนแก้สคริปต์นี้บน script.google.com หลังจากที่ดึงมา ถ้าส่งขึ้นตอนนี้งานบน Google จะหาย ดึงของล่าสุดลงมาก่อน" },
      { status: 409 },
    );
  }
  if (e instanceof ImportError) return NextResponse.json({ error: e.code, message: e.message }, { status: 400 });
  // GitHub-hosted project without the Pro runtime on this machine (lib/pages/runtime.ts)
  if (e instanceof Error && (e as { code?: unknown }).code === "RUNTIME_MISSING") return NextResponse.json({ error: "RUNTIME_MISSING", message: e.message }, { status: 403 });
  console.error("[deploy] unexpected:", e);
  const code = e instanceof Error && e.message === "no_files" ? "NO_FILES" : "UNKNOWN";
  return NextResponse.json({ error: code }, { status: code === "NO_FILES" ? 400 : 500 });
}
