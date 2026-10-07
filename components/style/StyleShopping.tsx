"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowLeftIcon } from "@heroicons/react/24/outline";
import { newProjectReturnId } from "@/app/projects/actions";
import { AppTopBar } from "@/components/AppTopBar";
import { ThemeToggle } from "@/components/ui/ThemeToggle";
import type { StyleCategory, StyleItem } from "@/lib/style-catalog";
import { CategoryNav } from "./CategoryNav";
import { OptionCard } from "./OptionCard";
import { SelectionPanel, type SelectionGroup } from "./SelectionPanel";

const KICKOFF_KEY = "egs:kickoff"; // the IDE reads this once to prefill its chat box
const DEFAULT_PROJECT_NAME = "เครื่องมือจาก Style Lab";
const PROJECT_NAME_MAX = 70;
const XL_QUERY = "(min-width: 80rem)"; // Tailwind's xl — from here the panel is a column, not a drawer

function buildPrompt(purpose: string, items: StyleItem[]): string {
  const head = purpose.trim() ? `สร้าง${purpose.trim()}` : "สร้างเครื่องมือตามที่อธิบาย";
  if (items.length === 0) return head;
  const lines = items.map((i) => `- ${i.promptSnippet}`).join("\n");
  return `${head}\n\nโดยใช้สไตล์และองค์ประกอบเหล่านี้:\n${lines}`;
}

// the picks, labelled by category in catalog order (an item whose category is unknown still shows)
function groupSelection(items: StyleItem[], categories: StyleCategory[]): SelectionGroup[] {
  const known = categories.map((c) => ({
    id: c.id,
    title: c.title,
    items: items.filter((i) => i.category === c.id),
  }));
  const orphans = items.filter((i) => !categories.some((c) => c.id === i.category));
  return [...known, { id: "", title: "อื่น ๆ", items: orphans }].filter((g) => g.items.length > 0);
}

