/**
 * Style Lab catalog — curated, shoppable UI building blocks for GAS web apps (docs/STYLE-LAB.md).
 * Each item has a self-contained `previewHtml` (rendered in a sandboxed iframe on /styleshopping) and
 * a Thai `promptSnippet` that gets bundled into the new-project prompt. Snippets map to patterns the
 * rulebook already knows (nav, SweetAlert2, loading state, leading-zero, …) so the output stays
 * consistent + safe. This is a SEED set — grow it; nothing here is load-bearing beyond the page.
 */

export interface StyleCategory {
  id: string;
  title: string;
  hint: string; // one-line guidance shown atop the category
}

export interface StyleItem {
  id: string;
  category: StyleCategory["id"];
  title: string;
  when: string; // when to use (Thai)
  promptSnippet: string; // injected into the combined prompt
  previewHtml: string; // self-contained, renders in a sandboxed iframe
}

export const STYLE_CATEGORIES: StyleCategory[] = [
  { id: "nav", title: "เมนู & การจัดวาง", hint: "เลือกวิธีจัดเมนู — sidebar เหมาะจอใหญ่/หลายเมนู, top tabs เรียบง่าย, bottom bar เน้นมือถือ" },
  { id: "buttons", title: "ปุ่ม & การโต้ตอบ", hint: "หน้าตาปุ่ม + สถานะระหว่างรอเซิร์ฟเวอร์ (สำคัญมากบน Apps Script)" },
  { id: "feedback", title: "แจ้งเตือน & ป๊อปอัป", hint: "ยืนยัน/แจ้งผล แบบสวยและไม่รบกวน" },
  { id: "theme", title: "ธีม & โทนสี", hint: "โหมดสว่าง/มืด และโทนสีรวม" },
  { id: "data", title: "แสดงข้อมูล", hint: "ตาราง/การ์ดสรุป สำหรับข้อมูลจาก Google Sheet" },
  { id: "thai", title: "เฉพาะธุรกิจไทย", hint: "พร้อมเพย์ · วันที่ พ.ศ. · เบอร์โทร — สิ่งที่ AI ทั่วไปมักทำพลาด" },
  { id: "forms", title: "ฟอร์ม", hint: "รูปแบบฟอร์มกรอกข้อมูล" },
  { id: "notify", title: "แจ้งเตือน & ส่งข้อความ", hint: "อีเมล · LINE · LIFF — จุดแข็งของ GAS" },
  { id: "auto", title: "ตั้งเวลา & อัตโนมัติ", hint: "ทำงานเองตามเวลา/เมื่อมีฟอร์มเข้ามา (Triggers)" },
  { id: "search", title: "ค้นหา & กรอง", hint: "ค้นหา/กรอง/เลือกช่วงวันที่เหนือข้อมูล" },
  { id: "report", title: "รายงาน & ส่งออก", hint: "กราฟ · export CSV/PDF · สร้างเอกสารจากเทมเพลต" },
  { id: "media", title: "กล้อง · ไฟล์ · QR", hint: "ถ่ายรูปนิ่ง/สร้าง QR/อัปโหลด Drive — กล้องสดทำบน GAS ไม่ได้ (โปรเจกต์ Proที่เผยแพร่บน GitHub Pages ทำได้)" },
  { id: "map", title: "แผนที่ & ตำแหน่ง", hint: "ฝังแผนที่ ปักหมุด นำทาง" },
  { id: "workflow", title: "เวิร์กโฟลว์ & สถานะ", hint: "อนุมัติ · ขั้นตอน · มอบหมายงาน" },
  { id: "admin", title: "ตั้งค่า & แอดมิน", hint: "หน้าตั้งค่า/จัดการผู้ใช้" },
  { id: "auth", title: "เข้าสู่ระบบ & สิทธิ์", hint: "ล็อกอินปลอดภัย · จำการเข้าสู่ระบบ · หน้าตามสิทธิ์" },
  { id: "robust", title: "ความทนทาน", hint: "สิ่งที่ AI ทั่วไปข้าม — กันแอปค้าง/พัง/ช้า" },
];

const FONT = "font-family:system-ui,'Noto Sans Thai',sans-serif";
const doc = (body: string) =>
  `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">` +
  `<style>*{box-sizing:border-box}body{${FONT};margin:0;padding:14px;background:#f8fafc;color:#0f172a;font-size:14px}` +
  `button{cursor:pointer;font-family:inherit}</style></head><body>${body}</body></html>`;

