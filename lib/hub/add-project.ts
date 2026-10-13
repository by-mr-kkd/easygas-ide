import { LIMITS, newId, type HubDoc, type HubItem } from "./doc.ts";

/**
 * "เพิ่มไปยังฮับ" from the projects list: one published project becomes a link in a hub (the first section).
 * A project already linked (same address, any section) is not added twice. Pure, tested.
 */
export function addProjectItem(
  doc: HubDoc,
  project: { name: string; url: string; deployment: string },
  now: Date = new Date(),
): { doc: HubDoc; already: boolean } {
  const same = (u: string) => u.replace(/\/+$/, "") === project.url.replace(/\/+$/, "");
  if (doc.sections.some((s) => s.items.some((i) => same(i.url)))) return { doc, already: true };
  const count = doc.sections.reduce((n, s) => n + s.items.length, 0);
  if (count >= LIMITS.items) throw new Error(`ฮับนี้มีลิงก์ครบ ${LIMITS.items} ลิงก์แล้ว`);
  const item: HubItem = {
    id: newId(),
    title: project.name.slice(0, LIMITS.itemTitle),
    url: project.url,
    desc: "",
    icon: "i:computer-desktop",
    iconUrl: "",
    color: "",
    badge: "",
    start: "",
    end: "",
    added: now.toISOString(),
    deployment: project.deployment,
  };
  const sections = doc.sections.length ? doc.sections : [{ id: newId(), title: "ลิงก์ทั้งหมด", collapsed: false, items: [] }];
  const [first, ...rest] = sections;
  return { doc: { ...doc, sections: [{ ...first, items: [...first.items, item] }, ...rest] }, already: false };
}
