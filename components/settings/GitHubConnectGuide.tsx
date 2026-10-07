import { StepGuide, type GuideStep } from "./StepGuide";

const STEPS: GuideStep[] = [
  {
    n: [],
    title: "กดปุ่ม “เชื่อมบัญชี GitHub”",
    body: "แอปจะขอรหัสจาก GitHub แล้วเปิดหน้า GitHub ในเบราว์เซอร์ให้เอง",
  },
  {
    n: [],
    title: "ยังไม่มีบัญชี GitHub หรือยังไม่ได้ล็อกอิน? จะเจอหน้านี้ก่อน",
    body: "มีบัญชีแล้วก็ล็อกอินได้เลย ยังไม่มีให้กด “Create an account” หรือ “Continue with Google” สมัครฟรี ไม่ต้องใส่บัตร เสร็จแล้วทำข้อ 1 ต่อ",
    img: { src: "00-signin.webp", w: 545, h: 658, alt: "หน้า Sign in to GitHub มีปุ่ม Create an account" },
  },
  {
    n: [1],
    title: "แอปโชว์รหัส 8 ตัว กด “คัดลอก”",
    body: "รหัสนี้ใช้ครั้งเดียว ถ้าหน้า GitHub ไม่เปิด กด “เปิดหน้า GitHub อีกครั้ง”",
    img: { src: "01-code.webp", w: 706, h: 268, alt: "แอปแสดงรหัส 8 ตัวพร้อมปุ่มคัดลอก" },
  },
  {
    n: [2],
    title: "หน้า Device Activation กด “Continue”",
    body: "ตรวจว่าชื่อบัญชีที่ขึ้น Signed in as คือบัญชีที่อยากใช้ ถ้าไม่ใช่กด “Use a different account”",
    img: { src: "02-activation.webp", w: 564, h: 476, alt: "หน้า Device Activation ของ GitHub กด Continue" },
  },
  {
    n: [3, 4],
    title: "วางรหัส 8 ตัว แล้วกด “Continue”",
    body: "พิมพ์หรือวางรหัสจากข้อ 1 ลงช่อง",
    img: { src: "03-enter-code.webp", w: 623, h: 641, alt: "หน้า Authorize your device ใส่รหัสแล้วกด Continue" },
  },
  {
    n: [5],
    title: "กด “Authorize by-mr-kkd”",
    body: "แอปขอสิทธิ์เฉพาะ Repositories เพื่อสร้างที่เก็บหน้าเว็บในบัญชีคุณ ไม่แตะอย่างอื่น ถอนสิทธิ์ได้ทุกเมื่อที่หน้าตั้งค่าของ GitHub",
    img: { src: "05-authorize.webp", w: 657, h: 750, alt: "หน้า Authorize EasyGAS IDE กด Authorize" },
  },
  {
    n: [6],
    title: "ถ้า GitHub ขอยืนยันตัวตน (Confirm access) กด “Use GitHub Mobile”",
    body: "ขึ้นเฉพาะบางบัญชี ถ้าไม่มีแอป GitHub Mobile ในมือถือ เลือก “Use your authenticator app” หรือ “Send a code via email” แทนได้",
    img: { src: "06-confirm.webp", w: 495, h: 560, alt: "หน้า Confirm access กด Use GitHub Mobile" },
  },
  {
    n: [7],
    title: "เปิดแอป GitHub ในมือถือ แล้วกดเลขที่ตรงกับหน้าจอ",
    body: "มือถือจะเด้งแจ้งเตือนให้ยืนยัน เลือกเลขที่ตรงกับที่โชว์บนคอม",
    img: { src: "07-mobile.webp", w: 438, h: 689, alt: "หน้า GitHub Mobile แสดงเลขให้กดในมือถือ" },
  },
  {
    n: [8],
    title: "ขึ้น Congratulations, you're all set! ปิดหน้าเว็บได้เลย",
    body: "กลับมาที่แอป จะขึ้นชื่อบัญชี GitHub เอง ตอนเผยแพร่ครั้งแรก GitHub Pages ใช้เวลาราว 1–2 นาทีถึงจะเปิดลิงก์ได้ ไม่ใช่พัง",
    img: { src: "08-done.webp", w: 658, h: 535, alt: "หน้า Congratulations, you're all set!" },
  },
];

/** Step-by-step pictures of the GitHub sign-in, folded under the account card on the Pro page. */
export function GitHubConnectGuide({ open = false }: { open?: boolean }) {
  return <StepGuide title="วิธีเชื่อมบัญชี GitHub ทีละขั้น (มีภาพประกอบ)" note="ราว 2 นาที ทำครั้งเดียว" folder="github" steps={STEPS} open={open} />;
}
