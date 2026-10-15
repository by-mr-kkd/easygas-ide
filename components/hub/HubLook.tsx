"use client";

/* eslint-disable @next/next/no-img-element -- pictures from the hub-images bucket */
import { useRef, useState } from "react";
import { PhotoIcon, TrashIcon } from "@heroicons/react/24/outline";
import { hubImageAction } from "@/app/projects/hub-actions";
import { HUB_FONTS, HUB_LAYOUTS, HUB_THEMES, type HubDoc, type HubLayout, type HubTheme } from "@/lib/hub/doc";
import { HUB_IMAGE_ACCEPT, shrinkHubImage } from "./hub-image";
import { SWATCHES } from "./HubLinks";

/** a small picture of each theme (the website's lib/hub-theme.ts holds the real colours) */
export const THEME_SWATCH: Record<HubTheme, { bg: string; card: string; text: string }> = {
  school: { bg: "linear-gradient(180deg,#e0f2fe,#ffffff)", card: "#ffffff", text: "#0f172a" },
  minimal: { bg: "#ffffff", card: "#f9fafb", text: "#111827" },
  pastel: { bg: "linear-gradient(160deg,#fdf2f8,#f5f3ff,#ecfeff)", card: "#ffffffd9", text: "#3b0764" },
  dark: { bg: "#0b1120", card: "#111827", text: "#f1f5f9" },
  corporate: { bg: "linear-gradient(180deg,#0b2545 40%,#f1f5f9 40%)", card: "#ffffff", text: "#0b2545" },
};
export const FONT_FAMILY: Record<string, string> = {
  plex: "'IBM Plex Sans Thai', sans-serif",
  sarabun: "Sarabun, sans-serif",
  prompt: "Prompt, sans-serif",
  kanit: "Kanit, sans-serif",
  noto: "'Noto Sans Thai', sans-serif",
};

