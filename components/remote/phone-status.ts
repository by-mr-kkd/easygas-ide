import type { RemoteView } from "@/app/settings/remote-actions";

export type PhoneTone = "on" | "busy" | "error" | "off";

/** One short line for the phone button: the real state of remote access, not just "switched on". */
export function phoneStatus(v: RemoteView): { tone: PhoneTone; label: string } {
  if (!v.enabled || v.phase === "off") return { tone: "off", label: "ปิดอยู่" };
  if (v.phase === "error") return { tone: "error", label: "เชื่อมไม่สำเร็จ" };
  if (v.phase !== "on" || !v.url) return { tone: "busy", label: "กำลังเชื่อม…" };
  const n = v.devices.length;
  return { tone: "on", label: n ? `ออนไลน์ · ${n} เครื่อง` : "ออนไลน์ · ยังไม่จับคู่" };
}