export const STYLE_CATALOG: StyleItem[] = [
  // ── nav ──
  {
    id: "nav-sidebar",
    category: "nav",
    title: "เมนูข้าง (Sidebar)",
    when: "มีหลายเมนู/หน้า และใช้บนจอใหญ่เป็นหลัก — บนมือถือพับเป็นปุ่มขีดสามขีด",
    promptSnippet: "ใช้เมนูแบบ Sidebar (เมนูข้างซ้าย ไฮไลต์เมนูที่เลือก พับเก็บเป็น hamburger บนมือถือ)",
    previewHtml: doc(
      `<div style="display:flex;gap:0;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;height:150px">
        <nav style="width:120px;background:#0f172a;color:#cbd5e1;padding:12px 8px;font-size:13px">
          <div style="font-weight:700;color:#fff;margin-bottom:10px">เมนู</div>
          <div style="background:#1e293b;color:#fff;padding:7px 9px;border-radius:8px">📊 สรุป</div>
          <div style="padding:7px 9px">📋 รายการ</div>
          <div style="padding:7px 9px">⚙️ ตั้งค่า</div>
        </nav>
        <div style="flex:1;padding:14px"><div style="font-weight:700">สรุป</div><div style="color:#64748b;font-size:13px;margin-top:6px">เนื้อหาของหน้าที่เลือก</div></div>
      </div>`,
    ),
  },
  {
    id: "nav-topbar",
    category: "nav",
    title: "แท็บด้านบน (Top tabs)",
    when: "เมนูไม่เยอะ (2–4) อยากได้แบบเรียบง่าย สลับหน้าเร็ว",
    promptSnippet: "ใช้เมนูแบบแท็บด้านบน (Top tabs) สลับเนื้อหาแบบ SPA ไม่รีโหลดหน้า",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden">
        <div style="display:flex;gap:4px;border-bottom:1px solid #e2e8f0;padding:8px 8px 0">
          <div style="padding:8px 14px;border-bottom:2px solid #6366f1;color:#4338ca;font-weight:600">สรุป</div>
          <div style="padding:8px 14px;color:#64748b">รายการ</div>
          <div style="padding:8px 14px;color:#64748b">ตั้งค่า</div>
        </div>
        <div style="padding:16px;color:#64748b;font-size:13px">เนื้อหาแท็บที่เลือก</div>
      </div>`,
    ),
  },
  {
    id: "nav-bottom",
    category: "nav",
    title: "แถบล่างมือถือ (Bottom bar)",
    when: "ใช้บนมือถือเป็นหลัก เอื้อมนิ้วถึงง่าย 3–5 เมนู",
    promptSnippet: "ใช้เมนูแบบแถบล่างมือถือ (Bottom tab bar) ไอคอน+ป้ายกำกับ 3–5 ปุ่ม",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;height:150px;display:flex;flex-direction:column;overflow:hidden">
        <div style="flex:1;padding:16px;color:#64748b;font-size:13px">หน้าจอแอป</div>
        <div style="display:flex;border-top:1px solid #e2e8f0;text-align:center;font-size:12px">
          <div style="flex:1;padding:10px;color:#4338ca">🏠<br>หน้าหลัก</div>
          <div style="flex:1;padding:10px;color:#94a3b8">📋<br>รายการ</div>
          <div style="flex:1;padding:10px;color:#94a3b8">👤<br>โปรไฟล์</div>
        </div>
      </div>`,
    ),
  },
  // ── buttons ──
  {
    id: "btn-rounded",
    category: "buttons",
    title: "ปุ่มมุมโค้ง โทนเดียว",
    when: "อยากได้ลุคสะอาด ทันสมัย ปุ่มหลักเด่นชัด",
    promptSnippet: "ใช้ปุ่มมุมโค้งมน โทนสีหลักเดียวเด่นชัด ปุ่มรองเป็นขอบเส้น",
    previewHtml: doc(
      `<div style="display:flex;gap:10px;align-items:center;padding:10px">
        <button style="background:#6366f1;color:#fff;border:0;padding:11px 20px;border-radius:12px;font-weight:600">บันทึก</button>
        <button style="background:#fff;color:#475569;border:1px solid #cbd5e1;padding:11px 20px;border-radius:12px;font-weight:600">ยกเลิก</button>
      </div>`,
    ),
  },
  {
    id: "btn-loading",
    category: "buttons",
    title: "ปุ่ม + สถานะกำลังโหลด",
    when: "ทุกปุ่มที่บันทึก/เรียกเซิร์ฟเวอร์ — กันกดซ้ำ + บอกผู้ใช้ว่ากำลังทำงาน",
    promptSnippet: "ทุกปุ่มที่เรียกเซิร์ฟเวอร์ (google.script.run) ให้ปิดปุ่ม + แสดง spinner 'กำลังบันทึก…' ระหว่างรอ แล้วเปิดคืนทั้งตอนสำเร็จและตอนผิดพลาด",
    previewHtml: doc(
      `<div style="display:flex;gap:10px;padding:10px;align-items:center">
        <button id="b" style="background:#6366f1;color:#fff;border:0;padding:11px 20px;border-radius:12px;font-weight:600">บันทึก</button>
        <span style="color:#94a3b8;font-size:12px">กดดูตอนกำลังโหลด</span>
      </div>
      <script>var b=document.getElementById('b');b.onclick=function(){if(b.disabled)return;var t=b.textContent;b.disabled=true;b.style.opacity=.6;b.textContent='⏳ กำลังบันทึก…';setTimeout(function(){b.disabled=false;b.style.opacity=1;b.textContent=t;},1400);};</script>`,
    ),
  },
  // ── feedback ──
  {
    id: "fb-sweetalert",
    category: "feedback",
    title: "SweetAlert2 (ยืนยัน/สำเร็จ)",
    when: "ยืนยันก่อนลบ/บันทึก, แจ้งสำเร็จ-ผิดพลาด แบบสวยกว่า alert ธรรมดา",
    promptSnippet: "ใช้ SweetAlert2 (โหลดจาก CDN) สำหรับยืนยันลบ/บันทึก และแจ้งผลสำเร็จ-ผิดพลาด แทน alert/confirm ธรรมดา",
    previewHtml: doc(
      `<script src="https://cdn.jsdelivr.net/npm/sweetalert2@11"></script>
      <div style="padding:10px"><button id="d" style="background:#ef4444;color:#fff;border:0;padding:11px 18px;border-radius:10px;font-weight:600">🗑 ลบรายการ</button></div>
      <script>document.getElementById('d').onclick=function(){Swal.fire({title:'ลบรายการนี้?',text:'ลบแล้วกู้คืนไม่ได้',icon:'warning',showCancelButton:true,confirmButtonColor:'#ef4444',cancelButtonColor:'#94a3b8',confirmButtonText:'ลบเลย',cancelButtonText:'ยกเลิก'}).then(function(r){if(r.isConfirmed)Swal.fire({title:'ลบแล้ว!',icon:'success',timer:1200,showConfirmButton:false});});};</script>`,
    ),
  },
  {
    id: "fb-toast",
    category: "feedback",
    title: "Toast แจ้งผลมุมจอ",
    when: "แจ้งสำเร็จเล็กๆ น้อยๆ โดยไม่ขัดจังหวะผู้ใช้",
    promptSnippet: "แจ้งผลสำเร็จด้วย toast มุมขวาบนแบบไม่บล็อก (auto-hide ~2.5 วิ)",
    previewHtml: doc(
      `<div style="padding:10px"><button id="s" style="background:#10b981;color:#fff;border:0;padding:11px 18px;border-radius:10px;font-weight:600">บันทึก</button></div>
      <div id="t" style="position:fixed;top:12px;right:12px;background:#0f172a;color:#fff;padding:9px 14px;border-radius:10px;font-size:13px;opacity:0;transition:.25s;transform:translateY(-6px)">✅ บันทึกแล้ว</div>
      <script>document.getElementById('s').onclick=function(){var t=document.getElementById('t');t.style.opacity=1;t.style.transform='none';clearTimeout(t._x);t._x=setTimeout(function(){t.style.opacity=0;t.style.transform='translateY(-6px)';},2000);};</script>`,
    ),
  },
  // ── theme ──
  {
    id: "theme-darktoggle",
    category: "theme",
    title: "สลับโหมดสว่าง/มืด",
    when: "อยากให้ผู้ใช้เลือกโหมดเองได้ และจำค่าไว้รอบหน้า",
    promptSnippet: "มีปุ่มสลับโหมดสว่าง/มืด ใช้ CSS variables + คลาส .dark ที่ <html> และจำค่าที่เลือกใน localStorage",
    previewHtml: doc(
      `<div id="c" style="border:1px solid #e2e8f0;border-radius:12px;padding:16px;max-width:260px;background:#fff;color:#0f172a;transition:.2s">
        <div style="font-weight:700">ยอดขายวันนี้</div>
        <div style="font-size:26px;font-weight:800;margin:6px 0">฿12,450</div>
        <button id="t" style="border:1px solid #cbd5e1;background:transparent;color:inherit;padding:8px 12px;border-radius:9px">🌙 สลับเป็น Dark</button>
      </div>
      <script>var c=document.getElementById('c'),t=document.getElementById('t'),d=false;t.onclick=function(){d=!d;c.style.background=d?'#1e293b':'#fff';c.style.color=d?'#f1f5f9':'#0f172a';c.style.borderColor=d?'#334155':'#e2e8f0';t.textContent=d?'☀️ สลับเป็น Light':'🌙 สลับเป็น Dark';};</script>`,
    ),
  },
  // ── data ──
  {
    id: "data-table",
    category: "data",
    title: "ตารางค้นหา/เรียงได้",
    when: "แสดงข้อมูลจาก Sheet เป็นตาราง ค้นหาและแบ่งหน้าได้",
    promptSnippet: "แสดงข้อมูลเป็นตารางที่ค้นหา/เรียงได้ และแบ่งหน้าเมื่อข้อมูลเยอะ (ดึงข้อมูลแบบ pagination ไม่โหลดทั้งหมดรวด)",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden">
        <div style="padding:8px"><input placeholder="🔍 ค้นหา…" style="width:100%;border:1px solid #e2e8f0;border-radius:8px;padding:7px 10px;font-size:13px"></div>
        <table style="width:100%;border-collapse:collapse;font-size:13px">
          <tr style="background:#f1f5f9;text-align:left"><th style="padding:8px">ชื่อ</th><th style="padding:8px">ยอด</th><th style="padding:8px">สถานะ</th></tr>
          <tr style="border-top:1px solid #eef2f7"><td style="padding:8px">สมชาย</td><td style="padding:8px">฿1,200</td><td style="padding:8px"><span style="background:#dcfce7;color:#16a34a;padding:2px 8px;border-radius:999px;font-size:11px">จ่ายแล้ว</span></td></tr>
          <tr style="border-top:1px solid #eef2f7"><td style="padding:8px">มาลี</td><td style="padding:8px">฿890</td><td style="padding:8px"><span style="background:#fef9c3;color:#ca8a04;padding:2px 8px;border-radius:999px;font-size:11px">รอจ่าย</span></td></tr>
        </table>
      </div>`,
    ),
  },
  {
    id: "data-kpi",
    category: "data",
    title: "การ์ดสรุป KPI",
    when: "แดชบอร์ด — โชว์ตัวเลขสำคัญด้านบนก่อนรายละเอียด",
    promptSnippet: "มีการ์ดสรุปตัวเลขสำคัญ (KPI) เรียงด้านบนของหน้า เช่น ยอดวันนี้/จำนวนรายการ/ค้างจ่าย",
    previewHtml: doc(
      `<div style="display:grid;grid-template-columns:1fr 1fr;gap:10px">
        <div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px"><div style="color:#64748b;font-size:12px">ยอดขายวันนี้</div><div style="font-size:22px;font-weight:800">฿12,450</div></div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px"><div style="color:#64748b;font-size:12px">ออเดอร์</div><div style="font-size:22px;font-weight:800">38</div></div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px"><div style="color:#64748b;font-size:12px">ลูกค้าใหม่</div><div style="font-size:22px;font-weight:800">7</div></div>
        <div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px"><div style="color:#64748b;font-size:12px">ค้างจ่าย</div><div style="font-size:22px;font-weight:800;color:#ea580c">฿2,100</div></div>
      </div>`,
    ),
  },
  // ── thai ──
  {
    id: "thai-promptpay",
    category: "thai",
    title: "QR พร้อมเพย์ (PromptPay)",
    when: "รับเงินผ่าน QR — ลูกค้าสแกนจ่ายด้วยแอปธนาคาร",
    promptSnippet: "แสดง QR พร้อมเพย์ (PromptPay) รับเงินตามยอด โดยสร้าง QR เป็นรูปจาก promptpay.io (<img src='https://promptpay.io/<เบอร์หรือพร้อมเพย์ไอดี>/<ยอด>.png'>) เบอร์/พร้อมเพย์ไอดีเก็บใน PropertiesService พร้อมปุ่มแนบสลิป",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;max-width:220px;text-align:center">
        <div style="font-weight:700;color:#1d4ed8">พร้อมเพย์</div>
        <div style="width:96px;height:96px;margin:10px auto;background:repeating-linear-gradient(45deg,#0f172a 0 6px,#fff 6px 12px);border-radius:8px"></div>
        <div style="font-size:13px;color:#64748b">ยอดชำระ</div>
        <div style="font-size:22px;font-weight:800">฿350.00</div>
      </div>`,
    ),
  },
  {
    id: "thai-date",
    category: "thai",
    title: "วันที่แบบไทย (พ.ศ.)",
    when: "เอกสาร/ใบเสร็จ/รายงานที่ต้องเป็นปี พ.ศ. แบบไทย",
    promptSnippet: "แสดงวันที่แบบไทย (ปี พ.ศ. เช่น 15 มิ.ย. 2569) และจัดรูปวันที่ด้วย Utilities.formatDate timezone Asia/Bangkok",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;max-width:240px">
        <div style="color:#64748b;font-size:12px">วันที่ออกเอกสาร</div>
        <div style="font-size:18px;font-weight:700">15 มิถุนายน 2569</div>
        <div style="color:#94a3b8;font-size:12px;margin-top:4px">(พ.ศ. — รูปแบบไทย)</div>
      </div>`,
    ),
  },
  {
    id: "thai-phone",
    category: "thai",
    title: "เบอร์โทร (เก็บเลข 0 นำหน้า)",
    when: "ฟอร์มที่มีเบอร์โทร/เลขบัตร — กัน Google Sheet กินเลข 0 ตัวหน้า",
    promptSnippet: "ช่องเบอร์โทร/เลขบัตร ให้เก็บเลข 0 นำหน้าได้ถูกต้อง (setNumberFormat('@') ก่อนเขียน + getDisplayValue ตอนอ่าน)",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;max-width:260px">
        <label style="font-size:13px;color:#475569">เบอร์โทร</label>
        <input value="089-123-4567" style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;margin-top:5px;font-size:14px">
        <div style="color:#16a34a;font-size:12px;margin-top:6px">✓ เก็บเป็นข้อความ — เลข 0 ไม่หาย</div>
      </div>`,
    ),
  },
  // ── forms ──
  {
    id: "form-clean",
    category: "forms",
    title: "ฟอร์มสะอาด คอลัมน์เดียว",
    when: "ฟอร์มกรอกข้อมูล/จองคิว/ลงทะเบียน — อ่านง่าย กรอกง่าย",
    promptSnippet: "ใช้ฟอร์มสะอาด คอลัมน์เดียว เว้นช่องโปร่ง ป้ายกำกับชัด ปุ่มส่งเด่น ตรวจค่าที่กรอกก่อนส่ง",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;max-width:280px">
        <div style="font-weight:700;margin-bottom:10px">จองคิว</div>
        <label style="font-size:13px;color:#475569">ชื่อ</label>
        <input style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;margin:5px 0 12px">
        <label style="font-size:13px;color:#475569">วันที่</label>
        <input type="date" style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px 11px;margin:5px 0 14px">
        <button style="width:100%;background:#10b981;color:#fff;border:0;padding:11px;border-radius:10px;font-weight:600">จองเลย</button>
      </div>`,
    ),
  },
  // ── notify ──
  {
    id: "notify-email",
    category: "notify",
    title: "ส่งอีเมลยืนยัน/แจ้งเตือน",
    when: "ยืนยันการจอง/สั่งซื้อ หรือแจ้งเตือนทีมงานทางอีเมล",
    promptSnippet: "ส่งอีเมลยืนยัน/แจ้งเตือนด้วย MailApp (มี try/catch และระวัง quota ส่งเมลต่อวัน)",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden;max-width:280px">
        <div style="background:#f1f5f9;padding:8px 12px;font-size:12px;color:#64748b">📧 ถึง: คุณลูกค้า</div>
        <div style="padding:12px"><div style="font-weight:700">ยืนยันการจองคิว</div><div style="color:#64748b;font-size:13px;margin-top:4px">วันที่ 20 มิ.ย. เวลา 14:00 น. — ขอบคุณค่ะ</div></div>
      </div>`,
    ),
  },
  {
    id: "notify-line",
    category: "notify",
    title: "แจ้งเตือนเข้า LINE เจ้าของร้าน",
    when: "มีออเดอร์/จองใหม่ → เด้งเข้า LINE ทันที (ยอดนิยมสุดสำหรับร้านไทย)",
    promptSnippet: "แจ้งเตือนเจ้าของร้านผ่าน LINE Messaging API push (channel access token เก็บใน PropertiesService) — ไม่ใช้ LINE Notify ที่ปิดบริการแล้ว",
    previewHtml: doc(
      `<div style="background:#06c755;padding:14px;border-radius:14px;max-width:260px">
        <div style="background:#fff;border-radius:10px;padding:10px 12px;font-size:13px">
          <b>🔔 ออเดอร์ใหม่ #1042</b><br><span style="color:#475569">สมชาย · ฿350 · พร้อมเพย์</span>
        </div>
      </div>`,
    ),
  },
  {
    id: "notify-liff",
    category: "notify",
    title: "เปิดหน้าในแอป LINE (LIFF)",
    when: "ให้ลูกค้าเปิดเว็บแอปจากในแชต LINE ได้เลย รู้ว่าใครเป็นใคร",
    promptSnippet: "เปิดหน้าเว็บแอปภายในแอป LINE ผ่าน LIFF (ดึงโปรไฟล์ผู้ใช้ LINE มาใช้)",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:18px;background:#fff;max-width:170px;padding:10px;text-align:center">
        <div style="background:#06c755;color:#fff;border-radius:10px;padding:6px;font-size:12px">LINE</div>
        <div style="margin-top:8px;font-size:13px;font-weight:700">จองคิว</div>
        <div style="color:#64748b;font-size:11px;margin:4px 0 8px">สวัสดีคุณ A 👋</div>
        <button style="width:100%;background:#06c755;color:#fff;border:0;padding:8px;border-radius:8px;font-size:12px">จองเลย</button>
      </div>`,
    ),
  },
  // ── auto ──
  {
    id: "auto-trigger",
    category: "auto",
    title: "ทำงานอัตโนมัติตามเวลา",
    when: "ส่งรายงานทุกเช้า / เตือนนัดล่วงหน้า / สรุปยอดสิ้นวัน โดยไม่ต้องกดเอง",
    promptSnippet: "ตั้ง time-driven trigger พร้อมฟังก์ชัน installTriggers() ให้กดติดตั้งครั้งเดียว เช่น ส่งรายงาน/เตือนนัดอัตโนมัติตามเวลา",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px;max-width:260px">
        <div style="font-weight:700">⏰ ตั้งเวลาอัตโนมัติ</div>
        <div style="margin-top:8px;display:flex;justify-content:space-between;font-size:13px;border-top:1px solid #eef2f7;padding-top:8px"><span style="color:#475569">ทุกวัน 08:00</span><span style="color:#16a34a">ส่งรายงานยอดขาย</span></div>
        <div style="display:flex;justify-content:space-between;font-size:13px;border-top:1px solid #eef2f7;padding-top:8px;margin-top:6px"><span style="color:#475569">ก่อนนัด 1 ชม.</span><span style="color:#16a34a">เตือนลูกค้า</span></div>
      </div>`,
    ),
  },
  {
    id: "auto-formsubmit",
    category: "auto",
    title: "ทำงานเมื่อมีฟอร์มส่งเข้ามา",
    when: "มีคนกรอก Google Form → บันทึก/แจ้งเตือน/ออกเลขที่อัตโนมัติทันที",
    promptSnippet: "ทำงานอัตโนมัติเมื่อมีการส่ง Google Form (onFormSubmit trigger) เช่น บันทึกลงชีต + แจ้งเตือน",
    previewHtml: doc(
      `<div style="display:flex;align-items:center;gap:8px;font-size:13px;max-width:300px">
        <div style="background:#eef2ff;color:#4338ca;border-radius:10px;padding:8px 10px">📝 ฟอร์มส่งเข้ามา</div>
        <span style="color:#94a3b8">→</span>
        <div style="background:#dcfce7;color:#16a34a;border-radius:10px;padding:8px 10px">บันทึก + แจ้งเตือน</div>
      </div>`,
    ),
  },
  // ── search ──
  {
    id: "search-filterbar",
    category: "search",
    title: "ค้นหา + ตัวกรอง (chips)",
    when: "ข้อมูลเยอะ อยากกรองตามหมวด/สถานะได้เร็ว",
    promptSnippet: "มีช่องค้นหา + ตัวกรองแบบ filter chips เหนือรายการ (กรองตามหมวด/สถานะ)",
    previewHtml: doc(
      `<input placeholder="🔍 ค้นหา…" style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:8px 11px;font-size:13px;max-width:300px">
      <div style="display:flex;gap:6px;margin-top:8px;flex-wrap:wrap">
        <span style="background:#4338ca;color:#fff;border-radius:999px;padding:4px 12px;font-size:12px">ทั้งหมด</span>
        <span style="background:#eef2ff;color:#4338ca;border-radius:999px;padding:4px 12px;font-size:12px">รอจ่าย</span>
        <span style="background:#eef2ff;color:#4338ca;border-radius:999px;padding:4px 12px;font-size:12px">เสร็จแล้ว</span>
      </div>`,
    ),
  },
  {
    id: "search-daterange",
    category: "search",
    title: "เลือกช่วงวันที่",
    when: "ดูข้อมูล/รายงานเฉพาะช่วงเวลาที่สนใจ",
    promptSnippet: "มีตัวเลือกช่วงวันที่ (จากวันที่–ถึงวันที่) เพื่อกรองข้อมูล/รายงาน",
    previewHtml: doc(
      `<div style="display:flex;gap:8px;align-items:end;flex-wrap:wrap;max-width:320px">
        <div><div style="font-size:12px;color:#64748b">จาก</div><input type="date" style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px"></div>
        <div><div style="font-size:12px;color:#64748b">ถึง</div><input type="date" style="border:1px solid #e2e8f0;border-radius:8px;padding:7px 9px"></div>
        <button style="background:#6366f1;color:#fff;border:0;padding:8px 14px;border-radius:9px;font-weight:600">ดู</button>
      </div>`,
    ),
  },
  // ── report ──
  {
    id: "report-chart",
    category: "report",
    title: "กราฟสรุป",
    when: "เห็นแนวโน้มยอดขาย/จำนวนเป็นภาพ เข้าใจง่ายกว่าตัวเลข",
    promptSnippet: "แสดงกราฟสรุป (ใช้ Chart.js จาก CDN) เช่นยอดขายรายวัน/สัดส่วนหมวด",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px;max-width:280px">
        <div style="font-weight:700;font-size:13px;margin-bottom:10px">ยอดขาย 7 วัน</div>
        <div style="display:flex;align-items:end;gap:8px;height:80px">
          <div style="flex:1;background:#6366f1;height:40%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:#6366f1;height:65%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:#6366f1;height:50%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:#6366f1;height:85%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:#6366f1;height:70%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:#818cf8;height:100%;border-radius:4px 4px 0 0"></div>
          <div style="flex:1;background:#818cf8;height:55%;border-radius:4px 4px 0 0"></div>
        </div>
      </div>`,
    ),
  },
  {
    id: "report-export",
    category: "report",
    title: "ส่งออก CSV / PDF",
    when: "เอาข้อมูลไปใช้ต่อใน Excel หรือพิมพ์เป็นเอกสาร",
    promptSnippet: "มีปุ่มส่งออกข้อมูลเป็น CSV (และพิมพ์เป็น PDF ผ่านหน้าพิมพ์)",
    previewHtml: doc(
      `<div style="display:flex;gap:8px;max-width:280px">
        <button style="flex:1;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-weight:600;color:#16a34a">⬇️ CSV</button>
        <button style="flex:1;background:#fff;border:1px solid #cbd5e1;border-radius:10px;padding:10px;font-weight:600;color:#dc2626">🖨 PDF</button>
      </div>`,
    ),
  },
  {
    id: "report-mailmerge",
    category: "report",
    title: "สร้างเอกสารจากเทมเพลต (Doc→PDF)",
    when: "ออกใบรับรอง/ใบเสนอราคา/สัญญา จากเทมเพลตแล้วได้ PDF อัตโนมัติ",
    promptSnippet: "สร้างเอกสารจากเทมเพลต Google Doc โดยแทนค่าตัวแปร แล้วแปลงเป็น PDF (mail-merge) เช่นใบรับรอง/ใบเสนอราคา",
    previewHtml: doc(
      `<div style="display:flex;align-items:center;gap:10px;font-size:13px;max-width:300px">
        <div style="border:1px solid #e2e8f0;border-radius:8px;padding:10px;text-align:center;background:#fff">📄<br><span style="font-size:11px;color:#64748b">เทมเพลต</span></div>
        <span style="color:#94a3b8">+ ข้อมูล →</span>
        <div style="border:1px solid #fecaca;border-radius:8px;padding:10px;text-align:center;background:#fff;color:#dc2626">📕<br><span style="font-size:11px">PDF</span></div>
      </div>`,
    ),
  },
  // ── media ──
  {
    id: "media-photo",
    category: "media",
    title: "ถ่ายรูปนิ่งจากกล้อง",
    when: "ถ่ายรูปของส่ง/หลักฐาน/สินค้า แล้วเก็บไว้ (รูปเดี่ยว ไม่ใช่กล้องสด)",
    promptSnippet: "ถ่ายรูปนิ่งด้วย <input type=file accept=image capture> แล้วอัปโหลดเก็บใน Drive — หมายเหตุ: กล้องสด/สแกนต่อเนื่องทำบน GAS ไม่ได้ (ยกเว้นโปรเจกต์ Proที่เผยแพร่บน GitHub Pages)",
    previewHtml: doc(
      `<div style="border:1px dashed #cbd5e1;border-radius:12px;background:#fff;padding:22px;text-align:center;max-width:240px">
        <div style="font-size:30px">📷</div>
        <button style="margin-top:8px;background:#0f172a;color:#fff;border:0;padding:9px 16px;border-radius:10px;font-weight:600">ถ่ายรูป</button>
      </div>`,
    ),
  },
  {
    id: "media-qrgen",
    category: "media",
    title: "สร้าง QR Code",
    when: "ออก QR ให้ลูกค้าสแกน เช่นลิงก์จอง/เช็คอิน/ติดตามสถานะ",
    promptSnippet: "สร้าง QR code ฝั่ง client ด้วย qrcode.js (จาก CDN)",
    previewHtml: doc(
      `<div style="text-align:center;max-width:200px">
        <div style="width:104px;height:104px;margin:0 auto;background:repeating-linear-gradient(45deg,#0f172a 0 7px,#fff 7px 14px);border-radius:8px"></div>
        <div style="font-size:12px;color:#64748b;margin-top:8px">สแกนเพื่อจอง</div>
      </div>`,
    ),
  },
  {
    id: "media-upload",
    category: "media",
    title: "อัปโหลดไฟล์เข้า Drive",
    when: "แนบสลิป/เอกสาร/รูป เก็บใน Google Drive ของคุณ",
    promptSnippet: "อัปโหลดไฟล์/รูปเข้า Google Drive ด้วย DriveApp (ต้องประกาศ scope auth/drive เพราะ DriveApp ไม่รับ drive.file)",
    previewHtml: doc(
      `<div style="border:1px dashed #cbd5e1;border-radius:12px;background:#fff;padding:20px;text-align:center;max-width:260px;color:#64748b;font-size:13px">
        <div style="font-size:26px">📎</div>ลากไฟล์มาวาง หรือกดเลือก<div style="margin-top:6px;font-size:11px;color:#16a34a">เก็บใน Drive ของคุณเอง</div>
      </div>`,
    ),
  },
  // ── map ──
  {
    id: "map-embed",
    category: "map",
    title: "แผนที่ + ปุ่มนำทาง",
    when: "โชว์ที่ตั้งร้าน/จุดนัด แล้วให้กดนำทางด้วย Google Maps",
    promptSnippet: "ฝังแผนที่ Google Maps ปักหมุดที่อยู่ + ปุ่ม 'นำทาง' เปิด Google Maps directions",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;background:#fff;max-width:280px">
        <div style="height:96px;background:linear-gradient(135deg,#dbeafe,#bbf7d0);position:relative"><span style="position:absolute;top:34px;left:120px;font-size:24px">📍</span></div>
        <div style="padding:10px"><div style="font-weight:700;font-size:13px">ร้านตัดผม สาขาสยาม</div><button style="margin-top:6px;width:100%;background:#2563eb;color:#fff;border:0;padding:8px;border-radius:9px;font-weight:600;font-size:13px">🧭 นำทาง</button></div>
      </div>`,
    ),
  },
  // ── workflow ──
  {
    id: "wf-approval",
    category: "workflow",
    title: "สถานะอนุมัติ",
    when: "งานต้องผ่านการอนุมัติ — รออนุมัติ / อนุมัติ / ปฏิเสธ",
    promptSnippet: "มีสถานะอนุมัติ (รออนุมัติ/อนุมัติ/ปฏิเสธ) เปลี่ยนสถานะได้ + บันทึกผู้อนุมัติ/เวลา",
    previewHtml: doc(
      `<div style="display:flex;flex-direction:column;gap:8px;max-width:260px;font-size:13px">
        <div style="display:flex;justify-content:space-between;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;background:#fff">ใบเบิก #12 <span style="background:#fef9c3;color:#ca8a04;border-radius:999px;padding:2px 10px;font-size:11px">รออนุมัติ</span></div>
        <div style="display:flex;justify-content:space-between;border:1px solid #e2e8f0;border-radius:10px;padding:9px 12px;background:#fff">ใบเบิก #11 <span style="background:#dcfce7;color:#16a34a;border-radius:999px;padding:2px 10px;font-size:11px">อนุมัติ</span></div>
      </div>`,
    ),
  },
  {
    id: "wf-stepper",
    category: "workflow",
    title: "ขั้นตอน (Stepper)",
    when: "งานมีหลายขั้น อยากให้เห็นว่าถึงไหนแล้ว",
    promptSnippet: "แสดงขั้นตอนการทำงานแบบ stepper/timeline (ขั้นที่ทำแล้ว/กำลังทำ/ยังไม่ถึง)",
    previewHtml: doc(
      `<div style="display:flex;align-items:center;gap:4px;max-width:300px;font-size:11px;color:#64748b">
        <div style="text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#16a34a;color:#fff;margin:0 auto;line-height:24px">✓</div>รับเรื่อง</div>
        <div style="flex:1;height:2px;background:#16a34a"></div>
        <div style="text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#6366f1;color:#fff;margin:0 auto;line-height:24px">2</div>ดำเนินการ</div>
        <div style="flex:1;height:2px;background:#e2e8f0"></div>
        <div style="text-align:center"><div style="width:24px;height:24px;border-radius:50%;background:#e2e8f0;color:#94a3b8;margin:0 auto;line-height:24px">3</div>เสร็จ</div>
      </div>`,
    ),
  },
  // ── admin ──
  {
    id: "admin-settings",
    category: "admin",
    title: "หน้าตั้งค่า",
    when: "ปรับค่าระบบได้เอง เช่น เปิด/ปิดฟีเจอร์ ข้อความ ราคา",
    promptSnippet: "มีหน้าตั้งค่า อ่าน/เขียนค่าใน config (PropertiesService หรือชีต settings)",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px;max-width:260px;font-size:13px">
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0">แจ้งเตือน LINE <span style="width:34px;height:18px;background:#16a34a;border-radius:999px;position:relative"><span style="position:absolute;right:2px;top:2px;width:14px;height:14px;background:#fff;border-radius:50%"></span></span></div>
        <div style="display:flex;justify-content:space-between;align-items:center;padding:6px 0;border-top:1px solid #eef2f7">รับคิวออนไลน์ <span style="width:34px;height:18px;background:#cbd5e1;border-radius:999px;position:relative"><span style="position:absolute;left:2px;top:2px;width:14px;height:14px;background:#fff;border-radius:50%"></span></span></div>
      </div>`,
    ),
  },
  {
    id: "admin-users",
    category: "admin",
    title: "จัดการผู้ใช้ & สิทธิ์",
    when: "มีหลายคนใช้งาน อยากกำหนดว่าใครทำอะไรได้บ้าง",
    promptSnippet: "หน้าจัดการผู้ใช้และสิทธิ์ (role) — เพิ่ม/ลบผู้ใช้, กำหนด role แอดมิน/พนักงาน",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;overflow:hidden;max-width:280px;font-size:13px">
        <div style="display:flex;justify-content:space-between;padding:9px 12px">สมชาย <span style="background:#ede9fe;color:#6d28d9;border-radius:999px;padding:2px 10px;font-size:11px">แอดมิน</span></div>
        <div style="display:flex;justify-content:space-between;padding:9px 12px;border-top:1px solid #eef2f7">มาลี <span style="background:#f1f5f9;color:#475569;border-radius:999px;padding:2px 10px;font-size:11px">พนักงาน</span></div>
      </div>`,
    ),
  },
  // ── auth ──
  {
    id: "auth-login",
    category: "auth",
    title: "เข้าสู่ระบบ (ปลอดภัย)",
    when: "ผู้ใช้ปลายทางไม่มี/ไม่อยากใช้บัญชี Google — ใช้ user/password ของระบบเอง",
    promptSnippet: "ระบบเข้าสู่ระบบ username/password เก็บในชีตแบบปลอดภัย (per-user salt + pepper ใน PropertiesService + วน hash หลายพันรอบ ไม่เก็บ plaintext, rate-limit) — ตามกฎ secure-custom-auth",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;max-width:250px">
        <div style="font-weight:700;text-align:center;margin-bottom:10px">เข้าสู่ระบบ</div>
        <input placeholder="ชื่อผู้ใช้" style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px;margin-bottom:8px">
        <input type="password" value="••••••" style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px;margin-bottom:12px">
        <button style="width:100%;background:#6366f1;color:#fff;border:0;padding:10px;border-radius:10px;font-weight:600">เข้าสู่ระบบ</button>
      </div>`,
    ),
  },
  {
    id: "auth-remember",
    category: "auth",
    title: "จำการเข้าสู่ระบบ",
    when: "ไม่ต้องล็อกอินใหม่ทุกครั้ง — สะดวกแต่ยังปลอดภัย",
    promptSnippet: "จำการเข้าสู่ระบบด้วย session token แบบสุ่ม (เก็บ hash + วันหมดอายุ + เพิกถอนได้ — ไม่เก็บรหัสผ่านใน localStorage)",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:16px;max-width:250px;font-size:13px">
        <label style="display:flex;align-items:center;gap:8px"><input type="checkbox" checked> จดจำฉันไว้</label>
        <div style="color:#16a34a;font-size:12px;margin-top:8px">✓ ปลอดภัย — เก็บ token ไม่ใช่รหัสผ่าน</div>
      </div>`,
    ),
  },
  {
    id: "auth-roleview",
    category: "auth",
    title: "หน้าตามสิทธิ์ (SPA)",
    when: "คนละ role เห็นเมนู/หน้าไม่เหมือนกัน (แอดมินเห็นมากกว่าพนักงาน)",
    promptSnippet: "ทำเป็นเว็บแอป SPA (Alpine.js) แสดงเมนู/หน้าตาม role สลับหน้าฝั่ง client ใน doGet เดียว",
    previewHtml: doc(
      `<div style="max-width:280px;font-size:13px">
        <div style="margin-bottom:8px">บทบาท:
          <select id="r" style="border:1px solid #cbd5e1;border-radius:7px;padding:4px 8px"><option value="a">แอดมิน</option><option value="s">พนักงาน</option></select>
        </div>
        <div id="m" style="display:flex;gap:6px;flex-wrap:wrap"></div>
      </div>
      <script>var menus={a:['สรุป','รายการ','ผู้ใช้','ตั้งค่า'],s:['สรุป','รายการ']};function r(){var v=document.getElementById('r').value;document.getElementById('m').innerHTML=menus[v].map(function(x){return '<span style="background:#eef2ff;color:#4338ca;border-radius:8px;padding:5px 10px">'+x+'</span>';}).join('');}document.getElementById('r').onchange=r;r();</script>`,
    ),
  },
  {
    id: "auth-single",
    category: "auth",
    title: "หน้าเดียว (เรียบง่าย)",
    when: "งานเล็กๆ ไม่ต้องมีเมนู/หลายหน้า — ฟอร์มหรือแดชบอร์ดหน้าเดียวจบ",
    promptSnippet: "ทำเป็นเว็บแอปหน้าเดียว (single view) เรียบง่าย ไม่มี routing",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:18px;max-width:240px;text-align:center">
        <div style="font-weight:700">บันทึกยอดขาย</div>
        <input placeholder="จำนวนเงิน" style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px;margin:10px 0">
        <button style="width:100%;background:#10b981;color:#fff;border:0;padding:10px;border-radius:10px;font-weight:600">บันทึก</button>
      </div>`,
    ),
  },
  // ── robust ──
  {
    id: "robust-pagination",
    category: "robust",
    title: "โหลดข้อมูลทีละหน้า",
    when: "ข้อมูลในชีตเยอะ (พันแถวขึ้นไป) — กันแอปค้าง/โหลดช้า",
    promptSnippet: "โหลดข้อมูลตารางแบบทีละหน้า (pagination/lazy-load) ฝั่งเซิร์ฟเวอร์ ไม่ getValues ทั้งหมดรวดเดียว",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:12px;max-width:260px;text-align:center;font-size:13px">
        <div style="color:#64748b">แสดง 1–20 จาก 1,240 รายการ</div>
        <div style="margin-top:8px;display:flex;justify-content:center;gap:6px">
          <span style="border:1px solid #e2e8f0;border-radius:7px;padding:4px 10px">«</span>
          <span style="background:#6366f1;color:#fff;border-radius:7px;padding:4px 10px">1</span>
          <span style="border:1px solid #e2e8f0;border-radius:7px;padding:4px 10px">2</span>
          <span style="border:1px solid #e2e8f0;border-radius:7px;padding:4px 10px">3</span>
          <span style="border:1px solid #e2e8f0;border-radius:7px;padding:4px 10px">»</span>
        </div>
      </div>`,
    ),
  },
  {
    id: "robust-autosave",
    category: "robust",
    title: "บันทึกอัตโนมัติ",
    when: "ฟอร์มยาว/แก้บ่อย — ไม่อยากให้ผู้ใช้กดบันทึกเองตลอด",
    promptSnippet: "บันทึกอัตโนมัติแบบ debounced เมื่อผู้ใช้พิมพ์/แก้ (รอหยุดพิมพ์ ~1 วิ แล้วค่อยบันทึก) พร้อมแสดงสถานะ 'บันทึกแล้ว'",
    previewHtml: doc(
      `<div style="border:1px solid #e2e8f0;border-radius:12px;background:#fff;padding:14px;max-width:260px">
        <textarea style="width:100%;border:1px solid #e2e8f0;border-radius:9px;padding:9px;resize:none" rows="2">โน้ตลูกค้า…</textarea>
        <div style="color:#16a34a;font-size:12px;margin-top:6px">✓ บันทึกอัตโนมัติแล้ว</div>
      </div>`,
    ),
  },
  {
    id: "robust-offline",
    category: "robust",
    title: "แจ้งเตือนเน็ตหลุด",
    when: "ใช้งานหน้าร้าน/มือถือที่เน็ตไม่เสถียร — กันข้อมูลหายเงียบ",
    promptSnippet: "ตรวจจับการเชื่อมต่อหลุด (online/offline) แล้วแสดง banner เตือน + กันส่งข้อมูลตอนออฟไลน์",
    previewHtml: doc(
      `<div style="background:#fef2f2;color:#b91c1c;border:1px solid #fecaca;border-radius:10px;padding:10px 12px;font-size:13px;max-width:300px">⚠️ ไม่มีการเชื่อมต่ออินเทอร์เน็ต — ระบบจะบันทึกให้เมื่อกลับมาออนไลน์</div>`,
    ),
  },
];
