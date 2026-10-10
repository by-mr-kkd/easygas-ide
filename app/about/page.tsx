import Link from "next/link";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import pkg from "@/package.json";
import { AppTopBar } from "@/components/AppTopBar";
import { DonateButton } from "@/components/about/DonateButton";
import { FacebookIcon, GitHubIcon } from "@/components/ui/BrandIcons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LINKS } from "@/lib/links";
import { DONATION, normalizePromptPayId } from "@/lib/donate";
import { premiumStatus } from "@/lib/premium/status";
import { getProject } from "@/lib/projects";
import { getActivePack } from "@/lib/rulebook/store";

export const metadata = { title: "เกี่ยวกับ — EasyGAS IDE" };

const CARD = "card space-y-2 px-4 py-4 text-sm text-fg";

function SectionTitle({ children }: { children: React.ReactNode }) {
  return <h2 className="mb-2 text-sm font-semibold text-fg">{children}</h2>;
}

export default async function AboutPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const { from } = await searchParams;
  // reached from a project's settings (?from=<projectId>): "back" returns to that project
  const project = typeof from === "string" && from.length <= 100 ? await getProject(from).catch(() => null) : null;
  const [{ pack }, premium] = await Promise.all([getActivePack(), premiumStatus().catch(() => ({ active: false }))]);
  // the donate button exists only when a real PromptPay id is configured (lib/donate.ts)
  const canDonate = normalizePromptPayId(DONATION.promptPayId) !== null;

  return (
    <>
      <AppTopBar pro={premium.active} center={<span className="truncate text-sm font-semibold">เกี่ยวกับ</span>} right={<ThemeToggle />} />

      <main className="mx-auto w-full max-w-2xl px-4 sm:px-6 py-6">
        <Link href={project ? `/projects/${project.id}` : "/projects"} className="btn btn-ghost btn-sm max-w-full">
          <ArrowLeftIcon className="h-4 w-4 shrink-0" />
          <span className="truncate">{project ? `กลับไปที่โปรเจกต์ ${project.name}` : "กลับไปหน้าโปรเจกต์"}</span>
        </Link>

        <h1 className="mt-4 text-xl font-semibold">EasyGAS IDE</h1>
        <p className="hint mt-1">
          เวอร์ชัน {pkg.version} · Powered by <span className="font-semibold text-fg">Mr.KKD</span>
        </p>

        <section className="mt-6">
          <SectionTitle>เกี่ยวกับแอป</SectionTitle>
          <div className={CARD}>
            <p>
              EasyGAS IDE ช่วยให้คุณสร้างเครื่องมือบน Google Apps Script ได้โดยไม่ต้องเขียนโค้ดเอง เพียงอธิบายสิ่งที่ต้องการ
              AI จะเขียนโค้ดให้ จากนั้นกดเผยแพร่ขึ้นบัญชี Google ของคุณได้ทันที
            </p>
            <p>โปรเจกต์และโค้ดทั้งหมดเก็บอยู่ในเครื่องของคุณ บัญชี AI และบัญชี Google ก็เป็นของคุณเอง โปรแกรมนี้เปิดให้ใช้ฟรี</p>
          </div>
        </section>

        <section className="mt-8">
          <SectionTitle>ชุมชนและซอร์สโค้ด</SectionTitle>
          <div className={CARD}>
            <p>
              หากมีคำถาม อยากดูผลงานของผู้ใช้คนอื่น หรือติดตามข่าวอัปเดต ขอเชิญเข้าร่วมกลุ่ม Facebook
              ส่วนซอร์สโค้ดและตัวติดตั้งเวอร์ชันล่าสุดดาวน์โหลดได้ที่ GitHub
            </p>
            <div className="flex flex-wrap gap-2 pt-1">
              <a href={LINKS.facebookGroup} target="_blank" rel="noopener noreferrer" className="btn btn-soft tone-info">
                <FacebookIcon className="h-4 w-4 text-[#1877F2]" />
                กลุ่ม Facebook
                <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-70" />
              </a>
              <a href={LINKS.repo} target="_blank" rel="noopener noreferrer" className="btn btn-secondary">
                <GitHubIcon className="h-4 w-4" />
                เปิด repo บน GitHub
                <ArrowTopRightOnSquareIcon className="h-4 w-4 opacity-70" />
              </a>
            </div>
          </div>
        </section>

        {canDonate && (
          <section className="mt-8">
            <SectionTitle>สนับสนุนผู้พัฒนา</SectionTitle>
            <div className={CARD}>
              <p className="mb-3">
                หากแอปนี้ช่วยให้งานของคุณง่ายขึ้น สามารถสนับสนุน {DONATION.recipient} ผ่านพร้อมเพย์ได้ ระบุจำนวนเงินแล้วสแกน QR ได้เลย
              </p>
              <DonateButton promptPayId={DONATION.promptPayId} recipient={DONATION.recipient} />
            </div>
          </section>
        )}

        <section className="mt-8">
          <SectionTitle>สัญญาอนุญาตและเครดิต</SectionTitle>
          <div className={CARD}>
            <p>
              <b>Apache 2.0 + Commons Clause:</b> ใช้งาน แก้ไข และแจกจ่ายต่อได้ รวมถึงใช้ภายในบริษัท แต่ไม่อนุญาตให้นำตัวโปรแกรมไปขาย
              หรือเปิดเป็นบริการเก็บค่าใช้จ่ายที่มูลค่าหลักมาจากโปรแกรมนี้
            </p>
            <p>โค้ด Apps Script ที่คุณสร้างด้วยแอปนี้เป็นของคุณ นำไปใช้เชิงพาณิชย์ได้เต็มที่</p>
            <p className="break-words text-muted">
              ชุดกฎที่ AI ใช้อ้างอิง: gas-best-practices v{pack.version} (MIT) · การเผยแพร่ขึ้น Google ใช้ clasp ของ Google · QR
              พร้อมเพย์สร้างด้วย promptpay-qr และ qrcode (MIT)
            </p>
          </div>
        </section>

        <p className="hint mt-8">
          <Link href={project ? `/settings?from=${encodeURIComponent(project.id)}` : "/settings"} className="link">
            ตั้งค่า
          </Link>
        </p>
      </main>
    </>
  );
}
