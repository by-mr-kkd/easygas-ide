/**
 * Guided tours: a spotlight walks a first-time user through a screen one element at a time.
 * The screens mark their elements with `data-tour="<target>"`; a step whose element is not on
 * the screen right now (the setup card once both steps are done, the code pane while the style tab
 * shows) is skipped. Pure, so the step lists and the bubble maths are testable in Node.
 */

export type TourId = "home" | "ide";

export type TourStep = {
  /** the `data-tour` value of the element to light up */
  target: string;
  title: string;
  body: string;
  /** which side of the element the bubble prefers; it flips when there is no room */
  side?: "top" | "bottom" | "left" | "right";
};

export const TOURS: Record<TourId, readonly TourStep[]> = {
  home: [
    {
      target: "setup",
      title: "เริ่มจากตรงนี้",
      body: "ใส่ API key ของ AI ก่อน ถึงจะเริ่มสร้างได้ ส่วนบัญชี Google ใช้ตอนเผยแพร่เท่านั้น ยังไม่เชื่อมก็สร้างและแก้ได้",
    },
    {
      target: "new-project",
      title: "สร้างโปรเจกต์ใหม่",
      body: "ตั้งชื่อ เลือกว่าโค้ดเป็นสคริปต์แยก หรือผูกอยู่ในไฟล์ Google Sheet แล้วเข้าไปเล่าให้ AI ฟังในหน้าเขียนโค้ด เปลี่ยนชื่อทีหลังได้",
      side: "bottom",
    },
    {
      target: "other-starts",
      title: "สลับดูได้ในหน้าเดียว",
      body: "โปรเจกต์ของฉัน = ทุกอย่างในเครื่องนี้ · สคริปต์ใน Google = ดึงของเดิมในบัญชีมาแก้ต่อ · จากลิงก์แชร์ = โคลนโค้ดที่คนอื่นแชร์ไว้",
      side: "bottom",
    },
    {
      target: "projects",
      title: "โปรเจกต์ของฉัน",
      body: "ทุกอย่างที่เคยสร้างอยู่ที่นี่ กดชื่อเพื่อเปิดแก้ต่อ กรองตามสถานะหรือค้นหาได้ (Ctrl+K) ปุ่ม ⋯ ท้ายแถวมีเปลี่ยนชื่อ เปิดโฟลเดอร์ และลบ",
      side: "top",
    },
    {
      target: "settings",
      title: "ตั้งค่าและเปลี่ยน AI",
      body: "เปลี่ยน AI ที่ใช้ เชื่อมบัญชี Google หรือดูสถานะ Pro ได้ที่นี่ ปุ่ม ? มุมขวาบนเปิดคำแนะนำนี้ซ้ำได้ทุกเมื่อ",
      side: "bottom",
    },
  ],
  ide: [
    {
      target: "start-chips",
      title: "จะเริ่มแบบไหน",
      body: "เริ่มสร้างเลย = AI ทำระบบจริงทันที · สร้างเดโม่ให้ดูก่อน = ทำหน้าจออย่างเดียวให้ดูหน้าตาก่อน เลือกสี ฟอนต์ หรือส่งรูปได้ · ถามทีละข้อ = แอปถามแล้วเรียบเรียงโจทย์ให้",
      side: "right",
    },
    {
      target: "style-pane",
      title: "ตัวอย่างและสไตล์",
      body: "เลือกเมนู ปุ่ม ตาราง แล้วดูตัวอย่างที่ประกอบให้ทันทีโดยไม่ใช้ AI กดใส่ในช่องแชท หรือให้ AI ทำเดโม่ตามนี้ได้เลย",
      side: "left",
    },
    {
      target: "chat",
      title: "คุยกับ AI ตรงนี้",
      body: "บอกว่าอยากเพิ่มหรือแก้อะไร AI จะแก้โค้ดให้เอง เห็นผลในพรีวิวทันที พิมพ์เสร็จแล้วกดปุ่ม ส่ง (Enter ใช้ขึ้นบรรทัดใหม่)",
      side: "right",
    },
    {
      target: "code",
      title: "โค้ดของโปรเจกต์",
      body: "ไฟล์ทั้งหมดอยู่ที่นี่ แก้เองได้ถ้าอยากแก้ แต่ส่วนใหญ่ให้ AI แก้ให้ผ่านแชตจะง่ายกว่า",
      side: "left",
    },
    {
      target: "preview",
      title: "พรีวิวหน้าตาของแอป",
      body: "หน้าตาเหมือนของจริง สลับดูแบบจอคอมหรือมือถือได้ ปุ่มที่บันทึกข้อมูลจะทำงานจริงหลังเผยแพร่",
      side: "left",
    },
    {
      target: "views",
      title: "เลือกสิ่งที่แสดงข้างแชต",
      body: "แถบซ้ายสลับว่าจะดูพรีวิว โค้ด คู่กัน หรือสไตล์ ปุ่ม ซ่อนแชต ด้านบนพับแผงแชตเพื่อให้พรีวิวเต็มจอ",
      side: "right",
    },
    {
      target: "deploy",
      title: "พอใจแล้วกดเผยแพร่",
      body: "แอปจะขึ้นบัญชี Google ของคุณเอง ได้ลิงก์เอาไปใช้จริงได้ทันที แก้เพิ่มแล้วเผยแพร่ใหม่ ลิงก์ก็ยังเป็นลิงก์เดิม",
      side: "bottom",
    },
    {
      target: "search",
      title: "ค้นหาและสั่งงานเร็ว",
      body: "กด Ctrl+K เพื่อหาไฟล์หรือสั่งงานโดยไม่ต้องหาเมนู ปุ่ม ? ข้าง ๆ เปิดคำแนะนำนี้ซ้ำได้",
      side: "bottom",
    },
  ],
};

