import { LessonsPanel } from "@/components/settings/LessonsPanel";
import { RulebookPanel } from "@/components/settings/RulebookPanel";
import { SettingsShell, pickFrom, pickSection, type KnowledgeSection } from "@/components/settings/SettingsShell";
import { readLessons } from "@/lib/lessons-store";
import { getActivePack } from "@/lib/rulebook/store";
import { lessonIssueBaseUrl, suggestRuleUrl } from "@/lib/rulebook/trust";
import { getRulebookStatus } from "@/lib/rulebook/update";
import { getSetupStatus } from "@/lib/setup-status";

export const metadata = { title: "สิ่งที่ AI เรียนรู้ — EasyGAS IDE" };

const SECTIONS: readonly KnowledgeSection[] = ["rules", "lessons"];

const HEAD: Record<KnowledgeSection, { title: string; hint: string }> = {
  rules: {
    title: "ชุดกฎที่ AI ใช้เขียนโค้ด",
    hint: "กฎที่ AI ต้องทำตามทุกครั้งที่เขียนโค้ดให้คุณ เพื่อให้เครื่องมือที่ได้ใช้งานได้จริงบน Google Apps Script",
  },
  lessons: {
    title: "บทเรียนของฉัน",
    hint: "ข้อผิดพลาดที่เคยเกิดในโปรเจกต์ของคุณ เก็บไว้ในเครื่องนี้ และ AI จะได้รับเฉพาะข้อที่คุณกดเก็บไว้ เพื่อไม่ให้พลาดซ้ำในโปรเจกต์ต่อไป",
  },
};

/** The lessons section's data (local files only). */
async function loadLessonsSection() {
  const [book, active] = await Promise.all([readLessons(), getActivePack()]);
  return {
    // "seen" = counted once by the app, not yet worth the user's attention
    lessons: book.lessons.filter((l) => l.status !== "seen"),
    cards: active.pack.rules.map((r) => ({ id: r.id, title: r.title })),
  };
}

/** What the AI has been taught: the rulebook pack and the user's own lessons (same shell as /settings). */
export default async function KnowledgePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const sp = await searchParams;
  const section = pickSection(sp, SECTIONS, "rules");
  // nothing here touches the network: the rulebook check runs from RulebookPanel's client effect
  const [status, rulebook, lessons] = await Promise.all([
    getSetupStatus(),
    section === "rules" ? getRulebookStatus() : null,
    section === "lessons" ? loadLessonsSection() : null,
  ]);

  return (
    <SettingsShell current={section} from={pickFrom(sp)} status={status} title={HEAD[section].title} hint={HEAD[section].hint}>
      {rulebook && <RulebookPanel status={rulebook} suggestUrl={suggestRuleUrl()} />}
      {lessons && <LessonsPanel lessons={lessons.lessons} cards={lessons.cards} shareBaseUrl={lessonIssueBaseUrl()} />}
    </SettingsShell>
  );
}
