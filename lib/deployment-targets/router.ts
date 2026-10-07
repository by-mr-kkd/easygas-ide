import type { TargetId } from "@/types/db";

/**
 * Capability router (BUILDPLAN §J.3) — a PURE function (no model calls) that maps the project's
 * capability needs to a target. Any modern-web signal routes to the web target; otherwise GAS.
 * Today the web target is not built, so `notImplemented` is surfaced honestly instead of silently
 * deploying GAS code to the wrong runtime.
 */

export interface CapabilityNeeds {
  liveCamera?: boolean;
  realtime?: boolean;
  npmPackages?: boolean;
  customDomain?: boolean;
  publicSeo?: boolean;
  stillPhoto?: boolean;
  workspaceData?: boolean;
}

export interface RouteDecision {
  target: TargetId;
  reasons: string[];
  /** true when the chosen target is documented but NOT implemented yet (web target). */
  notImplemented: boolean;
}

const WEB_SIGNALS: { key: keyof CapabilityNeeds; reason: string }[] = [
  { key: "liveCamera", reason: "ต้องใช้กล้องสด — GAS บล็อก getUserMedia" },
  { key: "realtime", reason: "ต้องการ realtime/อัปเดตสด" },
  { key: "npmPackages", reason: "ต้องใช้ npm package" },
  { key: "customDomain", reason: "ต้องการโดเมนของตัวเอง" },
  { key: "publicSeo", reason: "ต้องการหน้า public ทำ SEO" },
];

export interface RouteOptions {
  /** premium camera gate is "allowed": the front page goes to GitHub Pages, where the live camera works */
  cameraAllowed?: boolean;
}

export function routeTarget(needs: CapabilityNeeds = {}, opts: RouteOptions = {}): RouteDecision {
  const reasons = WEB_SIGNALS.filter((s) => needs[s.key] && !(s.key === "liveCamera" && opts.cameraAllowed)).map((s) => s.reason);
  if (reasons.length > 0) {
    return { target: "web-supabase", reasons, notImplemented: true };
  }
  if (needs.liveCamera && opts.cameraAllowed) {
    return {
      target: "static-web",
      reasons: ["กล้องสด: หน้าเว็บเผยแพร่บน GitHub Pages (Pro) เรียก GAS เป็น backend"],
      notImplemented: false,
    };
  }
  return {
    target: "gas",
    reasons: ["ใช้ข้อมูล Workspace + โฮสต์ฟรี ไม่มีสัญญาณเว็บ → GAS"],
    notImplemented: false,
  };
}

/**
 * Cheap keyword detector (no model call) that infers capability needs from the user's free-text
 * description. Feeds routeTarget(). Conservative: only clear web-only signals flip a project toward
 * the web target; still-photo / Workspace keywords are informational and stay on GAS.
 */
const NEED_KEYWORDS: { key: keyof CapabilityNeeds; words: string[] }[] = [
  {
    key: "liveCamera",
    words: [
      "กล้องสด", "สแกนหน้า", "สแกนใบหน้า", "ตรวจจับใบหน้า", "สแกน qr", "สแกนคิวอาร์",
      "สแกนบาร์โค้ด", "สแกนบาโค้ด", "webcam", "เว็บแคม", "วิดีโอคอล", "video call",
      "live stream", "livestream", "สตรีมสด", "ถ่ายวิดีโอ", "scan face", "face scan",
      "qr scan", "barcode scan", "กล้องเรียลไทม์",
    ],
  },
  {
    key: "realtime",
    words: ["เรียลไทม์", "real-time", "realtime", "websocket", "แชทสด", "live chat", "แชทเรียลไทม์", "อัปเดตเรียลไทม์", "สตรีมข้อมูล"],
  },
  { key: "npmPackages", words: ["npm", "node module", "ไลบรารี npm"] },
  {
    key: "customDomain",
    words: ["โดเมนตัวเอง", "โดเมนของตัวเอง", "custom domain", "ชื่อโดเมน", "เว็บจริง", "หน้าเว็บสาธารณะ", "เว็บสาธารณะ"],
  },
  { key: "publicSeo", words: ["seo", "ติดอันดับ google", "ค้นหาเจอใน google", "google search"] },
  { key: "stillPhoto", words: ["แนบรูป", "อัปโหลดรูป", "ถ่ายรูป", "upload photo", "attach image", "แนบภาพ"] },
  { key: "workspaceData", words: ["sheet", "ชีต", "drive", "gmail", "ส่งอีเมล", "ส่งเมล", "ปฏิทิน", "calendar"] },
];

export function detectCapabilityNeeds(text: string): CapabilityNeeds {
  const t = (text || "").toLowerCase();
  const needs: CapabilityNeeds = {};
  for (const { key, words } of NEED_KEYWORDS) {
    if (words.some((w) => t.includes(w.toLowerCase()))) needs[key] = true;
  }
  return needs;
}
