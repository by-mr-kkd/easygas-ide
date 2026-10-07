"use client";

import { useEffect, useState } from "react";
import { ExclamationTriangleIcon, TrashIcon } from "@heroicons/react/24/outline";
import { uninstallAppAction } from "@/app/settings/actions";

/**
 * "ถอนการติดตั้ง" in Settings → ข้อมูลในเครื่อง. It only opens the app's own uninstaller, whose wizard
 * asks once more and closes the app; the choice made here is whether the data folder goes too.
 */
export function UninstallApp({ available }: { available: boolean }) {
  const [open, setOpen] = useState(false);
  const [deleteData, setDeleteData] = useState(false);
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !busy) setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open, busy]);

  function show() {
    setDeleteData(false);
    setUnderstood(false);
    setMessage(null);
    setOpen(true);
  }

  async function start() {
    setBusy(true);
    try {
      const r = await uninstallAppAction(deleteData);
      setFailed(!r.ok);
      setMessage(r.ok ? "เปิดตัวถอนการติดตั้งแล้ว ทำตามในหน้าต่างที่ขึ้นมา แอปนี้จะถูกปิดระหว่างถอน" : (r.error ?? "เปิดตัวถอนการติดตั้งไม่สำเร็จ"));
      setOpen(false);
    } catch {
      setFailed(true);
      setMessage("เปิดตัวถอนการติดตั้งไม่สำเร็จ ถอนได้จาก Settings ของ Windows → Apps → Installed apps");
      setOpen(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-8 border-t border-line pt-6" aria-labelledby="uninstall-title">
      <h2 id="uninstall-title" className="text-base font-semibold">
        ถอนการติดตั้ง EasyGAS IDE
      </h2>
      <p className="hint mt-1">
        ลบโปรแกรมออกจากเครื่องนี้ เครื่องมือที่เผยแพร่ไปแล้วยังอยู่ในบัญชี Google ของคุณและใช้งานได้ตามเดิม
        โปรแกรม AI ที่ติดตั้งแยกไว้ (Claude Code, Codex, Muse Code) ไม่ถูกลบ
      </p>

      {available ? (
        <button type="button" onClick={show} className="btn btn-danger mt-3">
          <TrashIcon className="h-4 w-4" />
          ถอนการติดตั้ง…
        </button>
      ) : (
        <p className="callout mt-3">
          ปุ่มนี้ใช้ได้เมื่อเปิดจากแอปที่ติดตั้งด้วยตัวติดตั้ง ถ้าต้องการถอน ไปที่ Settings ของ Windows → Apps → Installed apps แล้วเลือก EasyGAS IDE
        </p>
      )}
      {message && (
        <p role="status" className={`callout mt-3 ${failed ? "callout-danger" : ""}`}>
          {message}
        </p>
      )}

      {open && (
        <div className="dialog-backdrop" onClick={() => !busy && setOpen(false)}>
          <div role="dialog" aria-modal="true" aria-labelledby="uninstall-dialog-title" className="dialog max-w-md p-5" onClick={(e) => e.stopPropagation()}>
            <h3 id="uninstall-dialog-title" className="text-[15px] font-semibold">
              ถอนการติดตั้ง EasyGAS IDE?
            </h3>
            <p className="hint mt-1">เลือกว่าจะทำอย่างไรกับโปรเจกต์และการตั้งค่าที่อยู่ในเครื่องนี้</p>

            <div role="radiogroup" aria-label="ข้อมูลในเครื่อง" className="mt-3 space-y-2">
              <label className={`card flex cursor-pointer items-start gap-3 px-3 py-2.5 ${!deleteData ? "border-accent bg-accent-soft" : "hover:bg-sunken"}`}>
                <input type="radio" name="uninstall-data" className="mt-1 h-4 w-4 shrink-0 accent-accent" checked={!deleteData} onChange={() => setDeleteData(false)} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">เก็บโปรเจกต์และการตั้งค่าไว้</span>
                  <span className="hint block">
                    ติดตั้งใหม่ภายหลังแล้วใช้ต่อได้ทันที API key และการเชื่อมบัญชี Google ที่บันทึกไว้จะยังอยู่ในเครื่องนี้ด้วย
                  </span>
                </span>
              </label>
              <label className={`card flex cursor-pointer items-start gap-3 px-3 py-2.5 ${deleteData ? "border-danger bg-danger-soft" : "hover:bg-sunken"}`}>
                <input type="radio" name="uninstall-data" className="mt-1 h-4 w-4 shrink-0 accent-accent" checked={deleteData} onChange={() => setDeleteData(true)} />
                <span className="min-w-0">
                  <span className="block text-sm font-semibold">ลบทุกอย่างในเครื่องนี้</span>
                  <span className="hint block">ลบโปรเจกต์ทั้งหมด ประวัติแชต การตั้งค่า API key และการเชื่อมบัญชี Google ออกจากเครื่องนี้</span>
                </span>
              </label>
            </div>

            {deleteData && (
              <label className="callout callout-danger mt-3 cursor-pointer items-start">
                <input type="checkbox" className="mt-1 h-4 w-4 shrink-0" checked={understood} onChange={(e) => setUnderstood(e.target.checked)} />
                <span className="min-w-0">
                  <ExclamationTriangleIcon className="mr-1 inline h-4 w-4 align-[-3px]" />
                  ฉันเข้าใจว่าโปรเจกต์ที่ยังไม่ได้เผยแพร่จะหายไปและกู้คืนไม่ได้
                </span>
              </label>
            )}

            <p className="hint mt-3">กดถอนการติดตั้งแล้ว ตัวถอนของแอปจะเปิดขึ้นและถามยืนยันอีกครั้งก่อนเริ่มลบ</p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" autoFocus onClick={() => setOpen(false)} disabled={busy} className="btn btn-secondary">
                ยกเลิก
              </button>
              <button type="button" onClick={start} disabled={busy || (deleteData && !understood)} className="btn btn-danger">
                <TrashIcon className="h-4 w-4" />
                {busy ? "กำลังเปิด…" : "ถอนการติดตั้ง"}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
