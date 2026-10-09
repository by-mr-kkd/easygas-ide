"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckCircleIcon, CheckIcon, ClipboardIcon, ShieldCheckIcon } from "@heroicons/react/24/outline";
import { backendAuthAction, publishPagesAction, type PagesState } from "@/app/pages/actions";
import { GitHubConnect } from "@/components/pages/GitHubConnect";
import { UpgradeDialog } from "@/components/premium/UpgradeDialog";

/** The publish steps, in order, as the user sees them (the server reports none mid-way; this is a fixed script). */
const STEPS = ["เผยแพร่ระบบหลังบ้านบน Google", "แปลงหน้าเว็บเป็นไฟล์", "ส่งขึ้น GitHub", "รอ GitHub Pages สร้างหน้าเว็บ (ครั้งแรกประมาณ 1 นาที)"];

export type PagesPublishOutcome = { url: string; shareUrl: string; execUrl: string; built: boolean };

/**
 * Body of the publish dialog for a project with hosting === "github": the preconditions (premium, GitHub
 * account), the one-press publish with its progress script, and the result with the two links.
 */
export function PagesPublishPanel({
  projectId,
  state,
  googleEmail = null,
  onStateChange,
  onPublished,
  onClose,
}: {
  projectId: string;
  state: PagesState;
  /** the Google account that published (the one that must approve the backend) */
  googleEmail?: string | null;
  onStateChange: () => void;
  onPublished: (outcome: PagesPublishOutcome) => void;
  onClose: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<PagesPublishOutcome | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);

  async function publish() {
    setBusy(true);
    setError(null);
    const r = await publishPagesAction(projectId);
    setBusy(false);
    if (!r.ok) return setError(r.error);
    const outcome = { url: r.url, shareUrl: r.shareUrl, execUrl: r.execUrl, built: r.built };
    setResult(outcome);
    onPublished(outcome);
  }

  if (result) return <PagesResult result={result} projectId={projectId} googleEmail={googleEmail} onClose={onClose} />;

  if (!state.premium)
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-[15px] font-semibold">วางหน้าเว็บบน GitHub เป็นฟีเจอร์ของ Pro</h3>
        <p className="hint">
          Google ไม่ให้แอปที่อยู่บน Apps Script ใช้กล้อง หน้าเว็บของโปรเจกต์นี้จึงต้องไปอยู่บน GitHub Pages ของคุณ แล้วเรียกระบบหลังบ้านบน Google
        </p>
        <button type="button" onClick={() => setUpgradeOpen(true)} className="btn btn-primary">
          ดู Pro
        </button>
        <button type="button" onClick={onClose} className="btn btn-secondary">
          ปิด
        </button>
        <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="camera" onActivated={onStateChange} />
      </div>
    );

  if (!state.github.available || !state.github.connected)
    return (
      <div className="flex flex-col gap-3">
        <h3 className="text-[15px] font-semibold">เชื่อมบัญชี GitHub ก่อนเผยแพร่</h3>
        <GitHubConnect onChange={(s) => s.connected && onStateChange()} />
        <button type="button" onClick={onClose} className="btn btn-secondary">
          ปิด
        </button>
      </div>
    );

  return (
    <div className="flex flex-col gap-3">
      <h3 className="text-[15px] font-semibold">เผยแพร่ทั้งระบบหลังบ้านและหน้าเว็บ</h3>
      <p className="hint">
        ระบบหลังบ้านไปอยู่ในบัญชี Google ของคุณ หน้าเว็บไปอยู่ใน GitHub Pages ของ <b>@{state.github.login}</b> ครั้งแรกใช้เวลาประมาณ 1 นาที
      </p>
      <ol className="flex flex-col gap-1 text-sm">
        {STEPS.map((s, i) => (
          <li key={s} className={`flex items-center gap-2 ${busy ? "" : "text-muted"}`}>
            <span className="badge h-5 w-5 justify-center p-0 text-[11px]">{i + 1}</span>
            {s}
          </li>
        ))}
      </ol>
      <p className="hint">โค้ดของหน้าเว็บจะเป็นสาธารณะบน GitHub (ไม่รวมข้อมูลในชีตและโค้ดฝั่ง Google)</p>
      {error && <p className="text-sm text-danger">{error}</p>}
      <button type="button" onClick={publish} disabled={busy} className="btn btn-primary">
        {busy ? "กำลังเผยแพร่… อย่าปิดหน้านี้" : "เผยแพร่"}
      </button>
      <button type="button" onClick={onClose} disabled={busy} className="btn btn-secondary">
        ปิด
      </button>
    </div>
  );
}

function CopyButton({ text, label }: { text: string; label: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked; the link is visible */
    }
  }
  return (
    <button type="button" onClick={copy} className="btn btn-ghost btn-sm shrink-0">
      {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
      {copied ? "คัดลอกแล้ว" : label}
    </button>
  );
}

