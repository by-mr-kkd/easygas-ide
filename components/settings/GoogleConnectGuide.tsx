import { StepGuide, type GuideStep } from "./StepGuide";

const STEPS: GuideStep[] = [
  {
    n: [1],
    title: "กด “เชื่อมต่อ Google”",
    body: "แอปจะเปิดหน้าล็อกอินของ Google ในเบราว์เซอร์ปกติของคุณ",
    img: { src: "01-connect.webp", w: 736, h: 267, alt: "ปุ่มเชื่อมต่อ Google ในหน้าตั้งค่า" },
  },
  {
    n: [2],
    title: "ถ้า Windows ถามเรื่องไฟร์วอลล์ กด Allow",
    body: "ขึ้นเฉพาะครั้งแรก แอปต้องรับผลล็อกอินที่ Google ส่งกลับมาในเครื่องคุณเอง ไม่ได้เปิดอะไรออกอินเทอร์เน็ต",
    img: { src: "02-firewall.webp", w: 446, h: 419, alt: "หน้าต่าง Windows Security กด Allow" },
  },
  {
    n: [3],
    title: "เลือกบัญชี Google ที่จะใช้เผยแพร่",
    body: "แอปที่สร้างจะไปอยู่ในบัญชีนี้ ลิงก์ของแอปก็เป็นของบัญชีนี้",
    img: { src: "03-account.webp", w: 1151, h: 608, alt: "หน้าเลือกบัญชีของ Google" },
  },
  {
    n: [4],
    title: "กด “ดำเนินการต่อ”",
    body: "หน้านี้ขึ้นชื่อ clasp – The Apps Script CLI เป็นเครื่องมือทางการของ Google ที่แอปใช้ส่งโค้ดขึ้นบัญชีคุณ",
    img: { src: "04-signin.webp", w: 1062, h: 656, alt: "หน้าลงชื่อเข้าใช้งานใน clasp กดดำเนินการต่อ" },
  },
  {
    n: [5, 6],
    title: "ติ๊ก “เลือกทั้งหมด” แล้วกด “ดำเนินการต่อ”",
    body: "ต้องติ๊กให้ครบ ถ้าขาดข้อใดข้อหนึ่ง ตอนเผยแพร่จะติดสิทธิ์ แล้วต้องมาเชื่อมใหม่",
    img: { src: "05-scopes.webp", w: 869, h: 925, alt: "หน้าเลือกสิทธิ์ ติ๊กเลือกทั้งหมดแล้วกดดำเนินการต่อ" },
  },
  {
    n: [],
    title: "เบราว์เซอร์ขึ้นข้อความ “Logged in! You may close this page.”",
    body: "แปลว่าเชื่อมต่อสำเร็จแล้ว ปิดหน้าเว็บนั้นได้เลย แล้วกลับมาที่แอป",
  },
  {
    n: [7, 8],
    title: "ที่แอปจะขึ้น “เชื่อมแล้ว” เอง จากนั้นคลิก “เปิดที่ usersettings”",
    body: "ขั้นที่เหลือทำครั้งเดียวต่อบัญชี: เปิดสวิตช์ Apps Script API ให้บัญชีนี้ ไม่งั้นเผยแพร่ไม่ได้",
    img: { src: "07-connected.webp", w: 682, h: 215, alt: "ป้ายเชื่อมแล้ว และลิงก์เปิดที่ usersettings" },
  },
  {
    n: [9],
    title: "ในหน้าการตั้งค่าของ Apps Script กดที่ “Google Apps Script API”",
    body: "ตอนแรกจะเห็นเป็น “ปิด”",
    img: { src: "09-usersettings.webp", w: 236, h: 150, alt: "รายการ Google Apps Script API สถานะปิด" },
  },
  {
    n: [10],
    title: "เลื่อนสวิตช์เป็น “เปิด”",
    body: "เสร็จแล้ว กลับมาที่แอปแล้วกดเผยแพร่ได้เลย ไม่ต้องกดอะไรเพิ่มในหน้านี้",
    img: { src: "10-enable.webp", w: 1655, h: 286, alt: "สวิตช์ Google Apps Script API เปิดอยู่" },
  },
];

/** Step-by-step pictures of the Google sign-in, folded under the account card; open by default until connected. */
export function GoogleConnectGuide({ open }: { open: boolean }) {
  return <StepGuide title="วิธีเชื่อมบัญชี Google ทีละขั้น (มีภาพประกอบ)" note="ราว 2 นาที ทำครั้งเดียว" folder="google" steps={STEPS} open={open} />;
}
