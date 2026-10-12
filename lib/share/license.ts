/**
 * What a share's code may be used for (pure, tested). Vendored from EasyGAS-Site lib/share-license.ts — change both
 * together. A share built on another one may not be looser than its parent (rank: mit < egs < personal).
 */

export type ShareLicense = "mit" | "egs" | "personal";

export const SHARE_LICENSES: readonly { id: ShareLicense; label: string; short: string; text: string }[] = [
  {
    id: "egs",
    label: "ใช้และแก้ได้ ห้ามขายต่อ",
    short: "ห้ามขายต่อ",
    text: "เอาไปใช้ในงานหรือธุรกิจของตัวเอง และแก้ได้ตามใจ แต่ห้ามขายโค้ดนี้หรือโค้ดที่แก้จากนี้ต่อ",
  },
  {
    id: "mit",
    label: "ใช้ได้อิสระ (MIT)",
    short: "MIT",
    text: "ทำอะไรก็ได้ รวมถึงขายหรือแจกต่อ ขอแค่ให้เครดิตผู้แชร์ไว้",
  },
  {
    id: "personal",
    label: "ใช้ส่วนตัวหรือเรียนรู้เท่านั้น",
    short: "ใช้ส่วนตัว",
    text: "ใช้เองหรือศึกษาได้ ห้ามใช้เชิงพาณิชย์ และห้ามขายหรือแจกต่อ",
  },
];

export const DEFAULT_LICENSE: ShareLicense = "egs";
const RANK: Record<ShareLicense, number> = { mit: 0, egs: 1, personal: 2 };

export function licenseOf(v: unknown): ShareLicense {
  return v === "mit" || v === "personal" || v === "egs" ? v : DEFAULT_LICENSE;
}

export function licenseInfo(v: unknown) {
  const id = licenseOf(v);
  return SHARE_LICENSES.find((l) => l.id === id)!;
}

/** The licenses a share built on `parent` may take: the parent's or stricter. */
export function licensesAllowed(parent: unknown): ShareLicense[] {
  if (parent === null || parent === undefined) return SHARE_LICENSES.map((l) => l.id);
  const floor = RANK[licenseOf(parent)];
  return SHARE_LICENSES.map((l) => l.id).filter((id) => RANK[id] >= floor);
}
