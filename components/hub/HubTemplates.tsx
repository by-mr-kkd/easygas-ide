"use client";

import { useState } from "react";
import { CheckIcon, EyeIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { HUB_LAYOUTS, HUB_THEMES, type HubDoc, type HubTheme } from "@/lib/hub/doc";
import { applyHubTemplate, HUB_TEMPLATES, hubHasLinks, TEMPLATE_URL, type HubTemplate, type TemplateApply } from "@/lib/hub/templates";
import { HUB_ICON } from "./hub-icon-map";
import { FONT_FAMILY, THEME_SWATCH } from "./HubLook";

/**
 * "เทมเพลต": ready-made hubs (lib/hub/templates) to look at and take. Taking one applies its look and its sample
 * sections — the owner then edits names, icons and links in the ลิงก์ tab (every sample link points at
 * example.com until replaced). A hub that already has links is asked whether the samples replace them, go after
 * them, or stay out (look only). Same component on the website (components/hub-app) — change both.
 */
export function HubTemplates({ doc, onChange, onApplied }: { doc: HubDoc; onChange: (d: HubDoc) => void; onApplied: () => void }) {
  const [preview, setPreview] = useState<HubTemplate | null>(null);
  const [asking, setAsking] = useState<HubTemplate | null>(null);

  function take(tpl: HubTemplate, mode?: TemplateApply) {
    if (!mode) {
      if (hubHasLinks(doc)) return setAsking(tpl);
      mode = "replace";
    }
    onChange(applyHubTemplate(doc, tpl, mode));
    setAsking(null);
    setPreview(null);
    onApplied();
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="card p-4">
        <p className="text-sm font-semibold">เริ่มจากเทมเพลตสำเร็จรูป</p>
        <p className="hint mt-1">
          เลือกแบบที่ใกล้เคียงงานของคุณ กดดูตัวอย่างก่อนได้ พอใช้เทมเพลตแล้วไปแก้ชื่อ ไอคอน และลิงก์จริงในแท็บ ลิงก์ (ลิงก์ตัวอย่างทุกอันชี้ไป example.com จนกว่าจะแก้)
        </p>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {HUB_TEMPLATES.map((t) => (
            <div key={t.id} className="flex flex-col overflow-hidden rounded-xl border border-line">
              <button type="button" onClick={() => setPreview(t)} className="block text-left" title="ดูตัวอย่าง">
                <TemplateSketch tpl={t} />
              </button>
              <div className="flex flex-1 flex-col px-3 py-2.5">
                <span className="text-[13px] font-semibold">{t.label}</span>
                <span className="text-[11px] text-muted">{t.hint}</span>
                <span className="mt-0.5 text-[11px] text-faint">เหมาะกับ {t.who}</span>
                <span className="mt-2.5 flex gap-1.5">
                  <button type="button" onClick={() => setPreview(t)} className="btn btn-secondary btn-sm">
                    <EyeIcon className="h-4 w-4" />
                    ดูตัวอย่าง
                  </button>
                  <button type="button" onClick={() => take(t)} className="btn btn-primary btn-sm">
                    <CheckIcon className="h-4 w-4" />
                    ใช้เทมเพลตนี้
                  </button>
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {preview && (
        <Overlay onClose={() => setPreview(null)} title={`ตัวอย่าง · ${preview.label}`}>
          <TemplatePreview tpl={preview} />
          <div className="mt-3 flex flex-wrap justify-end gap-2">
            <button type="button" onClick={() => setPreview(null)} className="btn btn-secondary">
              ปิด
            </button>
            <button type="button" onClick={() => take(preview)} className="btn btn-primary">
              <CheckIcon className="h-4 w-4" />
              ใช้เทมเพลตนี้
            </button>
          </div>
        </Overlay>
      )}

      {asking && (
        <Overlay onClose={() => setAsking(null)} title={`ใช้เทมเพลต ${asking.label} กับฮับนี้`}>
          <p className="text-sm">ฮับนี้มีลิงก์อยู่แล้ว จะให้ลิงก์ตัวอย่างของเทมเพลตทำอย่างไร</p>
          <div className="mt-3 flex flex-col gap-2">
            <button type="button" onClick={() => take(asking, "append")} className="btn btn-primary justify-start">
              เพิ่มหมวดตัวอย่างต่อท้ายลิงก์เดิม
            </button>
            <button type="button" onClick={() => take(asking, "style")} className="btn btn-secondary justify-start">
              ใช้แค่หน้าตา (ธีม รูปแบบ สี ฟอนต์) ลิงก์เดิมคงอยู่
            </button>
            <button type="button" onClick={() => take(asking, "replace")} className="btn btn-secondary justify-start text-danger">
              แทนที่ลิงก์เดิมทั้งหมดด้วยตัวอย่าง
            </button>
            <button type="button" onClick={() => setAsking(null)} className="btn btn-ghost justify-start">
              ยกเลิก
            </button>
          </div>
        </Overlay>
      )}
    </div>
  );
}

function Overlay({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center" onClick={onClose} role="presentation">
      <div role="dialog" aria-modal="true" aria-label={title} className="card max-h-[90vh] w-full max-w-md overflow-y-auto p-4" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between gap-2">
          <p className="text-[15px] font-semibold">{title}</p>
          <button type="button" onClick={onClose} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

const themeLabel = (id: HubTheme): string => HUB_THEMES.find((t) => t.id === id)?.label ?? id;
const layoutLabel = (id: HubTemplate["layout"]): string => HUB_LAYOUTS.find((l) => l.id === id)?.label ?? id;

/** The card's small picture: the theme's background, the accent, and the first links the way the layout shows them. */
function TemplateSketch({ tpl }: { tpl: HubTemplate }) {
  const sw = THEME_SWATCH[tpl.theme];
  const first = tpl.sections[0].items.slice(0, tpl.layout === "grid" ? 6 : 3);
  return (
    <span className="block h-28 p-2.5" style={{ background: sw.bg, color: sw.text, fontFamily: FONT_FAMILY[tpl.font] }}>
      <span className="mx-auto mb-1.5 block h-3 w-3 rounded-full" style={{ background: tpl.accent }} />
      {tpl.layout === "grid" ? (
        <span className="grid grid-cols-3 gap-1">
          {first.map((i, n) => {
            const Icon = HUB_ICON[i.icon];
            return (
              <span key={n} className="flex h-7 items-center justify-center rounded-md" style={{ background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
                <Icon className="h-3.5 w-3.5" style={{ color: tpl.accent }} />
              </span>
            );
          })}
        </span>
      ) : (
        <span className={tpl.layout === "cards" ? "block rounded-md p-1" : "block"} style={tpl.layout === "cards" ? { background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : undefined}>
          {first.map((i, n) => {
            const Icon = HUB_ICON[i.icon];
            return (
              <span key={n} className="mb-1 flex h-4 items-center gap-1 rounded-md px-1.5 text-[8px]" style={tpl.layout === "cards" ? undefined : { background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
                <Icon className="h-2.5 w-2.5 shrink-0" style={{ color: tpl.accent }} />
                <span className="truncate">{i.title}</span>
              </span>
            );
          })}
        </span>
      )}
      <span className="mt-1 block text-[9px] opacity-70">
        {themeLabel(tpl.theme)} · {layoutLabel(tpl.layout)}
      </span>
    </span>
  );
}

/** The whole page as a phone-sized mock-up: title, every section and link the way the layout shows them. */
function TemplatePreview({ tpl }: { tpl: HubTemplate }) {
  const sw = THEME_SWATCH[tpl.theme];
  return (
    <div className="overflow-hidden rounded-2xl border border-line">
      <div className="px-4 pb-5 pt-4" style={{ background: sw.bg, color: sw.text, fontFamily: FONT_FAMILY[tpl.font] }}>
        <div className="mx-auto mb-2 h-10 w-10 rounded-full" style={{ background: tpl.accent }} />
        <p className="text-center text-base font-semibold">{tpl.label}</p>
        <p className="mb-3 text-center text-xs opacity-70">{tpl.who}</p>
        {tpl.sections.map((s) => (
          <div key={s.title} className="mb-3">
            <p className="mb-1.5 text-xs font-semibold opacity-80">{s.title}</p>
            {tpl.layout === "grid" ? (
              <div className="grid grid-cols-3 gap-2">
                {s.items.map((i) => {
                  const Icon = HUB_ICON[i.icon];
                  return (
                    <div key={i.title} className="flex flex-col items-center gap-1 rounded-xl px-1 py-2 text-center" style={{ background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
                      <Icon className="h-6 w-6" style={{ color: tpl.accent }} />
                      <span className="text-[11px] leading-tight">{i.title}</span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={tpl.layout === "cards" ? "rounded-xl p-1.5" : "flex flex-col gap-1.5"} style={tpl.layout === "cards" ? { background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" } : undefined}>
                {s.items.map((i) => {
                  const Icon = HUB_ICON[i.icon];
                  return (
                    <div key={i.title} className="flex items-center gap-2.5 rounded-xl px-3 py-2" style={tpl.layout === "cards" ? undefined : { background: sw.card, boxShadow: "0 1px 3px rgba(0,0,0,.12)" }}>
                      <Icon className="h-5 w-5 shrink-0" style={{ color: tpl.accent }} />
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-medium leading-tight">{i.title}</span>
                        {i.desc && <span className="block truncate text-[11px] opacity-70">{i.desc}</span>}
                      </span>
                      {i.badge && <span className="rounded-full px-1.5 py-0.5 text-[10px] text-white" style={{ background: tpl.accent }}>{i.badge === "staff" ? "บุคลากร" : i.badge === "hot" ? "แนะนำ" : i.badge === "new" ? "ใหม่" : "ปิดปรับปรุง"}</span>}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        ))}
        <p className="text-center text-[10px] opacity-60">ลิงก์ตัวอย่างชี้ไป {TEMPLATE_URL.replace(/^https:\/\//, "").replace(/\/$/, "")} จนกว่าจะแก้</p>
      </div>
    </div>
  );
}
