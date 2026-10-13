"use client";

import { Portal } from "@/components/ui/Portal";
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  ArrowsPointingOutIcon,
  CheckIcon,
  ComputerDesktopIcon,
  DevicePhoneMobileIcon,
  GlobeAltIcon,
  LightBulbIcon,
  LockClosedIcon,
  PaperAirplaneIcon,
  SparklesIcon,
  SwatchIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { saveProFeaturesAction, setProjectUseAction } from "@/app/projects/actions";
import { pagesStateAction, type PagesState } from "@/app/pages/actions";
import { useRouter } from "next/navigation";
import { USE_LIST, allowedUses, kindChangeMessage, kindOfUse, type ProjectUse } from "@/lib/project-use";
import { UpgradeDialog } from "@/components/premium/UpgradeDialog";
import { useProjectStore } from "@/store/useProjectStore";
import { NO_PRO_FEATURES, PRO_FEATURE_LIST, anyProFeature, proFeatureLines, type ProFeatures } from "@/lib/pro-features";
import { STYLE_CATALOG, STYLE_CATEGORIES, type StyleItem } from "@/lib/style-catalog";
import { RESTYLE_LEAD, START_EXAMPLES, composeMockup, isVisualCategory, stylePromptLines } from "@/lib/style-mockup";

/** short labels for the jump row (the section headings keep the catalog's full titles) */
const SHORT: Record<string, string> = {
  nav: "เมนู",
  buttons: "ปุ่ม",
  feedback: "ป๊อปอัป",
  theme: "ธีม",
  data: "ข้อมูล",
  forms: "ฟอร์ม",
  search: "ค้นหา",
  thai: "ธุรกิจไทย",
  notify: "แจ้งเตือน",
  auto: "ตั้งเวลา",
  report: "รายงาน",
  media: "กล้อง · QR",
  map: "แผนที่",
  workflow: "เวิร์กโฟลว์",
  admin: "แอดมิน",
  auth: "ล็อกอิน",
  robust: "ความเสถียร",
};

const VISUAL = STYLE_CATEGORIES.filter((c) => isVisualCategory(c.id));
const ABILITY = STYLE_CATEGORIES.filter((c) => !isVisualCategory(c.id));

/**
 * The code screen's "สไตล์" view (beside the chat). What a new project starts from, and where its look is
 * chosen later:
 *   - "ใช้งานผ่านอะไร" (lib/project-use.ts): Google link / in a Sheet / GitHub Pages with the Pro extras — picked
 *     when the project was made, changeable here until Google holds the script (free installs can look at and
 *     tick the Pro part, the mock-up follows, nothing Pro is stored or sent)
 *   - a mock-up put together from the picks right here, without the AI (lib/style-mockup.ts)
 *   - example systems, and the whole style catalog on one scrolling list
 * Picks go to the chat box as text ("ใส่ในช่องแชท"); the chat's "สร้างเดโม่ให้ดูก่อน" also takes them.
 */
