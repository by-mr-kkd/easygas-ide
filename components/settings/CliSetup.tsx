"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowRightEndOnRectangleIcon,
  ArrowTopRightOnSquareIcon,
  ChevronRightIcon,
  ClipboardDocumentIcon,
} from "@heroicons/react/24/outline";
import { checkCliAction, openCliTerminalAction, type CliCheck } from "@/app/settings/actions";
import { CLI_INSTALL, type InstallableCli } from "@/lib/engines/cli-install";

const BTN = "btn btn-secondary btn-sm";
const PRIMARY = "btn btn-primary btn-sm";
const CODE = "select-all break-all rounded-lg border border-line bg-sunken px-3 py-1.5 font-mono text-[12.5px] text-fg";

/**
 * Status of the user's own AI command-line tool (Claude Code, Codex or Muse Code) with:
 *  - "ติดตั้งให้": after a confirmation that shows the exact command, opens a visible PowerShell window
 *    running the vendor's official installer (the copy-paste steps stay as the manual route);
 *  - "ล็อกอิน": opens a window running the tool's own sign-in — the app never handles credentials;
 *  - "ตรวจอีกครั้ง": looks again and runs the tool, so no restart is needed.
 */
export function CliSetup({ tool, found }: { tool: InstallableCli; found: boolean }) {
  const info = CLI_INSTALL[tool];
  const router = useRouter();
  const [busy, setBusy] = useState<"check" | "install" | "login" | null>(null);
  const [result, setResult] = useState<CliCheck | null>(null);
  const [confirming, setConfirming] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const isFound = result ? result.found : found;

  // a found tool is asked once on load whether it is signed in, so the page says so without a click
  useEffect(() => {
    if (!found) return;
    let gone = false;
    setBusy("check");
    checkCliAction(tool)
      .then((r) => {
        if (!gone) setResult(r);
      })
      .catch(() => {
        // the button below still works; nothing to say yet
      })
      .finally(() => {
        if (!gone) setBusy(null);
      });
    return () => {
      gone = true;
    };
  }, [tool, found]);

  async function recheck() {
    setBusy("check");
    setMessage(null);
    try {
      setResult(await checkCliAction(tool));
      router.refresh();
    } catch {
      setMessage("ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setBusy(null);
    }
  }

  async function open(kind: "install" | "login") {
    setBusy(kind);
    setMessage(null);
    setConfirming(false);
    try {
      const r = await openCliTerminalAction(tool, kind);
      setMessage(
        r.ok
          ? kind === "install"
            ? "เปิดหน้าต่าง PowerShell แล้ว รอจนติดตั้งเสร็จ แล้วกด ล็อกอิน ต่อ"
            : "เปิดหน้าต่างล็อกอินแล้ว ทำตามในหน้าต่างนั้น เสร็จแล้วกด ตรวจอีกครั้ง"
          : (r.error ?? "เปิดหน้าต่างไม่สำเร็จ"),
      );
    } catch {
      setMessage("เปิดหน้าต่างไม่สำเร็จ ลองทำตามขั้นตอนด้านล่างเอง");
    } finally {
      setBusy(null);
    }
  }

  async function copy() {
    try {
      await navigator.clipboard.writeText(info.command);
      setCopied(true);
    } catch {
      setMessage("คัดลอกไม่สำเร็จ เลือกข้อความแล้วกด Ctrl+C เอง");
    }
  }

  const recheckButton = (
    <button type="button" onClick={recheck} disabled={busy !== null} className={BTN}>
      <ArrowPathIcon className={`h-4 w-4 ${busy === "check" ? "animate-spin" : ""}`} />
      {busy === "check" ? "กำลังตรวจ…" : "ตรวจอีกครั้ง"}
    </button>
  );
  const loginButton = (
    <button type="button" onClick={() => open("login")} disabled={busy !== null} className={BTN}>
      <ArrowRightEndOnRectangleIcon className="h-4 w-4" />
      ล็อกอิน {info.name}
    </button>
  );
  const notice = message && (
    <p className="text-[13px] font-medium text-fg" aria-live="polite">
      {message}
    </p>
  );

  if (isFound) {
    const loggedOut = result?.loggedIn === false;
    return (
      <div className="space-y-2">
        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-sm text-fg">
          <span className="badge badge-ok">พบแล้ว</span>
          <span className="min-w-0">
            พบ {info.name} ในเครื่องแล้ว{result?.version ? ` (${result.version})` : ""}
            {result && !result.version && " แต่เปิดไม่สำเร็จ ลองติดตั้งใหม่"}
            {result?.loggedIn === true && ` · ล็อกอินแล้ว${result.account ? ` (${result.account})` : ""}`}
          </span>
        </p>
        {loggedOut ? (
          <p className="callout callout-warn">
            ยังไม่ได้ล็อกอิน กดปุ่มด้านล่างแล้วล็อกอินด้วยบัญชี {info.plan}
          </p>
        ) : (
          result?.loggedIn !== true && (
            <p className="hint">
              ต้องล็อกอินไว้ก่อนหนึ่งครั้งด้วยบัญชี {info.plan} ถ้ายังไม่ได้ล็อกอิน กดปุ่มด้านล่าง
            </p>
          )
        )}
        <div className="flex flex-wrap items-center gap-2">
          {result?.loggedIn !== true && loginButton}
          {recheckButton}
        </div>
        {notice}
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <p className="callout callout-warn">
        {result ? `ยังไม่พบ ${info.name} ถ้าติดตั้งเสร็จแล้ว ลองปิดแอปนี้แล้วเปิดใหม่` : `ยังไม่พบ ${info.name} ในเครื่องนี้ ติดตั้งครั้งเดียว ใช้เวลาไม่กี่นาที`}
      </p>

      {confirming ? (
        <div className="callout block">
          <p>
            แอปจะเปิดหน้าต่าง PowerShell แล้วรันตัวติดตั้งของ {info.vendor} ด้วยคำสั่งนี้ คุณจะเห็นทุกอย่างที่เกิดขึ้นในหน้าต่างนั้น
            ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ
          </p>
          <code className={`${CODE} mt-1.5 block`}>{info.command}</code>
          <div className="mt-2 flex flex-wrap gap-2">
            <button type="button" onClick={() => open("install")} disabled={busy !== null} className={PRIMARY}>
              ติดตั้งเลย
            </button>
            <button type="button" onClick={() => setConfirming(false)} className={BTN}>
              ยกเลิก
            </button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={() => setConfirming(true)} disabled={busy !== null} className={PRIMARY}>
            <ArrowDownTrayIcon className="h-4 w-4" />
            ติดตั้ง {info.name} ให้
          </button>
          {loginButton}
          {recheckButton}
        </div>
      )}
      {notice}

      <details className="group">
        <summary className="btn btn-secondary btn-sm">
          <ChevronRightIcon className="h-4 w-4 transition-transform group-open:rotate-90" />
          หรือติดตั้งเองทีละขั้น
        </summary>
        <ol className="mt-2 list-decimal space-y-2.5 pl-5 text-[13px] text-fg">
          <li>
            เปิด <b>PowerShell</b>: กดปุ่ม Windows พิมพ์ <code className="font-mono">PowerShell</code> แล้วกด Enter (ไม่ต้องเปิดแบบผู้ดูแลระบบ)
          </li>
          <li>
            วางคำสั่งนี้แล้วกด Enter รอจนติดตั้งเสร็จ
            <div className="mt-1.5 flex flex-wrap items-center gap-2">
              <code className={`${CODE} min-w-0`}>{info.command}</code>
              <button type="button" onClick={copy} className={BTN}>
                <ClipboardDocumentIcon className="h-4 w-4" />
                {copied ? "คัดลอกแล้ว" : "คัดลอก"}
              </button>
            </div>
          </li>
          <li>
            ปิด PowerShell แล้วเปิดใหม่ พิมพ์ <code className="font-mono">{info.loginCommand}</code> แล้วกด Enter เพื่อล็อกอินด้วยบัญชี {info.plan}
          </li>
          <li>กลับมาที่หน้านี้แล้วกด ตรวจอีกครั้ง</li>
        </ol>
        <a href={info.docsUrl} target="_blank" rel="noopener noreferrer" className={`${BTN} mt-2`}>
          วิธีติดตั้งจาก {info.vendor}
          <ArrowTopRightOnSquareIcon className="h-4 w-4" />
        </a>
      </details>
      <p className="hint">
        ตัวติดตั้งเป็นของ {info.vendor} ผู้ผลิต {info.name} ไม่ต้องติดตั้ง Node.js ถ้าเคยติดตั้งไว้แล้วด้วยวิธีอื่น แอปจะหาเจอเอง
      </p>
    </div>
  );
}
