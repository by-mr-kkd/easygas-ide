/**
 * The extras a Pro project on GitHub Pages can ask for from the start (the style tab's "ติดตั้งแบบไหน" card).
 * Pure — unit-tested in tests/pro-features.test.ts.
 *
 *   pwa     the publisher adds a manifest + service worker + icon to the Pages copy (lib/pages/static-page)
 *   notify  in-app notifications only (a bell + a banner while the app is open) — no push
 *   camera  rides on the camera gate: the words in the message are what lib/premium/camera-gate reads
 *   qr      a QR code that opens the app (the AI adds it to the admin page)
 *
 * The choices are stored on the project (`pro_features`); they reach the AI as lines of the user's message,
 * and only while the project really is on GitHub Pages — a free user's ticks never leave the card.
 */

export interface ProFeatures {
  pwa: boolean;
  notify: boolean;
  camera: boolean;
  qr: boolean;
}

export const NO_PRO_FEATURES: ProFeatures = { pwa: false, notify: false, camera: false, qr: false };

export const PRO_FEATURE_LIST: { id: keyof ProFeatures; label: string; hint: string }[] = [
  { id: "pwa", label: "ติดตั้งเป็นแอปบนหน้าจอ", hint: "ไอคอนบนมือถือ เปิดเต็มจอ ไม่มีแถบเบราว์เซอร์" },
  { id: "notify", label: "แจ้งเตือนในแอป", hint: "กระดิ่ง + แถบเด้งตอนเปิดแอปอยู่ เช่น “มีรายการใหม่”" },
  { id: "camera", label: "ถ่ายรูปจากกล้อง", hint: "ถ่ายในแอปแล้วเก็บลง Drive" },
  { id: "qr", label: "QR เปิดแอป", hint: "พิมพ์ติดหน้าร้าน สแกนแล้วเปิดแอปได้เลย" },
];

export function sanitizeProFeatures(input: unknown): ProFeatures {
  const o = input && typeof input === "object" ? (input as Record<string, unknown>) : {};
  return { pwa: o.pwa === true, notify: o.notify === true, camera: o.camera === true, qr: o.qr === true };
}

export const anyProFeature = (f: ProFeatures) => f.pwa || f.notify || f.camera || f.qr;

/** The lines added to the chat message for the picked extras (empty when none). */
export function proFeatureLines(f: ProFeatures): string {
  const lines: string[] = [];
  if (f.pwa)
    lines.push(
      "- ติดตั้งเป็นแอปบนหน้าจอได้: แอปใส่ manifest, service worker และป๊อปอัปชวนติดตั้ง (แยกคำแนะนำ Android / iPhone / คอมพิวเตอร์) ให้เองตอนเผยแพร่ ห้ามเขียนโค้ดติดตั้งหรือป๊อปอัปเอง ทำหน้าจอให้ใช้เต็มจอบนมือถือได้ดี ถ้ามีหน้าโปรไฟล์หรือหน้าตั้งค่า ให้ใส่ปุ่ม <button data-egs-install>ติดตั้งเป็นแอป</button> ไว้ที่นั่น (ปุ่มนี้ไม่ต้องมี onclick แอปผูกให้และซ่อนเองเมื่อติดตั้งแล้ว)",
    );
  if (f.notify)
    lines.push("- แจ้งเตือนในแอป: ไอคอนกระดิ่งมีตัวเลข และแถบเด้งเมื่อมีรายการใหม่ระหว่างที่เปิดแอปอยู่ (ตรวจรายการใหม่เป็นระยะ ไม่ใช้ push notification)");
  if (f.camera) lines.push("- ถ่ายรูปจากกล้องในแอป แล้วเก็บรูปลง Google Drive");
  if (f.qr) lines.push("- มี QR Code ของลิงก์แอปในหน้าแอดมิน ให้พิมพ์ติดหน้าร้านได้");
  // the same heading as PRO_HEADING in lib/style-mockup.ts (the chat box swaps the block by it)
  return lines.length ? `ความสามารถเสริม (Pro):\n${lines.join("\n")}` : "";
}
