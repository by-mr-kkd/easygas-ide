"use client";

/* eslint-disable @next/next/no-img-element -- the website's own QR route */
import { useState, type MutableRefObject } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon, PrinterIcon, TrashIcon, UserGroupIcon, UserMinusIcon } from "@heroicons/react/24/outline";
import { hubDeleteAction, hubInviteAction, hubRemoveEditorAction, hubSaveAction } from "@/app/projects/hub-actions";
import { HUB_VISIBILITY, PIN, type HubVisibility } from "@/lib/hub/doc";
import type { EditorState } from "./HubEditor";

function useCopy() {
  const [copied, setCopied] = useState<string | null>(null);
  return {
    copied,
    copy: async (key: string, text: string) => {
      try {
        await navigator.clipboard.writeText(text);
        setCopied(key);
        setTimeout(() => setCopied(null), 1500);
      } catch {
        /* clipboard blocked */
      }
    },
  };
}

/** Share and settings: link + QR + poster + embed, the address name, who may see it, PIN, the EasyGAS line, editors, delete. */
export function HubShare({
  hub,
  updatedAt,
  onSaved,
  beforeSave,
  onDeleted,
  onReload,
}: {
  hub: EditorState;
  updatedAt: MutableRefObject<string>;
  onSaved: (slug: string, url: string, at: string, patch: Partial<EditorState>) => void;
  beforeSave: () => Promise<void>;
  onDeleted: () => void;
  onReload: () => void;
}) {
  const owner = hub.role === "owner";
  const [slug, setSlug] = useState(hub.slug);
  const [visibility, setVisibility] = useState<HubVisibility>(hub.visibility);
  const [pin, setPin] = useState("");
  const [showBrand, setShowBrand] = useState(hub.showBrand);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<{ text: string; ok?: boolean } | null>(null);
  const [invite, setInvite] = useState<string | null>(null);
  const { copied, copy } = useCopy();
  const embed = `<iframe src="${hub.url}?embed=1" style="width:100%;height:640px;border:0" loading="lazy" title="${hub.slug}"></iframe>`;
  const dirty = slug !== hub.slug || visibility !== hub.visibility || pin !== "" || showBrand !== hub.showBrand;

  async function saveSettings() {
    if (visibility === "pin" && !hub.hasPin && !PIN.test(pin)) return setMsg({ text: "ตั้ง PIN เป็นตัวเลข 4–8 หลักก่อน" });
    if (pin && !PIN.test(pin)) return setMsg({ text: "PIN ต้องเป็นตัวเลข 4–8 หลัก" });
    setBusy(true);
    setMsg(null);
    await beforeSave();
    const r = await hubSaveAction(hub.id, { slug, visibility, pin: pin || undefined, showBrand, updatedAt: updatedAt.current }).catch(() => null);
    setBusy(false);
    if (!r) return setMsg({ text: "บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง" });
    if (!r.ok) return setMsg({ text: r.error });
    onSaved(r.data.slug, r.data.url, r.data.updatedAt, { visibility, showBrand, hasPin: hub.hasPin || !!pin });
    setSlug(r.data.slug);
    setPin("");
    setMsg({ text: "บันทึกแล้ว", ok: true });
  }

  async function makeInvite() {
    setBusy(true);
    setMsg(null);
    const r = await hubInviteAction(hub.id).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ text: r?.error ?? "สร้างรหัสเชิญไม่สำเร็จ" });
    setInvite(r.data.token);
  }

  async function removeEditor(id: string, self = false) {
    if (!window.confirm(self ? "ออกจากการช่วยแก้ฮับนี้?" : "นำคนนี้ออกจากผู้ช่วยแก้?")) return;
    const r = await hubRemoveEditorAction(hub.id, id).catch(() => null);
    if (!r?.ok) return setMsg({ text: r?.error ?? "ไม่สำเร็จ" });
    if (self) onDeleted();
    else onReload();
  }

  async function remove() {
    if (window.prompt(`พิมพ์ชื่อลิงก์ “${hub.slug}” เพื่อยืนยันการลบฮับนี้ (ลบแล้วกู้คืนไม่ได้)`) !== hub.slug) return;
    setBusy(true);
    const r = await hubDeleteAction(hub.id).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setMsg({ text: r?.error ?? "ลบไม่สำเร็จ" });
    onDeleted();
  }

  return (
    <div className="flex flex-col gap-4">
      {/* share */}
      <div className="card flex flex-col gap-4 p-4 sm:flex-row">
        <img src={`${hub.url}/qr?v=${hub.slug}`} alt="QR โค้ดของฮับ" className="h-36 w-36 shrink-0 self-center rounded-lg border border-line bg-white p-1" />
        <div className="flex min-w-0 flex-1 flex-col gap-2">
          <p className="text-sm font-semibold">แชร์หน้านี้</p>
          <p className="break-all rounded-md bg-sunken px-2.5 py-1.5 font-mono text-xs">{hub.url}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" onClick={() => copy("link", hub.url)} className="btn btn-primary btn-sm">
              {copied === "link" ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
              {copied === "link" ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
            </button>
            <a href={`${hub.url}/poster`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              <PrinterIcon className="h-4 w-4" />
              โปสเตอร์ A4
            </a>
            <a href={`${hub.url}/qr`} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              QR เต็มขนาด <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
          </div>
          <details className="text-sm">
            <summary className="cursor-pointer text-muted">ฝังในเว็บอื่น เช่น Google Sites</summary>
            <p className="mt-2 break-all rounded-md bg-sunken p-2 font-mono text-[11px]">{embed}</p>
            <button type="button" onClick={() => copy("embed", embed)} className="btn btn-ghost btn-sm mt-1">
              {copied === "embed" ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
              {copied === "embed" ? "คัดลอกแล้ว" : "คัดลอกโค้ดฝัง"}
            </button>
          </details>
        </div>
      </div>

      {/* settings (owner) */}
      {owner && (
        <div className="card flex flex-col gap-4 p-4">
          <label className="flex flex-col gap-1 text-[13px] font-medium">
            ชื่อลิงก์
            <span className="flex min-w-0 items-center overflow-hidden rounded-[var(--radius,10px)] border border-line">
              <span className="shrink-0 bg-sunken px-2.5 py-2 font-mono text-xs text-muted">easygaside.tech/hub/</span>
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} maxLength={40} className="min-w-0 flex-1 bg-transparent px-2 py-2 font-mono text-sm outline-none" aria-label="ชื่อลิงก์" />
            </span>
            <span className="hint text-xs">a-z, 0-9 และขีด ยาว 3–40 ตัว · เปลี่ยนแล้วลิงก์เดิมและ QR ที่พิมพ์ไว้จะใช้ไม่ได้</span>
          </label>

          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[13px] font-medium">ใครเปิดดูได้</legend>
            {HUB_VISIBILITY.map((v) => {
              const locked = v.id === "pin" && !hub.proActive;
              return (
                <label key={v.id} className={`flex items-start gap-2 ${locked ? "opacity-60" : ""}`}>
                  <input type="radio" name="hub-vis" className="mt-1" checked={visibility === v.id} disabled={locked} onChange={() => setVisibility(v.id)} />
                  <span>
                    <span className="text-sm font-medium">{v.label}</span> {v.id === "pin" && <span className="pro-badge">PRO</span>}
                    <span className="hint block text-xs">{v.hint}</span>
                  </span>
                </label>
              );
            })}
            {visibility === "pin" && (
              <input
                value={pin}
                onChange={(e) => setPin(e.target.value.replace(/\D/g, "").slice(0, 8))}
                inputMode="numeric"
                placeholder={hub.hasPin ? "PIN ใหม่ (เว้นว่าง = ใช้ PIN เดิม)" : "ตั้ง PIN ตัวเลข 4–8 หลัก"}
                aria-label="PIN"
                className="field ml-6 w-64 max-w-[calc(100%-1.5rem)] font-mono tracking-widest"
              />
            )}
          </fieldset>

          <label className={`flex items-start gap-2 ${hub.proActive ? "" : "opacity-60"}`}>
            <input type="checkbox" className="mt-1" checked={!showBrand} disabled={!hub.proActive} onChange={(e) => setShowBrand(!e.target.checked)} />
            <span>
              <span className="text-sm font-medium">ซ่อนบรรทัด “สร้างฮับของคุณด้วย EasyGAS”</span> <span className="pro-badge">PRO</span>
              <span className="hint block text-xs">บัญชีฟรีจะแสดงบรรทัดนี้ท้ายหน้า</span>
            </span>
          </label>

          <div className="flex flex-wrap items-center gap-2">
            <button type="button" onClick={saveSettings} disabled={busy || !dirty} className="btn btn-primary btn-sm">
              {busy ? "กำลังบันทึก…" : "บันทึกการตั้งค่า"}
            </button>
            {msg && <span className={`text-sm ${msg.ok ? "text-accent-text" : "text-danger"}`}>{msg.text}</span>}
          </div>
        </div>
      )}

      {/* editors */}
      <div className="card flex flex-col gap-3 p-4">
        <p className="flex items-center gap-2 text-sm font-semibold">
          <UserGroupIcon className="h-4 w-4" /> คนช่วยแก้ <span className="pro-badge">PRO</span>
        </p>
        {hub.editors.length === 0 ? (
          <p className="hint text-xs">ยังไม่มีคนช่วยแก้ ชวนครูหรือเพื่อนร่วมงานมาช่วยดูแลหน้านี้ได้</p>
        ) : (
          <ul className="flex flex-col gap-1">
            {hub.editors.map((e) => (
              <li key={e.id} className="flex items-center gap-2 text-sm">
                <span className="min-w-0 flex-1 truncate">{e.name}</span>
                {owner && (
                  <button type="button" onClick={() => removeEditor(e.id)} className="btn btn-ghost btn-sm text-danger">
                    <UserMinusIcon className="h-4 w-4" /> นำออก
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
        {owner ? (
          hub.proActive ? (
            <div className="flex flex-col gap-2">
              <button type="button" onClick={makeInvite} disabled={busy} className="btn btn-secondary btn-sm self-start">
                สร้างรหัสเชิญ (ใช้ได้ครั้งเดียว 7 วัน)
              </button>
              {invite && (
                <div className="rounded-lg bg-sunken p-3 text-sm">
                  <p className="break-all font-mono text-xs">{invite}</p>
                  <p className="hint mt-1 text-xs">ส่งรหัสนี้ให้คนที่จะช่วยแก้ เขาเปิด EasyGAS IDE → หน้าแรก → ฮับ → “มีรหัสเชิญ?” แล้ววางรหัส</p>
                  <button type="button" onClick={() => copy("invite", invite)} className="btn btn-ghost btn-sm mt-1">
                    {copied === "invite" ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
                    {copied === "invite" ? "คัดลอกแล้ว" : "คัดลอกรหัส"}
                  </button>
                </div>
              )}
            </div>
          ) : (
            <p className="hint text-xs">ชวนคนช่วยแก้ได้เมื่อใช้ Pro</p>
          )
        ) : (
          <button type="button" onClick={() => removeEditor("self", true)} className="btn btn-ghost btn-sm self-start text-danger">
            ออกจากการช่วยแก้
          </button>
        )}
        {!owner && msg && <p className="text-sm text-danger">{msg.text}</p>}
      </div>

      {owner && (
        <div className="card flex flex-wrap items-center gap-3 border-danger/30 p-4">
          <span className="min-w-0 flex-1 text-sm">
            <b>ลบฮับนี้</b>
            <span className="hint block text-xs">ลิงก์ QR และสถิติจะหายทั้งหมด กู้คืนไม่ได้</span>
          </span>
          <button type="button" onClick={remove} disabled={busy} className="btn btn-secondary btn-sm text-danger">
            <TrashIcon className="h-4 w-4" /> ลบฮับ
          </button>
        </div>
      )}
    </div>
  );
}
