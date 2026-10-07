import { StyleShopping } from "@/components/style/StyleShopping";
import { getProject } from "@/lib/projects";
import { STYLE_CATALOG, STYLE_CATEGORIES } from "@/lib/style-catalog";

export const metadata = {
  title: "เลือกสไตล์ — EasyGAS IDE",
  description:
    "เดินเลือกองค์ประกอบหน้าตาเว็บแอป (เมนู ปุ่ม ป๊อปอัป ตาราง พร้อมเพย์ ฯลฯ) กดดูตัวอย่างได้ แล้วรวมเป็นคำสั่งให้ AI สร้างเครื่องมือบน Google Apps Script ให้ทันที",
};

// Browse UI building blocks, then bundle the picks into the kickoff prompt of a new project — or,
// with ?project=<id> (the IDE's empty-project screen links here), of that existing project.
export default async function StyleShoppingPage({
  searchParams,
}: {
  searchParams: Promise<{ project?: string | string[] }>;
}) {
  const { project } = await searchParams;
  // an unknown or malformed id is ignored: the page just works in "new project" mode
  const target = typeof project === "string" ? await getProject(project) : null;

  return (
    <StyleShopping
      catalog={STYLE_CATALOG}
      categories={STYLE_CATEGORIES}
      targetProject={target ? { id: target.id, name: target.name } : undefined}
    />
  );
}
