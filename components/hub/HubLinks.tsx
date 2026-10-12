"use client";

/* eslint-disable @next/next/no-img-element -- pictures from the hub-images bucket */
import { useRef, useState } from "react";
import {
  ArrowDownIcon,
  ArrowUpIcon,
  Bars3Icon,
  ChevronDownIcon,
  CodeBracketIcon,
  LinkIcon,
  DocumentDuplicateIcon,
  PhotoIcon,
  PlusIcon,
  SparklesIcon,
  TrashIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import { hubImageAction, hubLinkMetaAction, hubProjectsAction, type HubProject } from "@/app/projects/hub-actions";
import { cleanUrl, deploymentOf, HUB_BADGES, HUB_ICONS, iconId, LIMITS, newId, type HubBadge, type HubDoc, type HubItem, type HubSection } from "@/lib/hub/doc";
import { HUB_ICON } from "./hub-icon-map";
import { HUB_IMAGE_ACCEPT, shrinkHubImage } from "./hub-image";
import { moved, useSortable } from "./useSortable";

export const SWATCHES = ["#0ea5e9", "#2563eb", "#7c3aed", "#db2777", "#dc2626", "#ea580c", "#ca8a04", "#16a34a", "#0d9488", "#475569"];

function newItem(url: string, title: string, extra: Partial<HubItem> = {}): HubItem {
  return { id: newId(), title, url, desc: "", icon: "", iconUrl: "", color: "", badge: "", start: "", end: "", added: new Date().toISOString(), deployment: deploymentOf(url) ?? "", ...extra };
}

/**
 * The links of a hub: the page's name and line, sections (fold / reorder / rename), links (drag the handle to
 * reorder — mouse or finger), each opening into its own form. A pasted address gets its page's title and icon;
 * "จากโปรเจกต์ของฉัน" adds the published apps of this app.
 */
export function HubLinks({ hubId, doc, onChange, pro }: { hubId: string; doc: HubDoc; onChange: (d: HubDoc) => void; pro: boolean }) {
  const [url, setUrl] = useState("");
  const [target, setTarget] = useState<string>(doc.sections[0]?.id ?? "");
  const [adding, setAdding] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(null);
  const [picker, setPicker] = useState<HubProject[] | null>(null);

  const setSections = (sections: HubSection[]) => onChange({ ...doc, sections });
  const setSection = (id: string, patch: Partial<HubSection>) => setSections(doc.sections.map((s) => (s.id === id ? { ...s, ...patch } : s)));
  const total = doc.sections.reduce((n, s) => n + s.items.length, 0);
  const sectionId = doc.sections.some((s) => s.id === target) ? target : doc.sections[0]?.id;

  function addTo(id: string | undefined, items: HubItem[]) {
    if (!id) return;
    if (total + items.length > LIMITS.items) return setNote(`มีลิงก์ได้ไม่เกิน ${LIMITS.items} ลิงก์`);
    setSections(doc.sections.map((s) => (s.id === id ? { ...s, items: [...s.items, ...items] } : s)));
  }

  async function addUrl() {
    const clean = cleanUrl(url);
    if (!clean) return setNote("ลิงก์ต้องขึ้นต้นด้วย https:// หรือ http://");
    setAdding(true);
    setNote(null);
    const r = await hubLinkMetaAction(hubId, clean).catch(() => null);
    setAdding(false);
    const host = new URL(clean).hostname.replace(/^www\./, "");
    const item = newItem(clean, r?.ok && r.data.title ? r.data.title.slice(0, LIMITS.itemTitle) : host, { iconUrl: r?.ok ? r.data.iconUrl : "" });
    addTo(sectionId, [item]);
    setUrl("");
    setOpen(item.id);
    if (!r?.ok) setNote("เพิ่มลิงก์แล้ว แต่ดึงชื่อจากเว็บนั้นไม่ได้ ตั้งชื่อเองได้เลย");
  }

  async function openPicker() {
    setPicker([]);
    setPicker(await hubProjectsAction().catch(() => []));
  }

  function addSection() {
    if (doc.sections.length >= LIMITS.sections) return setNote(`มีได้ไม่เกิน ${LIMITS.sections} หมวด`);
    const s: HubSection = { id: newId(), title: "หมวดใหม่", collapsed: false, items: [] };
    setSections([...doc.sections, s]);
    setTarget(s.id);
  }

  return (
    <div className="flex flex-col gap-4">
      {/* the page's own words */}
      <div className="card flex flex-col gap-3 p-4">
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          ชื่อหน้า
          <input value={doc.title} maxLength={LIMITS.title} onChange={(e) => onChange({ ...doc, title: e.target.value })} className="field" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          คำอธิบายสั้น ๆ
          <textarea
            value={doc.description}
            maxLength={LIMITS.description}
            rows={2}
            onChange={(e) => onChange({ ...doc, description: e.target.value })}
            placeholder="เช่น รวมระบบงานของโรงเรียน กดเลือกระบบที่ต้องการได้เลย"
            className="field"
          />
        </label>
      </div>

      {/* add */}
      <div className="card flex flex-col gap-3 p-4">
        <p className="text-sm font-semibold">เพิ่มลิงก์</p>
        <div className="flex flex-wrap gap-2">
          <input
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && !adding && addUrl()}
            placeholder="วางลิงก์ เช่น https://…"
            aria-label="ลิงก์ที่จะเพิ่ม"
            inputMode="url"
            className="field min-w-0 flex-1 basis-60"
          />
          {doc.sections.length > 1 && (
            <select value={sectionId} onChange={(e) => setTarget(e.target.value)} aria-label="เพิ่มลงหมวด" className="field w-auto max-w-[12rem]">
              {doc.sections.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.title || "ไม่มีชื่อหมวด"}
                </option>
              ))}
            </select>
          )}
          <button type="button" onClick={addUrl} disabled={adding || !url.trim()} className="btn btn-primary">
            <PlusIcon className="h-4 w-4" />
            {adding ? "กำลังอ่านเว็บ…" : "เพิ่ม"}
          </button>
        </div>
        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={openPicker} className="btn btn-soft tone-ai btn-sm">
            <CodeBracketIcon className="h-4 w-4" />
            เพิ่มจากโปรเจกต์ของฉัน
          </button>
          <button type="button" onClick={addSection} className="btn btn-secondary btn-sm">
            <PlusIcon className="h-4 w-4" />
            หมวดใหม่
          </button>
        </div>
        <p className="hint text-xs">
          ลิงก์เว็บแอป Apps Script เปิดผ่าน run.easygaside.tech ให้อัตโนมัติ คนที่ล็อกอิน Google หลายบัญชีก็เปิดได้ · {total}/{LIMITS.items} ลิงก์
        </p>
        {note && <p className="text-sm text-warn">{note}</p>}
      </div>

      {/* sections */}
      {doc.sections.map((s, si) => (
        <SectionCard
          key={s.id}
          section={s}
          index={si}
          count={doc.sections.length}
          sections={doc.sections}
          hubId={hubId}
          pro={pro}
          open={open}
          setOpen={setOpen}
          onChange={(patch) => setSection(s.id, patch)}
          onMove={(dir) => setSections(moved(doc.sections, si, si + dir))}
          onDelete={() => {
            if (s.items.length && !window.confirm(`ลบหมวด “${s.title || "ไม่มีชื่อ"}” และลิงก์ในหมวดนี้ ${s.items.length} ลิงก์?`)) return;
            const rest = doc.sections.filter((x) => x.id !== s.id);
            setSections(rest.length ? rest : [{ id: newId(), title: "ลิงก์ทั้งหมด", collapsed: false, items: [] }]);
          }}
          onMoveItem={(item, toSection) =>
            setSections(
              doc.sections.map((x) =>
                x.id === s.id ? { ...x, items: x.items.filter((i) => i.id !== item.id) } : x.id === toSection ? { ...x, items: [...x.items, item] } : x,
              ),
            )
          }
        />
      ))}

      {picker && (
        <div className="dialog-backdrop" onClick={() => setPicker(null)}>
          <div role="dialog" aria-modal="true" aria-label="เลือกโปรเจกต์" className="dialog max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-[15px] font-semibold">เพิ่มจากโปรเจกต์ของฉัน</h3>
              <button type="button" onClick={() => setPicker(null)} className="btn btn-ghost btn-sm btn-icon" aria-label="ปิด">
                <XMarkIcon className="h-5 w-5" />
              </button>
            </div>
            <p className="hint mt-1">โปรเจกต์ที่เผยแพร่แล้วในเครื่องนี้ กดเพื่อเพิ่มลงหมวด “{doc.sections.find((x) => x.id === sectionId)?.title || "แรก"}”</p>
            <ul className="mt-3 flex max-h-[50vh] flex-col gap-1.5 overflow-y-auto">
              {picker.length === 0 ? (
                <li className="hint py-4">ยังไม่มีโปรเจกต์ที่เผยแพร่ (หรือกำลังโหลด…)</li>
              ) : (
                picker.map((p) => {
                  const already = doc.sections.some((x) => x.items.some((i) => i.url === p.url));
                  return (
                    <li key={p.id}>
                      <button
                        type="button"
                        disabled={already}
                        onClick={() => {
                          addTo(sectionId, [newItem(p.url, p.name.slice(0, LIMITS.itemTitle), { deployment: p.deployment, icon: "i:computer-desktop" })]);
                          setPicker(null);
                        }}
                        className="row-btn flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-left disabled:opacity-50"
                      >
                        <span className="icon-chip tone-accent shrink-0">
                          <CodeBracketIcon className="h-4 w-4" />
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-medium">{p.name}</span>
                          <span className="block truncate font-mono text-[11px] text-muted">{p.url.replace(/^https:\/\//, "")}</span>
                        </span>
                        {already && <span className="badge">เพิ่มแล้ว</span>}
                      </button>
                    </li>
                  );
                })
              )}
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}

function SectionCard({
  section: s,
  index,
  count,
  sections,
  hubId,
  pro,
  open,
  setOpen,
  onChange,
  onMove,
  onDelete,
  onMoveItem,
}: {
  section: HubSection;
  index: number;
  count: number;
  sections: HubSection[];
  hubId: string;
  pro: boolean;
  open: string | null;
  setOpen: (id: string | null) => void;
  onChange: (patch: Partial<HubSection>) => void;
  onMove: (dir: -1 | 1) => void;
  onDelete: () => void;
  onMoveItem: (item: HubItem, toSection: string) => void;
}) {
  const { rowRef, handleProps, dragging } = useSortable(s.items.length, (from, to) => onChange({ items: moved(s.items, from, to) }));
  const setItem = (id: string, patch: Partial<HubItem>) => onChange({ items: s.items.map((i) => (i.id === id ? { ...i, ...patch } : i)) });

  return (
    <section className="card p-3 sm:p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input
          value={s.title}
          maxLength={LIMITS.sectionTitle}
          onChange={(e) => onChange({ title: e.target.value })}
          placeholder="ชื่อหมวด (เว้นว่างได้)"
          aria-label="ชื่อหมวด"
          className="field min-w-0 flex-1 basis-40 font-semibold"
        />
        <label className="flex items-center gap-1.5 text-xs text-muted" title="หน้าเว็บจะพับหมวดนี้ไว้ตอนเปิด">
          <input type="checkbox" checked={s.collapsed} onChange={(e) => onChange({ collapsed: e.target.checked })} />
          พับไว้
        </label>
        <button type="button" onClick={() => onMove(-1)} disabled={index === 0} className="btn btn-ghost btn-sm btn-icon" aria-label="เลื่อนหมวดขึ้น">
          <ArrowUpIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={() => onMove(1)} disabled={index === count - 1} className="btn btn-ghost btn-sm btn-icon" aria-label="เลื่อนหมวดลง">
          <ArrowDownIcon className="h-4 w-4" />
        </button>
        <button type="button" onClick={onDelete} className="btn btn-ghost btn-sm btn-icon text-danger" aria-label="ลบหมวด">
          <TrashIcon className="h-4 w-4" />
        </button>
      </div>
      {s.items.length === 0 ? (
        <p className="hint mt-3 px-1 text-xs">ยังไม่มีลิงก์ในหมวดนี้</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-2">
          {s.items.map((it, i) => (
            <li
              key={it.id}
              ref={rowRef(i)}
              className={`rounded-xl border bg-surface transition ${dragging === i ? "border-accent shadow-lg ring-2 ring-accent/30" : "border-line"}`}
            >
              <div className="flex items-center gap-2 p-2">
                <span {...handleProps(i)} className="grid h-8 w-6 shrink-0 place-items-center rounded text-faint hover:text-fg">
                  <Bars3Icon className="h-4 w-4" />
                </span>
                <ItemIcon item={it} />
                <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="min-w-0 flex-1 text-left" aria-expanded={open === it.id}>
                  <span className="block truncate text-sm font-medium">{it.title || "ไม่มีชื่อ"}</span>
                  <span className="block truncate font-mono text-[11px] text-muted">{it.url.replace(/^https?:\/\//, "")}</span>
                </button>
                {(it.start || it.end) && <span className="badge max-sm:hidden">ตั้งเวลา</span>}
                {it.badge && <span className="badge max-sm:hidden">{HUB_BADGES.find((b) => b.id === it.badge)?.label}</span>}
                <button type="button" onClick={() => setOpen(open === it.id ? null : it.id)} className="btn btn-ghost btn-sm btn-icon" aria-label="แก้ลิงก์นี้">
                  <ChevronDownIcon className={`h-4 w-4 transition-transform ${open === it.id ? "rotate-180" : ""}`} />
                </button>
              </div>
              {open === it.id && (
                <ItemForm
                  item={it}
                  hubId={hubId}
                  pro={pro}
                  sections={sections}
                  sectionId={s.id}
                  onChange={(patch) => setItem(it.id, patch)}
                  onDuplicate={() => onChange({ items: [...s.items.slice(0, i + 1), { ...it, id: newId(), title: `${it.title} (สำเนา)`.slice(0, LIMITS.itemTitle) }, ...s.items.slice(i + 1)] })}
                  onDelete={() => onChange({ items: s.items.filter((x) => x.id !== it.id) })}
                  onMoveTo={(to) => onMoveItem(it, to)}
                />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** Same picture rules as the website's hub page: uploaded icon · line icon in the link's colour · older emoji · a link mark. */
export function ItemIcon({ item, accent = "#0ea5e9" }: { item: HubItem; accent?: string }) {
  if (item.iconUrl) return <img src={item.iconUrl} alt="" className="h-9 w-9 shrink-0 rounded-lg border border-line bg-white object-cover" />;
  const c = item.color || accent;
  const id = iconId(item.icon);
  const Icon = id ? HUB_ICON[id] : !item.icon ? LinkIcon : null;
  return (
    <span
      className="grid h-9 w-9 shrink-0 place-items-center rounded-lg"
      style={id ? { background: `color-mix(in srgb, ${c} 13%, transparent)`, color: c } : { background: "var(--sunken)", color: "var(--muted)" }}
    >
      {Icon ? <Icon className="h-[18px] w-[18px]" strokeWidth={1.7} /> : <span className="text-base">{item.icon}</span>}
    </span>
  );
}

function ItemForm({
  item: it,
  hubId,
  pro,
  sections,
  sectionId,
  onChange,
  onDuplicate,
  onDelete,
  onMoveTo,
}: {
  item: HubItem;
  hubId: string;
  pro: boolean;
  sections: HubSection[];
  sectionId: string;
  onChange: (patch: Partial<HubItem>) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onMoveTo: (sectionId: string) => void;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const file = useRef<HTMLInputElement>(null);
  const gasLink = deploymentOf(it.url) || it.url.startsWith("https://run.easygaside.tech/");

  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy("upload");
    setMsg(null);
    try {
      const r = await hubImageAction(hubId, "icon", await shrinkHubImage(f, "icon"));
      if (r.ok) onChange({ iconUrl: r.data });
      else setMsg(r.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
    setBusy(null);
    if (file.current) file.current.value = "";
  }

  async function fromSite() {
    setBusy("meta");
    setMsg(null);
    const r = await hubLinkMetaAction(hubId, it.url).catch(() => null);
    setBusy(null);
    if (!r?.ok) return setMsg(r?.error ?? "ดึงไม่สำเร็จ");
    if (r.data.iconUrl) onChange({ iconUrl: r.data.iconUrl });
    else setMsg("เว็บนี้ไม่มีไอคอนให้ดึง");
  }

  return (
    <div className="flex flex-col gap-3 border-t border-line p-3">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          ชื่อลิงก์
          <input value={it.title} maxLength={LIMITS.itemTitle} onChange={(e) => onChange({ title: e.target.value })} className="field" />
        </label>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          ลิงก์
          <input
            value={it.url}
            maxLength={LIMITS.url}
            inputMode="url"
            onChange={(e) => onChange({ url: e.target.value, ...(deploymentOf(e.target.value) ? { deployment: deploymentOf(e.target.value)! } : {}) })}
            className="field font-mono text-[12.5px]"
          />
        </label>
      </div>
      <label className="flex flex-col gap-1 text-[13px] font-medium">
        คำอธิบาย (1 บรรทัด)
        <input value={it.desc} maxLength={LIMITS.itemDesc} onChange={(e) => onChange({ desc: e.target.value })} placeholder="เช่น ส่งใบลาออนไลน์" className="field" />
      </label>

      {/* icon */}
      <div className="flex flex-col gap-1.5">
        <span className="text-[13px] font-medium">ไอคอน</span>
        <div className="grid max-h-44 grid-cols-[repeat(auto-fill,minmax(2.25rem,1fr))] gap-1 overflow-y-auto rounded-lg border border-line p-1.5">
          {HUB_ICONS.map((name) => {
            const Icon = HUB_ICON[name];
            const on = it.icon === `i:${name}` && !it.iconUrl;
            return (
              <button
                key={name}
                type="button"
                title={name}
                aria-label={`ไอคอน ${name}`}
                aria-pressed={on}
                onClick={() => onChange({ icon: `i:${name}`, iconUrl: "" })}
                className={`grid h-9 place-items-center rounded-lg transition hover:bg-sunken ${on ? "bg-accent-soft text-accent-text ring-1 ring-accent" : "text-muted"}`}
              >
                <Icon className="h-5 w-5" strokeWidth={1.7} />
              </button>
            );
          })}
        </div>
        <div className="flex flex-wrap gap-2">
          <input ref={file} type="file" accept={HUB_IMAGE_ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
          <button type="button" onClick={() => file.current?.click()} disabled={!!busy} className="btn btn-secondary btn-sm">
            <PhotoIcon className="h-4 w-4" />
            {busy === "upload" ? "กำลังอัปโหลด…" : "ใช้รูปของฉัน"}
          </button>
          <button type="button" onClick={fromSite} disabled={!!busy} className="btn btn-secondary btn-sm">
            <SparklesIcon className="h-4 w-4" />
            {busy === "meta" ? "กำลังดึง…" : "ไอคอนจากเว็บ"}
          </button>
          {(it.iconUrl || it.icon) && (
            <button type="button" onClick={() => onChange({ icon: "", iconUrl: "" })} className="btn btn-ghost btn-sm">
              ไม่ใช้ไอคอน
            </button>
          )}
        </div>
      </div>

      {/* colour + badge */}
      <div className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5">
          <span className="text-[13px] font-medium">สีประจำลิงก์</span>
          <div className="flex flex-wrap items-center gap-1.5">
            <button type="button" onClick={() => onChange({ color: "" })} aria-pressed={!it.color} className={`h-7 rounded-full border border-line px-2 text-[11px] ${!it.color ? "ring-2 ring-accent" : ""}`}>
              ตามธีม
            </button>
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => onChange({ color: c })} aria-label={`สี ${c}`} aria-pressed={it.color === c} className={`h-7 w-7 rounded-full ${it.color === c ? "ring-2 ring-offset-2 ring-[var(--fg)]" : ""}`} style={{ background: c }} />
            ))}
          </div>
        </div>
        <label className="flex flex-col gap-1 text-[13px] font-medium">
          ป้าย
          <select value={it.badge} onChange={(e) => onChange({ badge: e.target.value as HubBadge })} className="field">
            {HUB_BADGES.map((b) => (
              <option key={b.id} value={b.id}>
                {b.label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {/* schedule (Pro) */}
      <div className="flex flex-col gap-1.5">
        <span className="flex items-center gap-2 text-[13px] font-medium">
          ตั้งเวลาแสดง <span className="pro-badge">PRO</span>
        </span>
        {pro ? (
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <input type="date" value={it.start} onChange={(e) => onChange({ start: e.target.value })} aria-label="แสดงตั้งแต่" className="field w-auto" />
            <span className="text-muted">ถึง</span>
            <input type="date" value={it.end} onChange={(e) => onChange({ end: e.target.value })} aria-label="แสดงถึง" className="field w-auto" />
            {(it.start || it.end) && (
              <button type="button" onClick={() => onChange({ start: "", end: "" })} className="btn btn-ghost btn-sm">
                แสดงตลอด
              </button>
            )}
          </div>
        ) : (
          <p className="hint text-xs">เช่น ลิงก์รับสมัครแสดงเฉพาะช่วงรับสมัคร หมดเวลาแล้วซ่อนเอง (ต้องใช้ Pro)</p>
        )}
      </div>

      {gasLink && (
        <label className="flex items-start gap-2 text-[13px]">
          <input
            type="checkbox"
            className="mt-0.5"
            checked={!!it.deployment}
            onChange={(e) => {
              const d = deploymentOf(it.url) ?? (it.url.match(/run\.easygaside\.tech\/(AKfyc[A-Za-z0-9_-]+)/)?.[1] ?? "");
              onChange({ deployment: e.target.checked ? d : "" });
            }}
          />
          <span>
            เปิดผ่าน run.easygaside.tech
            <span className="hint block text-xs">แก้ปัญหาล็อกอิน Google หลายบัญชี ปิดตัวเลือกนี้ถ้าแอปต้องให้ผู้ใช้ล็อกอิน Google</span>
          </span>
        </label>
      )}

      {msg && <p className="text-sm text-warn">{msg}</p>}
      <div className="flex flex-wrap items-center gap-2 border-t border-line pt-3">
        {sections.length > 1 && (
          <select value={sectionId} onChange={(e) => onMoveTo(e.target.value)} aria-label="ย้ายไปหมวด" className="field w-auto max-w-[12rem] text-sm">
            {sections.map((s) => (
              <option key={s.id} value={s.id}>
                {s.id === sectionId ? `อยู่ในหมวด: ${s.title || "ไม่มีชื่อ"}` : `ย้ายไป: ${s.title || "ไม่มีชื่อ"}`}
              </option>
            ))}
          </select>
        )}
        <span className="flex-1" />
        <button type="button" onClick={onDuplicate} className="btn btn-ghost btn-sm">
          <DocumentDuplicateIcon className="h-4 w-4" />
          ทำสำเนา
        </button>
        <button type="button" onClick={onDelete} className="btn btn-ghost btn-sm text-danger">
          <TrashIcon className="h-4 w-4" />
          ลบลิงก์
        </button>
      </div>
    </div>
  );
}