export function PagesResult({ result, projectId, googleEmail, onClose }: { result: PagesPublishOutcome; projectId: string; googleEmail?: string | null; onClose: () => void }) {
  // the owner's one-time approval of the backend: unknown until checked, then either done or still needed
  const [auth, setAuth] = useState<"unchecked" | "checking" | "ok" | "needed">("unchecked");
  const [authNote, setAuthNote] = useState<string | null>(null);

  async function recheck() {
    setAuth("checking");
    setAuthNote(null);
    const r = await backendAuthAction(projectId).catch(() => null);
    if (!r || r.status === "unknown") {
      setAuth("needed");
      setAuthNote(r?.message ?? "ยังตรวจไม่ได้ ลองอีกครั้งในอีกสักครู่ (แอปบน Google ตื่นช้าในครั้งแรก)");
      return;
    }
    setAuth(r.status === "ok" ? "ok" : "needed");
  }

  return (
    <div className="flex flex-col gap-3">
      <h3 className="flex items-center gap-2 text-[15px] font-semibold">
        <CheckCircleIcon className="h-6 w-6 shrink-0 text-accent-text" />
        เผยแพร่สำเร็จ หน้าเว็บอยู่บน GitHub Pages แล้ว
      </h3>

      <ol className="flex flex-col gap-3">
        {/* A backend that uses Sheets/Drive/Gmail answers "access denied" to everyone, the Pages copy included,
            until its owner approves Google's permission screen once (the GAS flow says the same). */}
        <li className={`rounded-xl border p-3 ${auth === "ok" ? "border-line bg-sunken" : "border-warn/40 bg-warn-soft"}`}>
          <div className="flex items-start gap-2.5">
            <span className={`badge mt-0.5 h-5 w-5 shrink-0 justify-center p-0 text-[11px] ${auth === "ok" ? "" : "bg-warn text-white"}`}>1</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">{auth === "ok" ? "อนุญาตระบบหลังบ้านแล้ว" : "อนุญาตระบบหลังบ้าน ครั้งเดียว (ยังไม่ได้ทำ)"}</p>
              {auth !== "ok" && (
                <p className="hint mt-0.5">
                  เปิดลิงก์ด้วยบัญชี Google {googleEmail ? <b className="text-fg">{googleEmail}</b> : "ที่ใช้เผยแพร่"} แล้วกด <b>Review permissions → Advanced → Allow</b> จนเห็นหน้าแจ้งว่าแอปอยู่บน GitHub
                  ถ้าข้ามขั้นนี้ หน้าเว็บจะขึ้นว่าเชื่อมต่อระบบหลังบ้านไม่ได้
                </p>
              )}
              {auth !== "ok" && (
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <a href={result.execUrl} target="_blank" rel="noreferrer" className="btn btn-primary btn-sm">
                    <ShieldCheckIcon className="h-4 w-4" />
                    เปิดหน้าอนุญาต <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                  </a>
                  <button type="button" onClick={recheck} disabled={auth === "checking"} className="btn btn-secondary btn-sm">
                    {auth === "checking" ? "กำลังตรวจ…" : "อนุญาตแล้ว ตรวจอีกครั้ง"}
                  </button>
                </div>
              )}
              {authNote && <p className="hint mt-1.5">{authNote}</p>}
            </div>
          </div>
        </li>
        <li className="rounded-xl border border-line p-3">
          <div className="flex items-start gap-2.5">
            <span className="badge mt-0.5 h-5 w-5 shrink-0 justify-center p-0 text-[11px]">2</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold">เปิดแอปของคุณ</p>
              <div className="mt-2 flex items-center gap-2">
                <p className="min-w-0 flex-1 break-all rounded-md bg-sunken px-2.5 py-1.5 font-mono text-xs text-muted">{result.url}</p>
                <CopyButton text={result.url} label="คัดลอก" />
              </div>
              <a href={result.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm mt-2">
                เปิดแอป <ArrowTopRightOnSquareIcon className="h-4 w-4" />
              </a>
              <div className="mt-3 flex flex-col gap-1">
                <span className="text-xs font-medium">ลิงก์สำหรับแชร์ใน LINE</span>
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 break-all rounded-md bg-sunken px-2.5 py-1.5 font-mono text-xs text-muted">{result.shareUrl}</p>
                  <CopyButton text={result.shareUrl} label="คัดลอก" />
                </div>
                <span className="hint">LINE จะเปิดลิงก์นี้ในเบราว์เซอร์ของเครื่อง เพราะหน้าต่างใน LINE ใช้กล้องไม่ได้</span>
              </div>
            </div>
          </div>
        </li>
      </ol>

      {!result.built && <p className="hint">GitHub ยังสร้างหน้าเว็บไม่เสร็จ รออีกสักครู่แล้วเปิดลิงก์อีกครั้ง</p>}
      <p className="hint">ครั้งแรกอาจต้องรอประมาณ 1 นาทีก่อนหน้าเว็บจะเปิดได้ โค้ดของหน้าเว็บเป็นสาธารณะบน GitHub · แถบเตือนเรื่องอนุญาตจะอยู่ใต้ลิงก์แอปจนกว่าจะทำเสร็จ</p>
      <button type="button" onClick={onClose} className="btn btn-secondary">
        ปิด
      </button>
    </div>
  );
}