export function StyleShopping({
  catalog,
  categories,
  targetProject,
}: {
  catalog: StyleItem[];
  categories: StyleCategory[];
  /** when set, the styles are sent into this existing project instead of creating a new one */
  targetProject?: { id: string; name: string };
}) {
  const router = useRouter();
  const openerRef = useRef<HTMLButtonElement>(null);
  const [activeCat, setActiveCat] = useState<string>(categories[0]?.id ?? "");
  const [selected, setSelected] = useState<string[]>([]);
  const [purpose, setPurpose] = useState("");
  const [prompt, setPrompt] = useState("");
  const [dirty, setDirty] = useState(false); // user manually edited the prompt
  const [pending, setPending] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [panelOpen, setPanelOpen] = useState(false); // drawer state, below xl only

  const selectedItems = useMemo(
    () => selected.map((id) => catalog.find((c) => c.id === id)).filter((x): x is StyleItem => !!x),
    [selected, catalog],
  );
  const selectionGroups = useMemo(() => groupSelection(selectedItems, categories), [selectedItems, categories]);
  const selectedCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const item of selectedItems) counts[item.category] = (counts[item.category] ?? 0) + 1;
    return counts;
  }, [selectedItems]);

  // keep the prompt in sync with picks/purpose until the user edits it by hand
  useEffect(() => {
    if (!dirty) setPrompt(buildPrompt(purpose, selectedItems));
  }, [purpose, selectedItems, dirty]);

  const closePanel = () => setPanelOpen(false);

  // drawer: Esc closes it; widening the window to xl turns it back into the third column
  useEffect(() => {
    if (!panelOpen) return;
    const wide = window.matchMedia(XL_QUERY);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setPanelOpen(false);
    };
    const onWide = () => {
      if (wide.matches) setPanelOpen(false);
    };
    document.addEventListener("keydown", onKey);
    wide.addEventListener("change", onWide);
    return () => {
      document.removeEventListener("keydown", onKey);
      wide.removeEventListener("change", onWide);
      // runs once the drawer is gone and the page is no longer inert: hand focus back to its opener
      openerRef.current?.focus();
    };
  }, [panelOpen]);

  const toggle = (id: string) =>
    setSelected((s) => (s.includes(id) ? s.filter((x) => x !== id) : [...s, id]));

  const shown = catalog.filter((c) => c.category === activeCat);
  const activeHint = categories.find((c) => c.id === activeCat)?.hint;
  const backHref = targetProject ? `/projects/${targetProject.id}` : "/projects";

  async function submit() {
    const kickoff = prompt.trim();
    if (!kickoff || pending) return;
    setPending(true);
    setSubmitError(null);
    try {
      let projectId = targetProject?.id;
      if (!projectId) {
        const name = (purpose.trim() || DEFAULT_PROJECT_NAME).slice(0, PROJECT_NAME_MAX);
        const res = await newProjectReturnId(name);
        if ("error" in res) {
          setSubmitError(res.error);
          setPending(false);
          return;
        }
        projectId = res.id;
      }
      sessionStorage.setItem(KICKOFF_KEY, kickoff);
      router.push(`/projects/${projectId}`); // stays pending until the IDE replaces this page
    } catch {
      setSubmitError(targetProject ? "เปิดโปรเจกต์ไม่สำเร็จ ลองอีกครั้ง" : "สร้างโปรเจกต์ไม่สำเร็จ ลองอีกครั้ง");
      setPending(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-bg text-fg">
      <AppTopBar
        center={<span className="truncate text-sm font-semibold">เลือกสไตล์</span>}
        right={<ThemeToggle />}
      />

      {/* the page scrolls here, not on <body>, so the rail and the panel can stay sticky beside the cards */}
      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1400px] px-4 py-5 sm:px-6">
          <div inert={panelOpen} className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-1">
            <Link href={backHref} className="btn btn-ghost btn-sm -ml-2">
              <ArrowLeftIcon className="h-4 w-4" />
              {targetProject ? "กลับไปที่โปรเจกต์" : "กลับไปหน้าโปรเจกต์"}
            </Link>
            <p className="hint">เลือกองค์ประกอบที่ชอบ ระบบจะรวมเป็นคำสั่งให้ AI สร้างตามนั้น</p>
          </div>

          <div className="grid grid-cols-[minmax(0,1fr)] gap-4 md:grid-cols-[220px_minmax(0,1fr)] md:gap-6 xl:grid-cols-[220px_minmax(0,1fr)_340px]">
            <CategoryNav
              categories={categories}
              activeId={activeCat}
              selectedCounts={selectedCounts}
              onPick={setActiveCat}
              inert={panelOpen}
            />

            <section inert={panelOpen} className="min-w-0">
              {activeHint && <p className="hint mb-3">{activeHint}</p>}
              <div className="grid grid-cols-1 gap-4 md:grid-cols-[repeat(auto-fill,minmax(280px,1fr))]">
                {shown.map((item) => (
                  <OptionCard key={item.id} item={item} selected={selected.includes(item.id)} onToggle={toggle} />
                ))}
              </div>
            </section>

            {panelOpen && (
              <div className="fixed inset-x-0 bottom-0 top-12 z-40 bg-[rgba(12,17,23,0.5)] xl:hidden" onClick={closePanel} />
            )}
            <SelectionPanel
              open={panelOpen}
              onClose={closePanel}
              groups={selectionGroups}
              count={selectedItems.length}
              onRemove={toggle}
              purpose={purpose}
              onPurposeChange={setPurpose}
              prompt={prompt}
              onPromptChange={(value) => {
                setPrompt(value);
                setDirty(true);
              }}
              promptEdited={dirty}
              onPromptReset={() => setDirty(false)}
              targetName={targetProject?.name}
              pending={pending}
              error={submitError}
              onSubmit={submit}
            />
          </div>
        </div>
      </main>

      {/* below xl the panel is a drawer; this bar is the way into it, and never covers a card */}
      <footer inert={panelOpen} className="flex-none border-t border-line bg-surface xl:hidden">
        <div className="mx-auto flex h-14 max-w-[1400px] items-center justify-between gap-3 px-4 sm:px-6">
          <span className="min-w-0 truncate text-muted">เลือกแล้ว {selectedItems.length} รายการ</span>
          <button
            ref={openerRef}
            type="button"
            onClick={() => setPanelOpen(true)}
            aria-haspopup="dialog"
            className="btn btn-primary shrink-0"
          >
            {targetProject ? "ดูที่เลือกและใช้สไตล์" : "ดูที่เลือกและสร้าง"}
          </button>
        </div>
      </footer>
    </div>
  );
}
