"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon } from "@heroicons/react/24/outline";
import { aiQuotaAction, type QuotaResult } from "@/app/projects/quota-actions";
import { formatReset, quotaLevel, quotaSummary, type QuotaEngine } from "@/lib/quota";

const REFRESH_MS = 5 * 60 * 1000;

const LEVEL_DOT = { ok: "bg-accent", warn: "bg-warn-line", danger: "bg-danger" } as const;
const LEVEL_TEXT = { ok: "", warn: "text-warn-text", danger: "text-danger" } as const;

/**
 * "5 ชม. เหลือ 62% · รายสัปดาห์ เหลือ 80%" in the status bar for the AI in use, with the reset
 * times on hover; click to read again. Only the two monthly-plan AIs have a quota to show; for
 * Claude it appears once the switch in Settings is on, otherwise the entry points there.
 */
export function QuotaStatus({
  engine,
  claudeAllowed,
  settingsHref,
  quiet = false,
}: {
  engine: QuotaEngine;
  claudeAllowed: boolean;
  settingsHref: string;
  /** under the phone's chat box: faint text, only the dot shows the level */
  quiet?: boolean;
}) {
  const [result, setResult] = useState<QuotaResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const ref = useRef<HTMLDivElement>(null);
  const enabled = engine === "codex-cli" || claudeAllowed;

  const load = useCallback(
    async (force: boolean) => {
      setBusy(true);
      try {
        setResult(await aiQuotaAction(engine, force));
        setNow(Date.now());
      } catch {
        setResult({ ok: false, error: "อ่านโควตาไม่สำเร็จ" });
      } finally {
        setBusy(false);
      }
    },
    [engine],
  );

  useEffect(() => {
    if (!enabled) return;
    setResult(null);
    void load(false);
    const t = setInterval(() => void load(false), REFRESH_MS);
    return () => clearInterval(t);
  }, [enabled, load]);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", away);
    return () => document.removeEventListener("mousedown", away);
  }, [open]);

  if (!enabled) {
    return (
      <Link href={settingsHref} className="flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg" title="เปิดการแสดงโควตา Claude ได้ที่ ตั้งค่า → AI">
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" />
        โควตา: ปิดอยู่
      </Link>
    );
  }

  const level = result?.ok ? quotaLevel(result.info) : "ok";
  const text = result === null ? "กำลังอ่านโควตา…" : result.ok ? (result.info.windows.length ? quotaSummary(result.info) : "ไม่มีข้อมูลโควตา") : `โควตา: ${result.error}`;

  const windows = result?.ok ? result.info.windows : [];

  return (
    <div ref={ref} className="relative">
      {/* a wide window has room for every window with its bar and reset time; a narrower one gets one line */}
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className={`flex h-6 items-center gap-1.5 rounded px-1.5 transition hover:bg-sunken hover:text-fg ${windows.length && !quiet ? "xl:hidden" : ""} ${quiet ? "text-faint" : LEVEL_TEXT[level]}`}
      >
        <span className={`h-1.5 w-1.5 rounded-full ${result?.ok ? LEVEL_DOT[level] : "bg-line-strong"}`} />
        <span className="truncate">{text}</span>
      </button>
      {windows.length > 0 && !quiet && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          title="กดเพื่อดูรายละเอียดหรืออ่านใหม่"
          className="hidden h-6 items-center gap-3 rounded px-1.5 transition hover:bg-sunken hover:text-fg xl:flex"
        >
          {windows.map((w) => {
            const left = 100 - w.usedPercent;
            const tone = w.usedPercent >= 95 ? "bg-danger" : w.usedPercent >= 80 ? "bg-warn-line" : "bg-accent";
            const reset = formatReset(w.resetsAt, now);
            return (
              <span key={w.label} className="flex items-center gap-1.5 whitespace-nowrap">
                <span className="font-semibold text-fg">{w.label}</span>
                <span className="h-1.5 w-16 overflow-hidden rounded-full bg-sunken" aria-hidden>
                  <span className={`block h-full rounded-full ${tone}`} style={{ width: `${w.usedPercent}%` }} />
                </span>
                <span className={w.usedPercent >= 80 ? LEVEL_TEXT[w.usedPercent >= 95 ? "danger" : "warn"] : ""}>เหลือ {left}%</span>
                {reset && <span className="text-faint">· {reset}</span>}
              </span>
            );
          })}
        </button>
      )}
      {open && (
        <div role="dialog" aria-label="โควตาที่เหลือ" className="dialog absolute bottom-full left-0 z-40 mb-1.5 w-80 p-3 text-xs text-fg">
          <div className="flex items-center gap-2">
            <p className="text-[13px] font-semibold">
              โควตา {engine === "codex-cli" ? "Codex" : "Claude"}
              {result?.ok && result.info.plan && <span className="hint ml-1.5 font-normal">แพ็กเกจ {result.info.plan}</span>}
            </p>
            <span className="flex-1" />
            <button type="button" onClick={() => void load(true)} disabled={busy} className="btn btn-ghost btn-sm btn-icon" aria-label="อ่านใหม่">
              <ArrowPathIcon className={`h-3.5 w-3.5 ${busy ? "animate-spin" : ""}`} />
            </button>
          </div>
          {result?.ok ? (
            <ul className="mt-2 space-y-2">
              {result.info.windows.map((w) => {
                const left = 100 - w.usedPercent;
                const tone = w.usedPercent >= 95 ? "bg-danger" : w.usedPercent >= 80 ? "bg-warn-line" : "bg-accent";
                return (
                  <li key={w.label}>
                    <div className="flex items-baseline justify-between gap-2">
                      <span className="font-semibold">{w.label}</span>
                      <span className="hint whitespace-nowrap">{formatReset(w.resetsAt, now)}</span>
                    </div>
                    <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-sunken">
                      <div className={`h-full rounded-full ${tone}`} style={{ width: `${w.usedPercent}%` }} />
                    </div>
                    <p className="hint mt-1">
                      เหลือ <b className="text-fg">{left}%</b> · ใช้ไป {w.usedPercent}%
                    </p>
                  </li>
                );
              })}
              {result.info.windows.length === 0 && <li className="hint">ผู้ให้บริการไม่ได้ส่งตัวเลขมา</li>}
            </ul>
          ) : (
            <p className="hint mt-2">{result ? result.error : "กำลังอ่าน…"}</p>
          )}
          <p className="hint mt-2 text-faint">
            {engine === "codex-cli" ? "อ่านจาก Codex ในเครื่องโดยตรง" : "ถาม Anthropic ด้วยการล็อกอินของ Claude Code (1 คำขอเล็ก ๆ)"} · อัปเดตทุก 5 นาที
          </p>
        </div>
      )}
    </div>
  );
}
