/**
 * Camera gate (premium). A GAS web app cannot open the camera; a premium licence lets the project's
 * front page be published to the user's GitHub Pages (calling the GAS web app as backend), where it
 * can. This module decides, per turn, whether the AI may build camera features and what to tell the
 * user otherwise. The pure parts are unit-tested (tests/camera-gate.test.ts); the async wrapper reads
 * the three status functions owned by lib/premium + lib/pages.
 */
import type { EgsProject } from "../../types/db.ts";
import type { premiumStatus } from "./status.ts";
import type { githubStatus } from "../pages/github-auth.ts";
import type { launchPromo } from "./offer.ts";

/** The three status readers, loaded lazily so the pure parts stay testable under node --test (no "@/" alias there). */
export interface CameraGateStatus {
  premiumStatus: typeof premiumStatus;
  githubStatus: typeof githubStatus;
  launchPromo: typeof launchPromo;
}

async function loadStatus(): Promise<CameraGateStatus> {
  const [status, github, offer] = await Promise.all([import("./status.ts"), import("../pages/github-auth.ts"), import("./offer.ts")]);
  return { premiumStatus: status.premiumStatus, githubStatus: github.githubStatus, launchPromo: offer.launchPromo };
}

export type CameraGate = "off" | "allowed" | "need-github" | "need-premium";

export interface CameraGateResult {
  gate: CameraGate;
  /** true when the user's message itself asks for the camera (false when only project.hosting keeps it on) */
  intent: boolean;
  /** need-premium only: a launch promotion is on (one extra sentence allowed) */
  promo?: boolean;
}

// Thai has no word boundaries, so substrings are matched; each entry is specific enough that
// unrelated words (กล่อง, กลอง, กล้องวงจรปิด as a product) do not fire on their own.
const THAI_WORDS = [
  "ถ่ายรูป", "ถ่ายภาพ", "ถ่ายวิดีโอ", "กล้องสด", "เปิดกล้อง", "ใช้กล้อง", "จากกล้อง", "กล้องมือถือ", "กล้องหน้า", "กล้องหลัง",
  "กล้องเว็บ", "เว็บแคม", "กล้องเรียลไทม์", "สแกน qr", "สแกนคิวอาร์", "สแกนบาร์โค้ด", "สแกนบาโค้ด", "สแกนหน้า",
  "สแกนใบหน้า", "ตรวจจับใบหน้า", "สแกนรหัส", "สแกนสินค้า", "สแกนเอกสาร", "สแกนด้วย", "ยิงบาร์โค้ด", "อ่าน qr",
];
const ENGLISH_RE =
  /\b(camera|webcam|selfie|getusermedia|mediadevices|photo\s*capture|take\s+(a\s+)?(photo|picture)|scan(ning|ner|s)?\b|qr\s*code\s*(scan|read)|barcode\s*(scan|read)|face\s*(scan|detect)|live\s*video)/i;

/** Does this message ask for anything camera-related (photo from camera, live camera, QR/barcode/face scan)? */
export function cameraIntent(text: string): boolean {
  if (!text) return false;
  const t = text.toLowerCase();
  if (THAI_WORDS.some((w) => t.includes(w))) return true;
  // bare "กล้อง" counts only next to a verb/feature word, so "กล่อง"/"กลอง" and shop talk stay out
  if (/กล้อง/.test(t) && /(ถ่าย|สแกน|เปิด|ใช้|แสกน|สด|เว็บแอป|แอป|หน้าเว็บ)/.test(t)) return true;
  return ENGLISH_RE.test(t);
}

export interface GateInputs {
  intent: boolean;
  hosting: EgsProject["hosting"] | undefined;
  premium: boolean;
  github: boolean;
}

/**
 * Pure decision. A project already published to GitHub keeps the camera on later turns (while premium
 * is still active) even when the message has no camera words.
 */
export function decideCameraGate(a: GateInputs): CameraGate {
  const githubProject = a.hosting === "github";
  if (!a.intent && !githubProject) return "off";
  if (!a.premium) return a.intent ? "need-premium" : "off";
  if (!a.github) return a.intent ? "need-github" : "off";
  return "allowed";
}

/** The gate for one turn, reading premium / GitHub / promo status. Status failures count as "not active". */
export async function cameraGateFor(
  project: Pick<EgsProject, "hosting">,
  userMessage: string,
  status?: CameraGateStatus,
): Promise<CameraGateResult> {
  const intent = cameraIntent(userMessage);
  if (!intent && project.hosting !== "github") return { gate: "off", intent };
  const { premiumStatus, githubStatus, launchPromo } = status ?? (await loadStatus());
  const [premium, github] = await Promise.all([
    premiumStatus().catch(() => ({ active: false })),
    githubStatus().catch(() => ({ available: false, connected: false })),
  ]);
  const gate = decideCameraGate({ intent, hosting: project.hosting, premium: premium.active, github: github.connected });
  if (gate !== "need-premium") return { gate, intent };
  const promo = await launchPromo().catch(() => false);
  return { gate, intent, promo };
}

/** Whether the lint may accept camera code for this project (the gate's persisted outcome). */
export function cameraAllowedFor(project: Pick<EgsProject, "hosting"> | null | undefined): boolean {
  return project?.hosting === "github";
}

/**
 * The camera override is recognised by its heading ("## Camera (premium project, ..."), and only the app
 * may add it. A user who types or pastes such a heading into the chat would look the same to the AI, so
 * every camera heading is removed from what the user sent before the turn is built.
 */
const CAMERA_HEADING = /^[ \t]*#{1,6}[ \t]*camera\b.*$/gim;
export const CAMERA_CLAIM_REMOVED = "(ข้อความส่วนนี้ถูกตัดออก: หัวข้อเรื่องกล้องใส่ได้เฉพาะแอป)";

export function stripCameraClaims(text: string): string {
  return text.replace(CAMERA_HEADING, CAMERA_CLAIM_REMOVED);
}