/** The settings.app key (and localStorage key) under which a tour remembers that it has been shown. */
export const tourSeenKey = (id: TourId): string => `tour_seen_${id}`;

/** The steps whose element is on the screen now, in order; the tour shows only these. */
export function presentSteps(steps: readonly TourStep[], isPresent: (target: string) => boolean): TourStep[] {
  return steps.filter((s) => isPresent(s.target));
}

export type Rect = { top: number; left: number; width: number; height: number };
export type Size = { width: number; height: number };

/** The lit area: the element plus a little breathing room, kept inside the window. */
export function spotlightRect(target: Rect, viewport: Size, pad = 6): Rect {
  const left = Math.max(0, target.left - pad);
  const top = Math.max(0, target.top - pad);
  const right = Math.min(viewport.width, target.left + target.width + pad);
  const bottom = Math.min(viewport.height, target.top + target.height + pad);
  return { left, top, width: Math.max(0, right - left), height: Math.max(0, bottom - top) };
}

const MARGIN = 12;
const GAP = 12;

const clamp = (n: number, lo: number, hi: number): number => Math.min(Math.max(n, lo), Math.max(lo, hi));

/**
 * Where the bubble goes: on the preferred side of the lit area when it fits, otherwise on the
 * side with the most room; then slid so it stays inside the window. Everything in window
 * coordinates (position: fixed).
 */
export function bubblePosition(
  spot: Rect,
  bubble: Size,
  viewport: Size,
  prefer: NonNullable<TourStep["side"]> = "bottom",
): { top: number; left: number; side: NonNullable<TourStep["side"]> } {
  const room = {
    top: spot.top,
    bottom: viewport.height - (spot.top + spot.height),
    left: spot.left,
    right: viewport.width - (spot.left + spot.width),
  };
  const need = (s: keyof typeof room) => (s === "top" || s === "bottom" ? bubble.height : bubble.width) + GAP + MARGIN;
  const side = room[prefer] >= need(prefer)
    ? prefer
    : (Object.keys(room) as (keyof typeof room)[]).reduce((best, s) => (room[s] - need(s) > room[best] - need(best) ? s : best), prefer);

  const centreX = spot.left + spot.width / 2 - bubble.width / 2;
  const centreY = spot.top + spot.height / 2 - bubble.height / 2;
  let top: number;
  let left: number;
  if (side === "bottom") {
    top = spot.top + spot.height + GAP;
    left = centreX;
  } else if (side === "top") {
    top = spot.top - GAP - bubble.height;
    left = centreX;
  } else if (side === "right") {
    top = centreY;
    left = spot.left + spot.width + GAP;
  } else {
    top = centreY;
    left = spot.left - GAP - bubble.width;
  }
  return {
    side,
    top: clamp(top, MARGIN, viewport.height - bubble.height - MARGIN),
    left: clamp(left, MARGIN, viewport.width - bubble.width - MARGIN),
  };
}
