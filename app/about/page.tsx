import Link from "next/link";
import { ArrowLeftIcon, ArrowTopRightOnSquareIcon } from "@heroicons/react/24/outline";
import pkg from "@/package.json";
import { AppTopBar } from "@/components/AppTopBar";
import { DonateButton } from "@/components/about/DonateButton";
import { FacebookIcon, GitHubIcon } from "@/components/ui/BrandIcons";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import { LINKS } from "@/lib/links";
import { DONATION, normalizePromptPayId } from "@/lib/donate";
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
  const { pack } = await getActivePack();
  // the donate button exists only when a real PromptPay id is configured (lib/donate.ts)
  const canDonate = normalizePromptPayId(DONATION.promptPayId) !== null;

  return (
    <>
      <AppTopBar center={<span className="truncate text-sm font-semibold">เกี่ยวกับ</span>} right={<ThemeToggle />} />

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
          <SectionTitle>แอปนี้คืออะไร</SectionTitle>
          <div className={CARD}>
            <p>
              สร้างเครื่องมือบน Google Apps Script ด้วย AI พิมพ์บอกว่าอยากได้อะไร AI เขียนโค้ดให้ แล้วกดเผยแพร่ขึ้นบัญชี Google
              ของคุณเอง
            </p>
            <p>ใช้ฟรี ทำงานในเครื่องของคุณเอง ไม่มีเซิร์ฟเวอร์กลาง AI และบัญชี Google ก็เป็นของคุณทั้งหมด</p>
          </div>
        </section>

        <section className="mt-8">
          <SectionTitle>ชุมชนและซอร์สโค้ด</SectionTitle>
          <div className={CARD}>
            <p>มีคำถาม อยากดูงานของคนอื่น หรือตามข่าวอัปเดต เข้ากลุ่ม Facebook ได้ ส่วนซอร์สโค้ดและตัวติดตั้งรุ่นใหม่อยู่บน GitHub</p>
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
                ถ้าแอปนี้ช่วยงานคุณได้ จะสนับสนุน {DONATION.recipient} ผ่านพร้อมเพย์ก็ได้ ใส่ยอดแล้วสแกน QR ได้เลย
              </p>
              <DonateButton promptPayId={DONATION.promptPayId} recipient={DONATION.recipient} />
            </div>
          </section>
        )}

        <section className="mt-8">
          <SectionTitle>สัญญาอนุญาตและที่มา</SectionTitle>
          <div className={CARD}>
            <p>
              <b>Apache 2.0 + Commons Clause:</b> ใช้ แก้ไข และแจกต่อได้ รวมถึงใช้ในงานของบริษัท แต่ห้ามขายตัวโปรแกรม
              หรือเปิดเป็นบริการเก็บเงินที่มูลค่ามาจากโปรแกรมนี้
            </p>
            <p>โค้ด Apps Script ที่คุณสร้างด้วยแอปนี้เป็นของคุณ นำไปใช้เชิงพาณิชย์ได้</p>
            <p className="break-words text-muted">
              ชุดกฎที่ AI ใช้: gas-best-practices v{pack.version} (MIT) · เผยแพร่ขึ้น Google ด้วย clasp ของ Google · QR พร้อมเพย์สร้างด้วย
              promptpay-qr และ qrcode (MIT)
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
