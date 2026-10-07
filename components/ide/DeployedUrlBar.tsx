"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  BoltIcon,
  CheckIcon,
  ClipboardIcon,
} from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { pagesStateAction, publishPagesAction, type PagesState } from "@/app/pages/actions";
import { pullRemoteAction } from "@/app/projects/import-actions";

/** LINE's in-app browser blocks the camera; this parameter makes LINE open the link in the device browser. */
const LINE_SHARE_PARAM = "openExternalBrowser=1";
const shareUrlFor = (u: string): string => `${u}${u.includes("?") ? "&" : "?"}${LINE_SHARE_PARAM}`;

/**
 * Persistent bar for a deployed project: open/copy the live /exec URL, plus quick actions —
 * "เปิด /dev" (push current files to a scratch script and open its always-latest /dev preview) and
 * "deploy ใหม่" (re-PATCH the same deployment → same /exec URL). The /exec URL is stable across
 * re-deploys, so it's safe to share once.
 */
export function DeployedUrlBar({ url: execUrl, projectId }: { url: string; projectId: string }) {
  const [copied, setCopied] = useState(false);
  const [shareCopied, setShareCopied] = useState(false);
  // "วางหน้าเว็บบน GitHub": once published there, the Pages URL is the app's main link
  const [pagesState, setPagesState] = useState<PagesState | null>(null);
  useEffect(() => {
    pagesStateAction(projectId).then(setPagesState).catch(() => {});
  }, [projectId, execUrl]);
  const githubHosting = pagesState?.hosting === "github";
  const url = (githubHosting && pagesState?.pages?.url) || execUrl;
  const [devBusy, setDevBusy] = useState(false);
  const [deployBusy, setDeployBusy] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  // imported script edited on script.google.com since the last sync → publishing would overwrite that work
  const [remoteChanged, setRemoteChanged] = useState<string | null>(null);
  const [pulling, setPulling] = useState(false);
  const router = useRouter();
  const actionRequest = useProjectStore((s) => s.actionRequest);
  const clearActionRequest = useProjectStore((s) => s.clearActionRequest);

  // command palette → "เปิด /dev" / "deploy ใหม่" (the latter still routes through the confirm modal)
  useEffect(() => {
    if (actionRequest === "openDev") {
      clearActionRequest();
      openDev();
    } else if (actionRequest === "redeploy") {
      clearActionRequest();
      setConfirmOpen(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRequest]);

  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the open link still works */
    }
  }

  async function openDev() {
    if (devBusy) return;
    setDevBusy(true);
    setNote(null);
    // Open the tab inside the click gesture (popup blocker), and paint a placeholder right away so the
    // new tab is never a scary bare "about:blank" during the (sometimes slow) first-time scratch push.
    const tab = window.open("", "_blank");
    tab?.document.write(
      "<!doctype html><meta charset='utf-8'><title>กำลังเตรียมพรีวิว…</title>" +
        "<body style='margin:0;font-family:system-ui,sans-serif;display:grid;place-items:center;height:95vh;color:#334155'>" +
        "<div style='text-align:center'>" +
        "<p>กำลังเตรียมพรีวิว /dev …</p>" +
        "<p style='font-size:13px;color:#64748b'>ครั้งแรกอาจใช้เวลาสักครู่</p></div></body>",
    );
    // surface the reason IN the tab — calling tab.close() on an error is often blocked by the browser,
    // which left the tab stuck on about:blank with no explanation.
    const fail = (msg: string) => {
      if (tab && !tab.closed)
        tab.document.body.innerHTML =
          "<div style='text-align:center;font-family:system-ui,sans-serif;color:#334155'>" +
          `<p style='color:#b91c1c;max-width:340px;margin:10px auto;line-height:1.5'>${msg}</p>` +
          "<p style='font-size:13px;color:#64748b'>ปิดแท็บนี้ได้เลย</p></div>";
      setNote(msg);
    };
    try {
      const r = await fetch(`/api/preview/${projectId}`, { method: "POST" });
      const data = await r.json();
      if (r.ok && data.devUrl) {
        if (tab) tab.location.href = data.devUrl;
        else window.open(data.devUrl, "_blank");
      } else if (data.error === "USER_SETTINGS_DISABLED") {
        fail("ต้องเปิด Apps Script API ก่อน กด “เผยแพร่ใหม่” แล้วทำตามขั้นตอนหนึ่งครั้ง");
      } else if (data.error === "NEEDS_REAUTH" || data.error === "NOT_CONNECTED") {
        fail("การเชื่อมต่อ Google หมดอายุ หรือยังไม่ได้เชื่อม เชื่อมใหม่ได้จากแถบสถานะด้านล่างของหน้าต่าง");
      } else if (data.error === "NO_FILES") {
        fail("ยังไม่มีไฟล์ให้พรีวิว ให้ AI สร้างโค้ดก่อน");
      } else {
        fail(data.message || "เปิด /dev ไม่สำเร็จ ลองใหม่อีกครั้ง");
      }
    } catch {
      fail("เปิด /dev ไม่สำเร็จ (เครือข่ายขัดข้อง) ลองใหม่อีกครั้ง");
    } finally {
      setDevBusy(false);
    }
  }

  async function copyShare() {
    try {
      await navigator.clipboard.writeText(shareUrlFor(url));
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }

  async function redeploy() {
    if (deployBusy) return;
    setDeployBusy(true);
    setNote(null);
    if (githubHosting) {
      // both halves again: GAS deploy (dispatcher included) + the static page; the URLs stay the same
      try {
        const r = await publishPagesAction(projectId);
        if (r.ok) {
          setNote(r.built ? "อัปเดตแล้ว ทั้งบน Google และ GitHub (ลิงก์เดิม)" : "ส่งขึ้น GitHub แล้ว รอสักครู่ให้หน้าเว็บอัปเดต");
          setPagesState((s) => (s ? { ...s, pages: { repo: r.repo, url: r.url, published_at: new Date().toISOString() } } : s));
        } else setNote(r.error);
      } catch {
        setNote("เผยแพร่ใหม่ไม่สำเร็จ");
      } finally {
        setDeployBusy(false);
        setConfirmOpen(false);
      }
      return;
    }
    try {
      const r = await fetch(`/api/deploy/${projectId}`, { method: "POST" });
      const data = await r.json();
      if (r.ok)
        // server short-circuits when files are identical → tell the user nothing needed deploying
        setNote(data.unchanged ? "โค้ดไม่ได้เปลี่ยน แอปเป็นเวอร์ชันล่าสุดอยู่แล้ว" : "อัปเดตแล้ว (ลิงก์เดิม)");
      else if (data.error === "USER_SETTINGS_DISABLED")
        setNote("ต้องเปิด Apps Script API ก่อน");
      else if (data.error === "rate_limited") setNote(data.message ?? "เผยแพร่ถี่เกินไป รอสักครู่");
      else if (data.error === "REMOTE_CHANGED") {
        setNote("ยังไม่ได้เผยแพร่");
        setRemoteChanged(data.message ?? "มีคนแก้สคริปต์นี้บน script.google.com หลังจากที่ดึงมา");
      }
      else setNote("เผยแพร่ใหม่ไม่สำเร็จ ลองอีกครั้ง");
    } catch {
      setNote("เผยแพร่ใหม่ไม่สำเร็จ");
    } finally {
      setDeployBusy(false);
      setConfirmOpen(false);
    }
  }

  async function pullLatest() {
    setPulling(true);
    const r = await pullRemoteAction(projectId);
    setPulling(false);
    setRemoteChanged(null);
    setNote(r.ok ? "ดึงของล่าสุดจาก Google แล้ว โค้ดเดิมอยู่ในประวัติ" : r.error);
    if (r.ok) router.refresh();
  }

  return (
    <div className="flex flex-none flex-wrap items-center gap-1.5 border-b border-line bg-sunken px-3 py-1">
      {/* one group that shrinks, so a long /exec url is cut with … instead of pushing the buttons down */}
      <div className="flex min-w-0 flex-1 basis-64 items-center gap-1.5">
        <span className="shrink-0 text-[13px] font-medium text-accent-text">{githubHosting && pagesState?.pages ? "แอปบน GitHub Pages" : "แอปที่เผยแพร่แล้ว"}</span>
        <span className="hidden min-w-0 truncate font-mono text-xs text-muted md:block">{url}</span>
        {note && <span className="shrink-0 truncate text-xs text-muted">· {note}</span>}
      </div>

      <Tooltip
        label="เปิดดูโค้ดล่าสุด (/dev) โดยไม่ต้องเผยแพร่ใหม่ ต้องล็อกอิน Google เป็นเจ้าของ"
        placement="bottom"
        className="shrink-0"
      >
        <button
          onClick={openDev}
          disabled={devBusy}
          className="btn btn-ghost btn-sm"
        >
          <BoltIcon className={`h-4 w-4 ${devBusy ? "animate-pulse" : ""}`} />
          {devBusy ? "กำลังเปิด…" : "ลองโค้ดล่าสุด"}
        </button>
      </Tooltip>
      <Tooltip label="เผยแพร่โค้ดล่าสุดทับเวอร์ชันเดิม ลิงก์ไม่เปลี่ยน" placement="bottom" className="shrink-0">
        <button
          onClick={() => setConfirmOpen(true)}
          disabled={deployBusy}
          className="btn btn-ghost btn-sm"
        >
          <ArrowPathIcon className={`h-4 w-4 ${deployBusy ? "animate-spin" : ""}`} />
          {deployBusy ? "กำลังเผยแพร่…" : "เผยแพร่ใหม่"}
        </button>
      </Tooltip>
      <button
        onClick={copy}
        className="btn btn-ghost btn-sm shrink-0"
      >
        {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
        {copied ? "คัดลอกแล้ว" : "คัดลอกลิงก์"}
      </button>
      {githubHosting && pagesState?.pages && (
        <Tooltip label="ลิงก์เดียวกัน แต่ LINE จะเปิดในเบราว์เซอร์ของเครื่อง เพราะหน้าต่างใน LINE ใช้กล้องไม่ได้" placement="bottom" className="shrink-0">
          <button onClick={copyShare} className="btn btn-ghost btn-sm">
            {shareCopied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
            {shareCopied ? "คัดลอกแล้ว" : "ลิงก์สำหรับแชร์ใน LINE"}
          </button>
        </Tooltip>
      )}
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className="btn btn-secondary btn-sm shrink-0"
      >
        เปิดแอป <ArrowTopRightOnSquareIcon className="h-4 w-4" />
      </a>

      <ConfirmDialog
        open={confirmOpen}
        title="เผยแพร่โค้ดล่าสุดทับเวอร์ชันเดิม?"
        body={
          githubHosting ? (
            <>
              อัปเดตทั้งระบบหลังบ้านบน Google และหน้าเว็บบน GitHub Pages ด้วยโค้ดล่าสุด <b>ลิงก์เดิม</b>ยังใช้ได้
              <br />
              หน้าเว็บใช้เวลาอัปเดตประมาณ 1 นาที
            </>
          ) : (
            <>
              อัปเดตแอปที่เผยแพร่อยู่ด้วยโค้ดล่าสุด <b>ลิงก์เดิม</b>ยังใช้ได้ คนที่มีลิงก์อยู่แล้วไม่ต้องทำอะไร
              <br />
              ถ้าโค้ดไม่ได้เปลี่ยน จะไม่มีอะไรเกิดขึ้น
            </>
          )
        }
        confirmLabel="เผยแพร่ใหม่"
        busy={deployBusy}
        onConfirm={redeploy}
        onCancel={() => setConfirmOpen(false)}
      />
      <ConfirmDialog
        open={remoteChanged !== null}
        tone="amber"
        title="สคริปต์บน Google ถูกแก้หลังจากที่ดึงมา"
        body={
          <>
            {remoteChanged}
            <br />
            โค้ดที่แก้ในโปรแกรมตอนนี้จะถูกเก็บไว้ในประวัติ กดดูหรือกู้คืนได้ทีหลัง
          </>
        }
        confirmLabel="ดึงของล่าสุดจาก Google"
        cancelLabel="ยังไม่ดึง"
        busy={pulling}
        onConfirm={pullLatest}
        onCancel={() => setRemoteChanged(null)}
      />
    </div>
  );
}