/** How the hub looks: theme, layout, colour, font, cover and logo pictures, the search box. */
export function HubLook({ hubId, doc, onChange }: { hubId: string; doc: HubDoc; onChange: (d: HubDoc) => void }) {
  const set = (patch: Partial<HubDoc>) => onChange({ ...doc, ...patch });
  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <p className="text-sm font-semibold">ธีม</p>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-5">
          {HUB_THEMES.map((t) => {
            const sw = THEME_SWATCH[t.id];
            const on = doc.theme === t.id;
            return (
              <button key={t.id} type="button" onClick={() => set({ theme: t.id })} aria-pressed={on} className={`overflow-hidden rounded-xl border text-left transition ${on ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-line-strong"}`}>
                <span className="block h-20 p-2" style={{ background: sw.bg }}>
                  <span className="mx-auto mb-1.5 block h-3 w-3 rounded-full" style={{ background: doc.accent }} />
                  {[0, 1].map((i) => (
                    <span key={i} className="mb-1 block h-4 rounded-md" style={{ background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }} />
                  ))}
                </span>
                <span className="block px-2.5 py-2">
                  <span className="block text-[13px] font-semibold">{t.label}</span>
                  <span className="block text-[11px] text-muted">{t.hint}</span>
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card p-4">
        <p className="text-sm font-semibold">รูปแบบลิงก์</p>
        <div className="mt-3 grid grid-cols-3 gap-2">
          {HUB_LAYOUTS.map((l) => (
            <button key={l.id} type="button" onClick={() => set({ layout: l.id })} aria-pressed={doc.layout === l.id} className={`rounded-xl border p-2.5 text-left transition ${doc.layout === l.id ? "border-accent ring-2 ring-accent/40" : "border-line hover:border-line-strong"}`}>
              <LayoutPicture layout={l.id} accent={doc.accent} />
              <span className="mt-2 block text-[13px] font-semibold">{l.label}</span>
              <span className="block text-[11px] text-muted">{l.hint}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <div>
          <p className="text-sm font-semibold">สีหลัก</p>
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {SWATCHES.map((c) => (
              <button key={c} type="button" onClick={() => set({ accent: c })} aria-label={`สี ${c}`} aria-pressed={doc.accent === c} className={`h-8 w-8 rounded-full ${doc.accent === c ? "ring-2 ring-offset-2 ring-[var(--fg)]" : ""}`} style={{ background: c }} />
            ))}
            <label className="relative h-8 w-8 overflow-hidden rounded-full border border-line" title="เลือกสีเอง">
              <input type="color" value={doc.accent} onChange={(e) => set({ accent: e.target.value })} className="absolute -inset-2 h-12 w-12 cursor-pointer" aria-label="เลือกสีเอง" />
            </label>
          </div>
        </div>
        <label className="flex flex-col gap-1 text-sm font-semibold">
          ฟอนต์
          <select value={doc.font} onChange={(e) => set({ font: e.target.value as HubDoc["font"] })} className="field font-normal" style={{ fontFamily: FONT_FAMILY[doc.font] }}>
            {HUB_FONTS.map((f) => (
              <option key={f.id} value={f.id}>
                {f.label} — สวัสดีครับ
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="card grid gap-4 p-4 sm:grid-cols-2">
        <Picture hubId={hubId} kind="cover" label="รูปปก" hint="แนวนอน 5:2 เช่น รูปอาคาร หรือป้ายชื่อ" url={doc.cover} onChange={(cover) => set({ cover })} />
        <Picture hubId={hubId} kind="logo" label="โลโก้" hint="รูปสี่เหลี่ยมจัตุรัส ใช้เป็นไอคอนตอนเพิ่มลงหน้าจอหลักด้วย" url={doc.logo} onChange={(logo) => set({ logo })} />
      </div>

      <label className="card flex items-start gap-3 p-4">
        <input type="checkbox" className="mt-1" checked={doc.search} onChange={(e) => set({ search: e.target.checked })} />
        <span>
          <span className="block text-sm font-semibold">ช่องค้นหา</span>
          <span className="hint block text-xs">ขึ้นเองเมื่อมีลิงก์ตั้งแต่ 8 ลิงก์ขึ้นไป</span>
        </span>
      </label>
    </div>
  );
}

function LayoutPicture({ layout, accent }: { layout: HubLayout; accent: string }) {
  const box = "rounded bg-sunken";
  if (layout === "grid")
    return (
      <span className="grid h-14 grid-cols-3 gap-1">
        {Array.from({ length: 6 }, (_, i) => (
          <span key={i} className={box} style={i === 0 ? { background: `${accent}55` } : undefined} />
        ))}
      </span>
    );
  if (layout === "cards")
    return (
      <span className="flex h-14 flex-col overflow-hidden rounded border border-line bg-surface">
        {Array.from({ length: 3 }, (_, i) => (
          <span key={i} className="flex flex-1 items-center gap-1 border-line px-1 [&:not(:first-child)]:border-t">
            <span className="h-2 w-2 rounded-sm" style={{ background: i === 0 ? `${accent}66` : "var(--line-strong)" }} />
            <span className="h-1 flex-1 rounded bg-sunken" />
          </span>
        ))}
      </span>
    );
  return (
    <span className="flex h-14 flex-col gap-1">
      {Array.from({ length: 3 }, (_, i) => (
        <span key={i} className={`${box} flex-1`} style={i === 0 ? { background: `${accent}33` } : undefined} />
      ))}
    </span>
  );
}

function Picture({ hubId, kind, label, hint, url, onChange }: { hubId: string; kind: "cover" | "logo"; label: string; hint: string; url: string; onChange: (url: string) => void }) {
  const file = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  async function upload(f: File | undefined) {
    if (!f) return;
    setBusy(true);
    setMsg(null);
    try {
      const r = await hubImageAction(hubId, kind, await shrinkHubImage(f, kind));
      if (r.ok) onChange(r.data);
      else setMsg(r.error);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "อัปโหลดไม่สำเร็จ");
    }
    setBusy(false);
    if (file.current) file.current.value = "";
  }
  return (
    <div className="flex flex-col gap-2">
      <span className="text-sm font-semibold">{label}</span>
      {url ? (
        <img src={url} alt="" className={kind === "cover" ? "aspect-[5/2] w-full rounded-lg object-cover" : "h-20 w-20 rounded-full object-cover"} />
      ) : (
        <span className={`grid place-items-center rounded-lg border border-dashed border-line text-faint ${kind === "cover" ? "aspect-[5/2] w-full" : "h-20 w-20 rounded-full"}`}>
          <PhotoIcon className="h-6 w-6" />
        </span>
      )}
      <span className="hint text-xs">{hint}</span>
      <input ref={file} type="file" accept={HUB_IMAGE_ACCEPT} className="sr-only" onChange={(e) => upload(e.target.files?.[0])} />
      <div className="flex flex-wrap gap-2">
        <button type="button" onClick={() => file.current?.click()} disabled={busy} className="btn btn-secondary btn-sm">
          <PhotoIcon className="h-4 w-4" />
          {busy ? "กำลังอัปโหลด…" : url ? "เปลี่ยนรูป" : "เลือกรูป"}
        </button>
        {url && (
          <button type="button" onClick={() => onChange("")} className="btn btn-ghost btn-sm">
            <TrashIcon className="h-4 w-4" />
            เอาออก
          </button>
        )}
      </div>
      {msg && <p className="text-sm text-warn">{msg}</p>}
    </div>
  );
}
