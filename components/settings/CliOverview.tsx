"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowDownTrayIcon, ArrowPathIcon, ArrowRightEndOnRectangleIcon, CheckCircleIcon, CommandLineIcon } from "@heroicons/react/24/outline";
import { CLI_INSTALL, type InstallableCli } from "@/lib/engines/cli-install";
import type { EngineId } from "@/lib/settings";
import { checkCli, openCli, useCliStatus } from "./cli-status";

const TOOLS: { tool: InstallableCli; engine: EngineId }[] = [
  { tool: "claude", engine: "claude-cli" },
  { tool: "codex", engine: "codex-cli" },
  { tool: "muse", engine: "muse-cli" },
];

type Tone = "ok" | "warn" | "muted";

/** What the row says, in plain words, and which tone its badge has. */
function describe(tool: InstallableCli, s: ReturnType<typeof useCliStatus>): { badge: string; tone: Tone; line: string | null } {
  if (!s.result && s.busy === "check") return { badge: "กำลังตรวจ…", tone: "muted", line: null };
  if (!s.isFound) return { badge: "ยังไม่ได้ติดตั้ง", tone: "warn", line: "ติดตั้งครั้งเดียว ใช้เวลาไม่กี่นาที ไม่ต้องใช้สิทธิ์ผู้ดูแลระบบ" };
  const r = s.result;
  const version = r?.version ? ` ${r.version}` : "";
  if (r && !r.version) return { badge: "เปิดไม่ได้", tone: "warn", line: "พบโปรแกรมแต่เปิดไม่สำเร็จ ลองติดตั้งใหม่" };
  if (r?.loggedIn === true) return { badge: "พร้อมใช้", tone: "ok", line: `ติดตั้งแล้ว${version} · ล็อกอินแล้ว${r.account ? ` (${r.account})` : ""}` };
  if (r?.loggedIn === false) return { badge: "ยังไม่ล็อกอิน", tone: "warn", line: `ติดตั้งแล้ว${version} · ล็อกอินด้วยบัญชี ${CLI_INSTALL[tool].plan}` };
  // Muse Code has no sign-in check the app can run
  return { badge: "ติดตั้งแล้ว", tone: "ok", line: `ติดตั้งแล้ว${version}${tool === "muse" ? " · แอปเช็คการล็อกอินของ Muse Code ไม่ได้ ถ้ายังไม่เคยล็อกอิน กด ล็อกอิน" : ""}` };
}

const BADGE: Record<Tone, string> = { ok: "badge badge-ok", warn: "badge badge-warn", muted: "badge" };

function Row({ tool, engine, found, current, onUse }: { tool: InstallableCli; engine: EngineId; found: boolean; current: boolean; onUse: (e: EngineId) => void }) {
  const info = CLI_INSTALL[tool];
  const router = useRouter();
  const s = useCliStatus(tool, found);
  const [confirming, setConfirming] = useState(false);
  const d = describe(tool, s);
  const ready = s.isFound && (s.result?.loggedIn === true || (s.result?.loggedIn === null && !!s.result?.version));
  const needsLogin = s.isFound && !!s.result?.version && s.result.loggedIn !== true;
  const needsInstall = !s.isFound || (s.result !== null && !s.result.version);
  const busy = s.busy !== null;

  return (
    <li className="px-4 py-3">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className={`icon-chip shrink-0 ${ready ? "tone-accent" : "tone-info"}`}>
          {ready ? <CheckCircleIcon className="h-4 w-4" aria-hidden /> : <CommandLineIcon className="h-4 w-4" aria-hidden />}
        </span>
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 text-sm font-semibold text-fg">
            {info.name}
            <span className={BADGE[d.tone]}>{d.badge}</span>
            {current && <span className="badge">กำลังใช้</span>}
          </p>
          {d.line && <p className="hint mt-0.5">{d.line}</p>}
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-1.5">
          {needsInstall && !confirming && (
            <button type="button" onClick={() => setConfirming(true)} disabled={busy || s.watching === "install"} className="btn btn-primary btn-sm">
              <ArrowDownTrayIcon className="h-4 w-4" />
              {s.watching === "install" ? "กำลังรอติดตั้ง…" : s.isFound ? "ติดตั้งใหม่" : "ติดตั้ง"}
            </button>
          )}
          {needsLogin && (
            <button
              type="button"
              onClick={() => void openCli(tool, "login")}
              disabled={busy || s.watching === "login"}
              className={`btn btn-sm ${s.result?.loggedIn === false ? "btn-primary" : "btn-secondary"}`}
            >
              <ArrowRightEndOnRectangleIcon className="h-4 w-4" />
              {s.watching === "login" ? "กำลังรอล็อกอิน…" : "ล็อกอิน"}
            </button>
          )}
          {ready && !current && (
            <button type="button" onClick={() => onUse(engine)} className="btn btn-secondary btn-sm">
              ใช้ตัวนี้
            </button>
          )}
          <button
            type="button"
            onClick={async () => {
              await checkCli(tool);
              router.refresh();
            }}
            disabled={busy}
            title="ตรวจอีกครั้ง"
            aria-label={`ตรวจ ${info.name} อีกครั้ง`}
            className="btn btn-ghost btn-sm btn-icon"
          >
            <ArrowPathIcon className={`h-4 w-4 ${s.busy === "check" || s.watching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {confirming && (
        <div className="callout mt-2 block">
          <p className="text-[13px]">
            แอปจะเปิดหน้าต่าง PowerShell แล้วรันตัวติดตั้งของ {info.vendor} ด้วยคำสั่งนี้ คุณจะเห็นทุกอย่างที่เกิดขึ้นในหน้าต่างนั้น
          </p>
          <code className="mt-1.5 block select-all break-all rounded-lg border border-line bg-sunken px-3 py-1.5 font-mono text-[12.5px] text-fg">{info.command}</code>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setConfirming(false);
                void openCli(tool, "install");
              }}
              className="btn btn-primary btn-sm"
            >
              ติดตั้งเลย
            </button>
            <button type="button" onClick={() => setConfirming(false)} className="btn btn-secondary btn-sm">
              ยกเลิก
            </button>
          </div>
        </div>
      )}
      {s.message && (
        <p className="mt-1.5 pl-11 text-[13px] font-medium text-fg" aria-live="polite">
          {s.message}
        </p>
      )}
    </li>
  );
}

/**
 * Settings → AI, at the top: the three AI programs that use a monthly plan — installed or not, signed in
 * or not — each with the one next step as its main button (ติดตั้ง → ล็อกอิน → ใช้ตัวนี้). Every program is
 * checked when the page opens, whichever AI is chosen below.
 */
export function CliOverview({ found, engine, onUse }: { found: Record<InstallableCli, boolean>; engine: EngineId; onUse: (e: EngineId) => void }) {
  return (
    <section className="card overflow-hidden" aria-labelledby="cli-overview-title">
      <div className="border-b border-line px-4 py-3">
        <h2 id="cli-overview-title" className="text-sm font-semibold text-fg">
          โปรแกรม AI ในเครื่อง
        </h2>
        <p className="hint mt-0.5">ใช้แพ็กเกจรายเดือนที่คุณมีอยู่แล้ว ติดตั้งและล็อกอินครั้งเดียว ไม่มีค่าใช้จ่ายเพิ่ม</p>
      </div>
      <ul className="divide-y divide-line">
        {TOOLS.map((t) => (
          <Row key={t.tool} tool={t.tool} engine={t.engine} found={found[t.tool]} current={engine === t.engine} onUse={onUse} />
        ))}
      </ul>
    </section>
  );
}