export function StylePane({
  projectId,
  initialUse,
  kindLock,
  initialProFeatures,
  empty,
}: {
  projectId: string;
  /** "ใช้งานผ่านอะไร" as stored (lib/project-use.ts) */
  initialUse: ProjectUse;
  /** why standalone ↔ in a Sheet can no longer change (kindLockReason); null = it still can */
  kindLock: string | null;
  initialProFeatures: ProFeatures;
  /** the project has no files yet: show the example systems */
  empty: boolean;
}) {
  const picks = useProjectStore((s) => s.stylePicks);
  const setPicks = useProjectStore((s) => s.setStylePicks);
  const look = useProjectStore((s) => s.look);
  const setDraft = useProjectStore((s) => s.setDraft);
  const runAgent = useProjectStore((s) => s.runAgent);
  const requestAction = useProjectStore((s) => s.requestAction);

  const [device, setDevice] = useState<"desktop" | "mobile">("desktop");
  const [expanded, setExpanded] = useState(false);
  const [pages, setPages] = useState<PagesState | null>(null);
  const router = useRouter();
  const [use, setUse] = useState<ProjectUse>(initialUse);
  const [features, setFeatures] = useState<ProFeatures>(initialProFeatures);
  const [saved, setSaved] = useState<{ use: ProjectUse; features: ProFeatures }>({ use: initialUse, features: initialProFeatures });
  const [note, setNote] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [hostError, setHostError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  // a project with code already answered "ใช้งานผ่านอะไร" at creation: one line until the user asks to change it
  // (`empty` is read live: the pane can mount a moment before the project's files reach the store)
  const [useOpen, setUseOpen] = useState(false);
  const [activeCat, setActiveCat] = useState(STYLE_CATEGORIES[0]?.id ?? "");
  const listRef = useRef<HTMLDivElement>(null);

  // Pro + GitHub status: asked once from an effect (never at render)
  useEffect(() => {
    let live = true;
    pagesStateAction(projectId)
      .then((s) => {
        if (live && s) setPages(s);
      })
      .catch(() => {});
    return () => {
      live = false;
    };
  }, [projectId]);

  const pro = !!pages?.premium;
  const githubOn = use === "github";
  // what the mock-up shows: the ticks, whether or not they can be used yet (that is the point for a free user)
  const mockPro = githubOn ? { pwa: features.pwa, notify: features.notify } : {};
  // what may go to the AI: only a Pro project already saved on GitHub Pages
  const sendablePro = pro && saved.use === "github" ? saved.features : NO_PRO_FEATURES;
  const dirtyUse = saved.use !== use || (githubOn && JSON.stringify(saved.features) !== JSON.stringify(features));
  // ticked Pro extras that will not reach the AI yet: a free install (locked), or a Pro one that has not pressed
  // "ใช้กับโปรเจกต์นี้" (only what is saved on the project is sent)
  const unsentPro: "locked" | "unsaved" | null = githubOn && anyProFeature(features) ? (!pro ? "locked" : dirtyUse ? "unsaved" : null) : null;

  const items = useMemo(() => picks.map((id) => STYLE_CATALOG.find((c) => c.id === id)).filter((x): x is StyleItem => !!x), [picks]);
  const counts = useMemo(() => {
    const out: Record<string, number> = {};
    for (const i of items) out[i.category] = (out[i.category] ?? 0) + 1;
    return out;
  }, [items]);

  const html = useMemo(
    () => composeMockup({ picks, catalog: STYLE_CATALOG, look: look ?? undefined, device, pro: mockPro }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [picks, look, device, mockPro.pwa, mockPro.notify],
  );

  function toggle(id: string) {
    const item = STYLE_CATALOG.find((c) => c.id === id);
    if (!item) return;
    if (picks.includes(id)) setPicks(picks.filter((p) => p !== id));
    // one navigation layout at a time: a new one replaces the old
    else if (item.category === "nav") setPicks([...picks.filter((p) => !p.startsWith("nav-")), id]);
    else setPicks([...picks, id]);
  }

  function jump(cat: string) {
    setActiveCat(cat);
    listRef.current?.querySelector<HTMLElement>(`[data-cat="${cat}"]`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // the section under the sticky chip row is the current one
  function onScroll() {
    const box = listRef.current;
    if (!box) return;
    const line = box.getBoundingClientRect().top + 130;
    let current = activeCat;
    for (const el of box.querySelectorAll<HTMLElement>("[data-cat]")) if (el.getBoundingClientRect().top <= line) current = el.dataset.cat ?? current;
    if (current !== activeCat) setActiveCat(current);
  }

  const extraText = () => [stylePromptLines(items), proFeatureLines(sendablePro)].filter(Boolean).join("\n\n");

  // an empty project: the picks join the idea in the chat box. A project with code: the AI restyles it right away
  // (the one action of this pane, so it says what it does and does it)
  function toChat() {
    const text = extraText();
    if (!text) return;
    if (empty) setDraft({ text, mode: "append" });
    else runAgent("send", `${RESTYLE_LEAD}

${text}`);
  }

  async function saveUse() {
    setSaving(true);
    setHostError(null);
    setNote(null);
    try {
      if (use !== saved.use) {
        const r = await setProjectUseAction(projectId, use);
        if (!r.ok) return setHostError(r.error);
        // code written for the other kind opens its sheet the other way: hand the AI the fix, ready to send
        if (r.kindChanged && !empty) {
          setDraft({ text: kindChangeMessage(kindOfUse(use)), mode: "replace" });
          setNote("เปลี่ยนแล้ว ในช่องแชทมีข้อความให้ AI แก้ส่วนที่เปิดชีตให้ตรงแบบใหม่ ตรวจแล้วกดส่งได้เลย");
        }
      }
      if (use === "github") {
        const f = await saveProFeaturesAction(projectId, features);
        if (!f.ok) return setHostError(f.error);
      }
      setSaved({ use, features });
      // the badge beside the project name and the chat's rules follow the stored kind
      router.refresh();
    } catch {
      setHostError("บันทึกไม่สำเร็จ ลองอีกครั้ง");
    } finally {
      setSaving(false);
    }
  }

  const deviceSwitch = (
    <div className="seg" role="group" aria-label="ขนาดจอ">
      <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} className="seg-item h-7 text-xs">
        <ComputerDesktopIcon className="h-3.5 w-3.5" />
        จอใหญ่
      </button>
      <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} className="seg-item h-7 text-xs">
        <DevicePhoneMobileIcon className="h-3.5 w-3.5" />
        มือถือ
      </button>
    </div>
  );

  // Two columns: pick on the left (one scroll), the result on the right (always in view, actions under it).
  // A narrow window stacks them and the whole pane scrolls.
  return (
    <div className="flex h-full min-h-0 w-full flex-col overflow-y-auto bg-main lg:flex-row lg:overflow-hidden">
      {/* LEFT — what to pick */}
      <div ref={listRef} onScroll={onScroll} className="flex w-full shrink-0 flex-col gap-3 border-line px-3 py-3 lg:min-h-0 lg:w-[420px] lg:overflow-y-auto lg:border-r xl:w-[460px]">
        {empty && (
          <div>
            <h2 className="text-base font-semibold">เริ่มต้นโปรเจกต์นี้</h2>
            <p className="hint text-xs">เลือกแบบที่ใช้งาน แล้วหยิบตัวอย่างหรือสไตล์ ดูผลทางขวาทันที พอ AI เขียนไฟล์แรกเสร็จ ตรงนี้จะสลับเป็นพรีวิวเอง</p>
          </div>
        )}

        {!empty && !useOpen && !dirtyUse && !note && !hostError ? (
          <div className="flex items-center gap-2 rounded-lg border border-line px-3 py-2 text-[13px]">
            <GlobeAltIcon className="h-4 w-4 shrink-0 text-muted" aria-hidden />
            <span className="text-muted">ใช้งานผ่าน</span>
            <b className="min-w-0 truncate font-semibold">{USE_LIST.find((u) => u.id === saved.use)?.label}</b>
            {saved.use === "github" && <span className="pro-badge">PRO</span>}
            <span className="flex-1" />
            <button type="button" onClick={() => setUseOpen(true)} className="btn btn-ghost btn-sm shrink-0">
              เปลี่ยน
            </button>
          </div>
        ) : (
        <UseCard
          pages={pages}
          use={use}
          savedUse={saved.use}
          allowed={allowedUses(saved.use, kindLock)}
          kindLock={kindLock}
          empty={empty}
          onUse={setUse}
          features={features}
          onFeatures={setFeatures}
          dirty={dirtyUse}
          saving={saving}
          error={hostError}
          note={note}
          onSave={() => void saveUse()}
          onUpgrade={() => setUpgradeOpen(true)}
          projectId={projectId}
        />
        )}

        {empty && (
          <section aria-label="ตัวอย่างระบบ">
            <p className="mb-1.5 flex items-center gap-1 text-[13px] font-semibold">
              <LightBulbIcon className="h-4 w-4 text-accent-text" aria-hidden />
              ตัวอย่างระบบ
              <span className="hint text-xs font-normal">กดชื่อ = ใส่ในแชท · ลูกศร = ส่งเลย</span>
            </p>
            <div className="flex flex-wrap gap-1.5">
              {START_EXAMPLES.map((ex) => (
                <span key={ex.label} className="inline-flex items-center rounded-full border border-line-strong bg-surface pl-3 pr-0.5">
                  <button type="button" onClick={() => setDraft({ text: ex.text, mode: "replace" })} title={`ใส่ในช่องแชท: ${ex.text}`} className="h-8 text-[13px]">
                    {ex.label}
                  </button>
                  <button
                    type="button"
                    onClick={() => runAgent("send", ex.text)}
                    aria-label={`ส่งตัวอย่าง ${ex.label} ให้ AI เลย`}
                    title="ส่งให้ AI เลย"
                    className="ml-1 grid h-7 w-7 place-items-center rounded-full bg-accent-soft text-accent-text transition hover:bg-accent hover:text-white"
                  >
                    <PaperAirplaneIcon className="h-3.5 w-3.5" />
                  </button>
                </span>
              ))}
            </div>
          </section>
        )}

        {/* the whole catalog; the chips stay on top of this column and jump */}
        <section aria-labelledby="pick-title" className="flex flex-col gap-3">
          <div className="sticky -top-3 z-10 -mx-3 border-b border-line bg-main px-3 pb-2 pt-3">
            <h3 id="pick-title" className="mb-1.5 text-[13px] font-semibold">
              เลือกสไตล์และองค์ประกอบ
            </h3>
            {/* two labelled groups: what it looks like, what it can do */}
            <div className="grid grid-cols-[4.75rem_minmax(0,1fr)] items-start gap-x-2 gap-y-1.5">
              <span className="pt-1 text-[11.5px] font-semibold text-muted">หน้าตา</span>
              <div className="flex flex-wrap gap-1">
                {VISUAL.map((c) => (
                  <JumpChip key={c.id} label={SHORT[c.id] ?? c.title} count={counts[c.id]} on={activeCat === c.id} onClick={() => jump(c.id)} />
                ))}
              </div>
              <span className="pt-1 text-[11.5px] font-semibold text-muted">ความสามารถ</span>
              <div className="flex flex-wrap gap-1">
                {ABILITY.map((c) => (
                  <JumpChip key={c.id} label={SHORT[c.id] ?? c.title} count={counts[c.id]} on={activeCat === c.id} onClick={() => jump(c.id)} />
                ))}
              </div>
            </div>
          </div>
          {VISUAL.map((c) => (
            <div key={c.id} data-cat={c.id} className="scroll-mt-28">
              <p className="text-[13px] font-semibold">{c.title}</p>
              <p className="hint mb-1.5 text-xs">{c.hint}</p>
              <div className="grid grid-cols-2 gap-2">
                {STYLE_CATALOG.filter((i) => i.category === c.id).map((i) => (
                  <PickCard key={i.id} item={i} on={picks.includes(i.id)} onToggle={() => toggle(i.id)} />
                ))}
              </div>
            </div>
          ))}
          {ABILITY.map((c) => (
            <div key={c.id} data-cat={c.id} className="scroll-mt-28">
              <p className="text-[13px] font-semibold">{c.title}</p>
              <p className="hint mb-1.5 text-xs">{c.hint}</p>
              <div className="flex flex-wrap gap-1.5">
                {STYLE_CATALOG.filter((i) => i.category === c.id).map((i) => {
                  const on = picks.includes(i.id);
                  return (
                    <button
                      key={i.id}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggle(i.id)}
                      title={i.when}
                      className={`inline-flex h-8 items-center gap-1 rounded-full border px-3 text-[13px] transition ${
                        on ? "border-accent bg-accent-soft font-semibold text-accent-text" : "border-line-strong bg-surface hover:border-accent"
                      }`}
                    >
                      {on && <CheckIcon className="h-3.5 w-3.5" />}
                      {i.title}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
          <p className="hint pb-2 text-xs">
            ไลบรารี ฟอนต์ และกล่องแจ้งเตือนที่ AI ใช้ ตั้งได้ที่{" "}
            <button type="button" className="link" onClick={() => requestAction("style")}>
              <SwatchIcon className="mr-0.5 inline h-3.5 w-3.5" />
              ไลบรารีและฟอนต์
            </button>
          </p>
        </section>

        {/* the pane's one action, right under what was picked (sticky, so it is never off screen) */}
        <div className="sticky -bottom-3 z-10 -mx-3 mt-auto flex flex-col gap-1.5 border-t border-line bg-main px-3 pb-3 pt-2.5">
          <div className="flex items-center gap-2">
            <span className="text-[13px] font-semibold">เลือกแล้ว {items.length} ชิ้น</span>
            <span className="hint min-w-0 flex-1 truncate text-xs" title={items.map((i) => i.title).join(" · ")}>
              {items.length > 0 ? items.map((i) => i.title).join(" · ") : "กดเลือกจากรายการด้านบน ตัวอย่างทางขวาเปลี่ยนตาม"}
            </span>
            {items.length > 0 && (
              <button type="button" onClick={() => setPicks([])} className="btn btn-ghost btn-sm shrink-0">
                ล้าง
              </button>
            )}
          </div>
          {unsentPro === "locked" && (
            <span className="flex items-center gap-1 text-xs text-warn-text" title="GitHub Pages และองค์ประกอบเสริมใช้ได้ใน Pro">
              <LockClosedIcon className="h-3.5 w-3.5" />
              ส่วน Pro ต้องปลดล็อกก่อน
            </span>
          )}
          {unsentPro === "unsaved" && (
            <button
              type="button"
              onClick={() => void saveUse()}
              disabled={saving}
              title="บันทึก “ใช้งานผ่านอะไร” ก่อน ส่วนเสริม Pro ถึงจะรวมไปในข้อความด้วย"
              className="btn btn-soft tone-warn btn-sm"
            >
              {saving ? "กำลังบันทึก…" : "บันทึกแบบที่เลือกก่อน"}
            </button>
          )}
          <button type="button" onClick={toChat} disabled={!extraText()} className="btn btn-primary w-full">
            <SparklesIcon className="h-4 w-4" />
            {empty ? "ใส่ในช่องแชท" : "ให้ AI ปรับตามนี้"}
          </button>
        </div>
      </div>

      {/* RIGHT — the result, always in view */}
      <section aria-labelledby="mock-title" className="flex min-h-[560px] min-w-0 flex-1 flex-col lg:min-h-0">
        <div className="flex flex-wrap items-center gap-2 border-b border-line bg-surface px-3 py-2">
          <h3 id="mock-title" className="text-sm font-semibold">
            ตัวอย่างสไตล์
          </h3>
          <span className="badge badge-warn h-5 text-[11px]">ยังไม่ใช่แอปของคุณ</span>
          <span className="hint text-xs">{empty ? "ดูหน้าตาจากสไตล์ที่เลือก ก่อนให้ AI สร้าง" : "แอปจริงอยู่ที่แท็บพรีวิว"}</span>
          <span className="flex-1" />
          {deviceSwitch}
          <button type="button" onClick={() => setExpanded(true)} className="btn btn-ghost btn-sm" title="เปิดเต็มจอ">
            <ArrowsPointingOutIcon className="h-4 w-4" />
            ขยาย
          </button>
        </div>
        <iframe title="ตัวอย่างสไตล์" sandbox="" srcDoc={html} className="min-h-0 w-full flex-1 border-0 bg-sunken" />
      </section>

      {expanded && (
        <Portal>
          <div className="dialog-backdrop" onMouseDown={() => setExpanded(false)}>
            <div
              role="dialog"
              aria-modal="true"
              aria-label="ตัวอย่างสไตล์ เต็มจอ"
              className="dialog flex h-[calc(100vh-2rem)] max-w-[1400px] flex-col overflow-hidden"
              onMouseDown={(e) => e.stopPropagation()}
            >
              <div className="flex items-center gap-2 border-b border-line px-3 py-2">
                <span className="text-sm font-semibold">ตัวอย่างสไตล์</span>
                <span className="flex-1" />
                <div className="seg" role="group" aria-label="ขนาดจอ">
                  <button type="button" aria-pressed={device === "desktop"} onClick={() => setDevice("desktop")} className="seg-item h-7 text-xs">
                    จอใหญ่
                  </button>
                  <button type="button" aria-pressed={device === "mobile"} onClick={() => setDevice("mobile")} className="seg-item h-7 text-xs">
                    มือถือ
                  </button>
                </div>
                <button type="button" onClick={() => setExpanded(false)} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
                  <XMarkIcon className="h-4 w-4" />
                </button>
              </div>
              <iframe title="ตัวอย่างสไตล์ เต็มจอ" sandbox="" srcDoc={html} className="min-h-0 w-full flex-1 border-0 bg-sunken" />
            </div>
          </div>
        </Portal>
      )}

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="pages"
        onActivated={() => {
          pagesStateAction(projectId)
            .then((s) => s && setPages(s))
            .catch(() => {});
        }}
      />
    </div>
  );
}

function JumpChip({ label, count, on, onClick }: { label: string; count?: number; on: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-current={on ? "true" : undefined}
      className={`inline-flex h-7 shrink-0 items-center gap-1 rounded-full border px-2.5 text-[12.5px] transition ${
        on ? "border-accent bg-accent-soft font-semibold text-accent-text" : "border-line-strong bg-surface text-fg hover:border-accent"
      }`}
    >
      {label}
      {count ? <span className="grid h-4 min-w-4 place-items-center rounded-full bg-accent px-1 text-[10px] font-bold text-white">{count}</span> : null}
    </button>
  );
}

/** A catalog item with its own preview, scaled down. */
function PickCard({ item, on, onToggle }: { item: StyleItem; on: boolean; onToggle: () => void }) {
  return (
    <button
      type="button"
      aria-pressed={on}
      onClick={onToggle}
      title={item.when}
      className={`relative flex flex-col overflow-hidden rounded-lg border bg-surface text-left transition ${on ? "border-accent ring-2 ring-accent-soft" : "border-line hover:border-line-strong"}`}
    >
      <span className="pointer-events-none relative block h-[92px] overflow-hidden border-b border-line bg-sunken">
        <iframe
          title={item.title}
          // the catalog's own previews carry small demo scripts (as on the old style page); no same-origin access
          sandbox="allow-scripts"
          loading="lazy"
          tabIndex={-1}
          srcDoc={item.previewHtml}
          className="absolute left-0 top-0 h-[184px] w-[200%] origin-top-left scale-50 border-0"
        />
      </span>
      {on && (
        <span className="absolute right-1.5 top-1.5 grid h-5 w-5 place-items-center rounded-full bg-accent text-white">
          <CheckIcon className="h-3 w-3" strokeWidth={3} />
        </span>
      )}
      <span className="block truncate px-2 py-1.5 text-[12.5px] font-medium">{item.title}</span>
    </button>
  );
}

function UseCard({
  projectId,
  pages,
  use,
  savedUse,
  allowed,
  kindLock,
  empty,
  onUse,
  features,
  onFeatures,
  dirty,
  saving,
  error,
  note,
  onSave,
  onUpgrade,
}: {
  projectId: string;
  pages: PagesState | null;
  use: ProjectUse;
  savedUse: ProjectUse;
  allowed: ProjectUse[];
  kindLock: string | null;
  empty: boolean;
  onUse: (u: ProjectUse) => void;
  features: ProFeatures;
  onFeatures: (f: ProFeatures) => void;
  dirty: boolean;
  saving: boolean;
  error: string | null;
  note: string | null;
  onSave: () => void;
  onUpgrade: () => void;
}) {
  const pro = !!pages?.premium;
  const github = pages?.github;
  const githubOn = use === "github";
  const kindChanges = kindOfUse(use) !== kindOfUse(savedUse);
  const tile = (on: boolean, proTile: boolean) =>
    `flex flex-col gap-0.5 rounded-lg border px-3 py-2 text-left transition disabled:cursor-not-allowed disabled:opacity-45 ${
      on ? (proTile && !pro ? "border-warn-line ring-2 ring-warn-soft" : "border-accent ring-2 ring-accent-soft") : "border-line-strong enabled:hover:border-accent"
    }`;
  return (
    <section className="card flex flex-col gap-2.5 p-3" aria-labelledby="use-title">
      <div className="flex items-center gap-2">
        <span className="icon-chip tone-accent">
          <GlobeAltIcon className="h-4 w-4" aria-hidden />
        </span>
        <h3 id="use-title" className="text-sm font-semibold">
          ใช้งานผ่านอะไร
        </h3>
        <span className="hint text-xs">AI เขียนโค้ดให้ตรงกับแบบที่เลือก</span>
      </div>

      <div className="flex flex-col gap-1.5" role="radiogroup" aria-label="ใช้งานผ่านอะไร">
        {USE_LIST.map((u) => {
          const on = use === u.id;
          const disabled = !allowed.includes(u.id);
          return (
            <button
              key={u.id}
              type="button"
              role="radio"
              aria-checked={on}
              disabled={disabled}
              title={disabled ? kindLock ?? undefined : u.hint}
              onClick={() => onUse(u.id)}
              className={tile(on, u.pro)}
            >
              <span className="flex items-center gap-2 text-[13px] font-semibold leading-snug">
                <span className={`grid h-4 w-4 shrink-0 place-items-center rounded-full border-2 ${on ? "border-accent" : "border-line-strong"}`} aria-hidden>
                  {on && <span className="h-1.5 w-1.5 rounded-full bg-accent" />}
                </span>
                {u.label}
                {u.pro && <span className="pro-badge">PRO</span>}
              </span>
              <span className="hint pl-6 text-xs leading-snug">{u.hint}</span>
            </button>
          );
        })}
      </div>
      {kindLock && <p className="hint flex items-center gap-1.5 text-xs"><LockClosedIcon className="h-3.5 w-3.5 shrink-0" />{kindLock}</p>}
      {kindChanges && !empty && (
        <p className="callout callout-warn text-[13px]">มีโค้ดอยู่แล้ว ถ้าเปลี่ยน AI ต้องแก้ส่วนที่เปิดชีตให้ตรงแบบใหม่ กดใช้แล้วแอปจะเตรียมข้อความนั้นไว้ในช่องแชทให้</p>
      )}

      {githubOn && (
        <>
          {pro && github && !github.connected && (
            <div className="callout callout-warn items-center text-[13px]">
              <span className="min-w-0 flex-1">ต้องเชื่อมบัญชี GitHub ก่อน ถึงจะเผยแพร่ขึ้น GitHub Pages ได้</span>
              <Link href={`/settings?s=premium&from=${projectId}`} className="btn btn-soft tone-warn btn-sm">
                เชื่อม GitHub
              </Link>
            </div>
          )}
          <div className="flex items-baseline gap-2">
            <span className="text-[12.5px] font-semibold">องค์ประกอบเสริมบน GitHub Pages</span>
            {!pro && <span className="hint text-xs">ติ๊กดูได้ ตัวอย่างเปลี่ยนตาม</span>}
          </div>
          <div className="grid gap-1.5 sm:grid-cols-2">
            {PRO_FEATURE_LIST.map((f) => {
              const on = features[f.id];
              return (
                <label key={f.id} className={`flex cursor-pointer items-start gap-2.5 rounded-lg border p-2.5 transition ${on ? (pro ? "border-accent bg-accent-soft/40" : "border-warn-line bg-warn-soft/40") : "border-line hover:border-line-strong"}`}>
                  <input type="checkbox" checked={on} onChange={(e) => onFeatures({ ...features, [f.id]: e.target.checked })} className="mt-0.5 h-4 w-4 accent-[var(--accent)]" />
                  <span className="min-w-0 flex-1">
                    <span className="block text-[13px] font-semibold">{f.label}</span>
                    <span className="hint block text-xs">{f.hint}</span>
                  </span>
                  {!pro && <LockClosedIcon className="h-4 w-4 shrink-0 text-warn-text" aria-label="ใช้ได้ใน Pro" />}
                </label>
              );
            })}
          </div>
        </>
      )}

      {error && (
        <p role="alert" className="callout callout-danger text-[13px]">
          {error}
        </p>
      )}
      {note && <p className="callout text-[13px]">{note}</p>}

      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-2.5">
        {githubOn && !pro ? (
          <>
            <span className="hint min-w-0 flex-1 text-xs">EasyGAS Pro · GitHub Pages · ติดตั้งเป็นแอป · กล้อง · ใช้จากมือถือ</span>
            <button type="button" onClick={onUpgrade} className="btn btn-warn btn-sm">
              <LockClosedIcon className="h-4 w-4" />
              ปลดล็อก Pro
            </button>
          </>
        ) : (
          <>
            <span className="hint min-w-0 flex-1 text-xs">{dirty ? "ยังไม่ได้บันทึก" : `ตอนนี้: ${USE_LIST.find((u) => u.id === savedUse)?.label}`}</span>
            <button type="button" onClick={onSave} disabled={!dirty || saving} className="btn btn-primary btn-sm">
              <CheckIcon className="h-4 w-4" />
              {saving ? "กำลังบันทึก…" : "ใช้กับโปรเจกต์นี้"}
            </button>
          </>
        )}
      </div>
    </section>
  );
}
