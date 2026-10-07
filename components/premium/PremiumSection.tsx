"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { GitHubConnectGuide } from "@/components/settings/GitHubConnectGuide";
import { CheckCircleIcon, ComputerDesktopIcon, ExclamationTriangleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { activateThisDeviceAction, deactivatePremiumDeviceAction, getPremiumStatusAction } from "@/app/premium/actions";
import { GitHubConnect } from "@/components/pages/GitHubConnect";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PremiumStatus } from "@/lib/premium/types";
import { KeyBox } from "./KeyBox";
import { KeyEntry } from "./KeyEntry";
import { UpgradeDialog } from "./UpgradeDialog";

const longDate = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("th-TH", { dateStyle: "medium" }) : "");

/**
 * Settings → Pro: licence status, buy / enter a key, the machine this key is registered on (a key works on a
 * limited number of machines), "เพิกถอนจากเครื่องนี้" to free the slot, and the GitHub account the pages go to.
 */
export function PremiumSection({ status: initial }: { status: PremiumStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [revokeError, setRevokeError] = useState("");
  const [pending, start] = useTransition();

  function activated(next: PremiumStatus) {
    setStatus(next);
    router.refresh();
  }

  function revoke() {
    setRevokeError("");
    start(async () => {
      const r = await deactivatePremiumDeviceAction();
      if (!r.ok) {
        setRevokeError(r.error);
        setConfirmRevoke(false);
        return;
      }
      setStatus(r.data);
      setConfirmRevoke(false);
      router.refresh();
    });
  }

  function retryDevice() {
    start(async () => {
      activated(await activateThisDeviceAction());
    });
  }

  const hasKey = Boolean(status.keyMask);

  return (
    <div className="space-y-8">
      <section className="card p-4">
        {status.active ? (
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <CheckCircleIcon className="mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-fg">เปิดใช้ Pro แล้ว{status.email ? ` สำหรับ ${status.email}` : ""}</p>
                <p className="hint mt-0.5">AI สร้างส่วนที่ใช้กล้องได้ ถ่ายรูป สแกน QR สแกนบาร์โค้ด</p>
              </div>
            </div>
            <button type="button" onClick={() => setConfirmRevoke(true)} className="btn btn-secondary btn-sm">
              เพิกถอนจากเครื่องนี้
            </button>
            <div className="flex w-full items-start gap-3 border-t border-line pt-4">
              <ComputerDesktopIcon className="mt-0.5 h-5 w-5 shrink-0 text-muted" aria-hidden="true" />
              <p className="hint">
                ยืนยันเครื่องนี้แล้ว รหัสหนึ่งใช้ได้ 2 เครื่อง จะย้ายไปเครื่องอื่นให้กด “เพิกถอนจากเครื่องนี้” ก่อน
                {status.activeUntil ? ` · ต่ออายุเองเมื่อต่อเน็ต (ตอนนี้ถึง ${longDate(status.activeUntil)})` : ""}
              </p>
            </div>
            <div className="w-full border-t border-line pt-4">
              <KeyBox keyMask={status.keyMask} />
            </div>
          </div>
        ) : hasKey && status.needsDevice ? (
          <div className="space-y-4">
            <div className="flex items-start gap-3">
              <ExclamationTriangleIcon className="mt-0.5 h-5 w-5 shrink-0 text-warn-text" aria-hidden="true" />
              <div>
                <p className="text-sm font-medium text-fg">มีรหัส Pro แต่ยังไม่ได้ยืนยันเครื่องนี้{status.email ? ` (${status.email})` : ""}</p>
                <p className="hint mt-0.5">
                  {status.deviceError ?? "รหัสหนึ่งใช้ได้ 2 เครื่อง ต่ออินเทอร์เน็ตแล้วกด “ยืนยันเครื่องนี้” Pro จะเปิดทันที"}
                </p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              <button type="button" onClick={retryDevice} disabled={pending} className="btn btn-primary btn-sm">
                {pending ? "กำลังยืนยัน…" : "ยืนยันเครื่องนี้"}
              </button>
              <button type="button" onClick={() => setConfirmRevoke(true)} className="btn btn-secondary btn-sm">
                ลบรหัสออกจากเครื่องนี้
              </button>
            </div>
            <div className="border-t border-line pt-4">
              <KeyBox keyMask={status.keyMask} />
            </div>
          </div>
        ) : (
          <>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-start gap-3">
                <SparklesIcon className="icon-chip mt-0.5 h-5 w-5 shrink-0 text-accent-text" aria-hidden="true" />
                <div>
                  <p className="text-sm font-medium text-fg">ยังไม่ได้เปิดใช้ Pro</p>
                  <p className="hint mt-0.5">Pro ปลดล็อกเว็บแอปที่ใช้กล้อง จ่ายครั้งเดียว ใช้ได้ตลอด 2 เครื่อง</p>
                </div>
              </div>
              <button type="button" onClick={() => setUpgradeOpen(true)} className="btn btn-primary btn-sm">
                ดูข้อเสนอ
              </button>
            </div>
            <div className="mt-4 border-t border-line pt-4">
              <KeyEntry onActivated={activated} />
            </div>
          </>
        )}
        {revokeError && (
          <p role="alert" className="mt-3 text-sm text-danger">
            {revokeError}
          </p>
        )}
      </section>

      <section>
        <h3 className="text-sm font-semibold text-fg">บัญชี GitHub สำหรับวางหน้าเว็บ</h3>
        <p className="hint mt-1">หน้าเว็บที่ใช้กล้องต้องวางบน GitHub Pages ของคุณเอง เพราะ Google ไม่ให้เว็บแอปของ Apps Script เปิดกล้อง</p>
        <div className="mt-3">
          <GitHubConnect />
        </div>
        <GitHubConnectGuide />
      </section>

      <UpgradeDialog
        open={upgradeOpen}
        onClose={() => setUpgradeOpen(false)}
        reason="settings"
        onActivated={() => {
          // the dialog's callback carries no payload (shared signature), so ask the server for the new status
          getPremiumStatusAction().then(activated);
        }}
      />
      <ConfirmDialog
        open={confirmRevoke}
        title="เพิกถอน Pro จากเครื่องนี้"
        body="เครื่องนี้จะเลิกใช้ Pro และคืนสิทธิ์ 1 เครื่องให้รหัส จากนั้นนำรหัสไปใส่ในเครื่องอื่นได้ทันที คัดลอกรหัสเก็บไว้ก่อนกด (ปุ่มคัดลอกอยู่ด้านล่าง) ต้องต่ออินเทอร์เน็ต"
        confirmLabel="เพิกถอน"
        tone="amber"
        busy={pending}
        onConfirm={revoke}
        onCancel={() => setConfirmRevoke(false)}
      />
    </div>
  );
}
