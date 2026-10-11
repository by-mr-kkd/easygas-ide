"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowRightIcon, DevicePhoneMobileIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { cancelPairAction, pairPhoneAction, remoteStatusAction, setRemoteAction, type RemoteView } from "@/app/settings/remote-actions";
import { CopyButton, Pairing, phaseText } from "@/components/settings/RemoteSection";
import { phoneStatus } from "./phone-status";

const POLL_MS = 1500;

const CHIP = {
  on: "badge badge-ok",
  busy: "badge",
  error: "badge badge-warn",
  off: "badge",
} as const;

/**
 * The IDE's quick "ใช้จากมือถือ": switch it on, pair a phone with the QR, see the state — without leaving the
 * project. The finer settings (which way to connect, PIN, removing a phone) stay in Settings → ใช้จากมือถือ,
 * one link away. Same server actions as Settings, so a phone that is in through the gateway cannot use it.
 */
export function PhoneDialog({
  open,
  v,
  onView,
  onClose,
  settingsHref,
}: {
  open: boolean;
  v: RemoteView;
  onView: (next: RemoteView) => void;
  onClose: () => void;
  settingsHref: string;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justPaired, setJustPaired] = useState<string | null>(null);
  const deviceCount = useRef(v.devices.length);
  const { tone, label } = phoneStatus(v);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  // fresh each time it opens; Esc closes
  useEffect(() => {
    if (!open) return;
    setError(null);
    setJustPaired(null);
    deviceCount.current = v.devices.length;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- reset only when it opens, not on every poll
  }, [open]);

  // follow a start (download, tunnel), an open pairing code and a Pro link that is still registering
  const settling = open && ((v.enabled && v.phase !== "on" && v.phase !== "error") || !!v.pairing || (v.pro && v.enabled && v.mode === "tunnel" && v.phase === "on" && !v.relayUrl));
  useEffect(() => {
    if (!settling) return;
    const t = setInterval(() => {
      remoteStatusAction()
        .then((next) => {
          if (next.devices.length > deviceCount.current) setJustPaired(next.devices[next.devices.length - 1].name);
          deviceCount.current = next.devices.length;
          onView(next);
        })
        .catch(() => {});
    }, POLL_MS);
    return () => clearInterval(t);
  }, [settling, onView]);

  if (!open) return null;

  async function run<T>(fn: () => Promise<T>): Promise<T | null> {
    setBusy(true);
    setError(null);
    try {
      return await fn();
    } catch (e) {
      setError(e instanceof Error ? e.message : "ทำไม่สำเร็จ");
      return null;
    } finally {
      setBusy(false);
    }
  }

  async function toggle(on: boolean) {
    const r = await run(() => setRemoteAction(on, v.mode));
    if (!r) return;
    if (r.ok) onView(r.view);
    else setError(r.error);
  }

  const needsPin = v.pro && !v.pinSet && !v.enabled;
  const ready = v.enabled && v.phase === "on" && !!v.url;

  return createPortal(
    <div className="dialog-backdrop" onClick={onClose}>
      <div role="dialog" aria-modal="true" aria-label="ใช้จากมือถือ" className="dialog phone-dialog max-w-lg p-5" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-accent-soft text-accent-text">
            <DevicePhoneMobileIcon className="h-5 w-5" />
          </span>
          <div className="min-w-0 flex-1">
            <h3 className="flex flex-wrap items-center gap-2 text-[15px] font-semibold text-fg">
              ใช้จากมือถือ <span className={CHIP[tone]}>{label}</span>
            </h3>
            <p className="hint mt-1">สั่ง AI ทำงานต่อ ดูพรีวิว และเผยแพร่จากมือถือได้ AI กับไฟล์ยังทำงานบนคอมเครื่องนี้ คอมต้องเปิดแอปไว้</p>
          </div>
          <button type="button" aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon shrink-0" onClick={onClose}>
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="mt-4">
          {!v.enabled &&
            (needsPin ? (
              <div className="callout callout-warn">
                <span className="min-w-0">
                  Pro ต้องตั้ง PIN ก่อนเปิด เพราะลิงก์ประจำเครื่องเปิดได้จากที่ไหนก็ได้{" "}
                  <Link href={settingsHref} className="link">
                    ตั้ง PIN
                  </Link>
                </span>
              </div>
            ) : (
              <div className="rounded-xl border border-line bg-sunken p-4">
                <ol className="space-y-1.5 text-sm text-fg">
                  <li>1. กดปุ่ม เชื่อมต่อมือถือ ด้านล่าง</li>
                  <li>2. สแกน QR ด้วยกล้องมือถือ</li>
                  <li>3. ใช้ EasyGAS IDE ในเบราว์เซอร์มือถือได้เลย</li>
                </ol>
                <p className="hint mt-2">
                  {v.mode === "lan" ? "เชื่อมแบบ Wi-Fi เดียวกันเท่านั้น" : "เชื่อมแบบจากที่ไหนก็ได้ ผ่าน Cloudflare (https)"} · เปลี่ยนได้ในตั้งค่า
                </p>
                <button type="button" className="btn btn-primary mt-3" disabled={busy} onClick={() => void toggle(true)}>
                  <DevicePhoneMobileIcon className="h-4 w-4" />
                  เชื่อมต่อมือถือ
                </button>
              </div>
            ))}

          {v.enabled && !ready && (
            <div className={`rounded-xl border p-4 text-sm ${v.phase === "error" ? "border-danger/40 text-danger" : "border-line text-muted"}`} role="status">
              <p className="flex items-center gap-2">
                {v.phase !== "error" && <span className="phone-dot-busy h-2 w-2 shrink-0 rounded-full bg-info" aria-hidden />}
                {phaseText(v)}
              </p>
              {v.phase === "error" && (
                <button type="button" className="btn btn-secondary btn-sm mt-3" disabled={busy} onClick={() => void toggle(true)}>
                  ลองใหม่
                </button>
              )}
            </div>
          )}

          {ready && (
            <>
              <p className="text-sm font-semibold text-fg">ลิงก์สำหรับมือถือ</p>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded-lg bg-sunken px-3 py-2 text-[13px] text-fg">{v.relayUrl ?? v.url}</code>
                <CopyButton text={v.relayUrl ?? v.url!} />
              </div>
              {v.mode === "tunnel" && !v.pro && <p className="hint mt-1.5">ลิงก์นี้ใช้ได้ตราบที่คอมเปิดอยู่ รีสตาร์ตคอมหรือปิดแอปแล้วลิงก์จะเปลี่ยน ต้องจับคู่ใหม่</p>}

              {v.pairing ? (
                <Pairing v={v} onCancel={() => void run(cancelPairAction).then((n) => n && onView(n))} />
              ) : (
                <div className="mt-4 flex flex-wrap items-center gap-3">
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={busy}
                    onClick={() => {
                      setJustPaired(null);
                      void run(pairPhoneAction).then((n) => n && onView(n));
                    }}
                  >
                    <DevicePhoneMobileIcon className="h-4 w-4" />
                    {v.devices.length ? "จับคู่มือถืออีกเครื่อง" : "จับคู่มือถือ"}
                  </button>
                  <span className="hint">{v.devices.length ? `จับคู่แล้ว ${v.devices.length} เครื่อง: ${v.devices.map((d) => d.name).join(", ")}` : "ยังไม่มีมือถือที่จับคู่"}</span>
                </div>
              )}
              {justPaired && <p className="mt-3 text-sm font-medium text-accent-text">จับคู่ {justPaired} แล้ว เปิดลิงก์ในมือถือได้เลย</p>}
            </>
          )}

          {error && <p className="mt-3 text-sm text-danger">{error}</p>}
        </div>

        {!v.pro && (
          <p className="hint mt-4">
            ใช้ฟรีได้เลย{" "}
            <Link href="/settings?s=premium" className="link">
              Pro
            </Link>{" "}
            เพิ่ม: ลิงก์ถาวรตั้งชื่อเองได้ · ติดตั้งเป็นแอปบนมือถือ · แจ้งเตือนเมื่อ AI ทำเสร็จ
          </p>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-3">
          <Link href={settingsHref} className="link inline-flex items-center gap-1 text-sm">
            ตั้งค่าเพิ่มเติม: PIN · วิธีเชื่อมต่อ · ถอนเครื่อง
            <ArrowRightIcon className="h-3.5 w-3.5" />
          </Link>
          {v.enabled && (
            <button type="button" className="btn btn-ghost btn-sm" disabled={busy} onClick={() => void toggle(false)}>
              ปิดการใช้จากมือถือ
            </button>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}
