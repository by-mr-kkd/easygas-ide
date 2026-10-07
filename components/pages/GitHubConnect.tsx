"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";
import {
  cancelGitHubConnectAction,
  disconnectGitHubAction,
  githubStatusAction,
  pollGitHubAction,
  startGitHubConnectAction,
} from "@/app/pages/actions";
import type { GitHubStatus } from "@/lib/pages/github-auth";

const GITHUB_APPLICATIONS_URL = "https://github.com/settings/applications";

type Flow =
  | { kind: "idle" }
  | { kind: "starting" }
  | { kind: "waiting"; userCode: string; verificationUri: string; interval: number; expiresAt: number }
  | { kind: "done"; login: string }
  | { kind: "failed"; message: string };

/**
 * Connect / disconnect the user's GitHub account (used inside Settings → Pro and inline in the publish
 * dialog). Device flow: show the code, open GitHub in the user's browser, poll through a server action.
 */
export function GitHubConnect({ onChange }: { onChange?: (status: GitHubStatus) => void } = {}) {
  const [status, setStatus] = useState<GitHubStatus | null>(null);
  const [flow, setFlow] = useState<Flow>({ kind: "idle" });
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  async function refresh() {
    const s = await githubStatusAction();
    setStatus(s);
    onChange?.(s);
  }

  useEffect(() => {
    void refresh();
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function schedulePoll(intervalSec: number) {
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(poll, Math.max(5, intervalSec) * 1000);
  }

  async function poll() {
    const r = await pollGitHubAction();
    if (r.status === "pending") return schedulePoll(r.interval);
    if (r.status === "ok") {
      setFlow({ kind: "done", login: r.login });
      await refresh();
    } else if (r.status === "expired") setFlow({ kind: "failed", message: "รหัสหมดเวลาแล้ว กดเชื่อมใหม่เพื่อขอรหัสใหม่" });
    else if (r.status === "denied") setFlow({ kind: "failed", message: "คุณกดไม่อนุญาตบน GitHub ถ้าต้องการใช้ ให้กดเชื่อมใหม่อีกครั้ง" });
    else if (r.status === "none") setFlow({ kind: "idle" });
    else if (r.status === "error") setFlow({ kind: "failed", message: r.message });
  }

  async function start() {
    setFlow({ kind: "starting" });
    const r = await startGitHubConnectAction();
    if (!r.ok) return setFlow({ kind: "failed", message: r.error });
    setFlow({ kind: "waiting", userCode: r.userCode, verificationUri: r.verificationUri, interval: r.interval, expiresAt: r.expiresAt });
    window.open(r.verificationUri, "_blank", "noreferrer");
    schedulePoll(r.interval);
  }

  async function cancel() {
    if (timer.current) clearTimeout(timer.current);
    await cancelGitHubConnectAction();
    setFlow({ kind: "idle" });
  }

  async function disconnect() {
    await disconnectGitHubAction();
    setFlow({ kind: "idle" });
    await refresh();
  }

  async function copyCode(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the code is visible to type */
    }
  }

  if (!status) return <p className="hint">กำลังตรวจสถานะ GitHub…</p>;

  if (!status.available)
    return <p className="hint">การวางหน้าเว็บบน GitHub ยังไม่เปิดใช้ในเวอร์ชันนี้ รอการอัปเดตครั้งถัดไป</p>;

  if (status.connected)
    return (
      <div className="flex flex-col gap-2">
        <p className="text-sm">
          เชื่อมบัญชี GitHub แล้ว: <b>@{status.login}</b>
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <button type="button" onClick={disconnect} className="btn btn-secondary btn-sm">
            ยกเลิกการเชื่อม
          </button>
          <a href={GITHUB_APPLICATIONS_URL} target="_blank" rel="noreferrer" className="link text-xs">
            หรือถอนสิทธิ์ในหน้าตั้งค่า GitHub <ArrowTopRightOnSquareIcon className="inline h-3.5 w-3.5" />
          </a>
        </div>
      </div>
    );

  return (
    <div className="flex flex-col gap-2">
      {flow.kind === "idle" || flow.kind === "failed" || flow.kind === "starting" ? (
        <>
          <p className="hint">ยังไม่ได้เชื่อมบัญชี GitHub หน้าเว็บจะถูกวางไว้ใน GitHub Pages ของบัญชีคุณเอง (ฟรี)</p>
          {flow.kind === "failed" && <p className="text-sm text-danger">{flow.message}</p>}
          <button type="button" onClick={start} disabled={flow.kind === "starting"} className="btn btn-primary btn-sm self-start">
            {flow.kind === "starting" ? "กำลังขอรหัส…" : "เชื่อมบัญชี GitHub"}
          </button>
        </>
      ) : flow.kind === "waiting" ? (
        <div className="callout tone-info flex-col items-start gap-2">
          <span>พิมพ์รหัสนี้ในหน้า GitHub ที่เปิดขึ้นมา แล้วกดอนุญาต</span>
          <div className="flex items-center gap-2">
            <code className="rounded-md bg-sunken px-3 py-1.5 font-mono text-lg tracking-widest">{flow.userCode}</code>
            <button type="button" onClick={() => copyCode(flow.userCode)} className="btn btn-ghost btn-sm">
              {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
              {copied ? "คัดลอกแล้ว" : "คัดลอก"}
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <a href={flow.verificationUri} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
              เปิดหน้า GitHub อีกครั้ง <ArrowTopRightOnSquareIcon className="h-4 w-4" />
            </a>
            <button type="button" onClick={cancel} className="btn btn-ghost btn-sm">
              ยกเลิก
            </button>
          </div>
          <span className="hint">กำลังรอการอนุญาต… หน้านี้จะอัปเดตเองเมื่อเสร็จ</span>
        </div>
      ) : (
        <p className="text-sm">เชื่อมบัญชี GitHub แล้ว: <b>@{flow.login}</b></p>
      )}
    </div>
  );
}
