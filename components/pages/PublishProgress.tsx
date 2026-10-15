"use client";

import { useEffect, useState } from "react";
import { CheckIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { UI_STEPS } from "@/lib/pages/progress";

/** the shape both progress stores answer (lib/pages/progress, lib/deploy-progress) */
type Progress = { startedAt: number; step: string; at: Partial<Record<string, number>>; detail: string | null; finishedAt: number | null; error: string | null };
type Steps = { label: string; steps: string[] }[];

/** short lines shown while GitHub builds the page (the longest wait), one every few seconds */
const WHILE_YOU_WAIT = [
  "ครั้งแรก GitHub ใช้เวลาประมาณ 1 นาที ครั้งต่อไปเร็วกว่านี้",
  "ลิงก์สำหรับ LINE จะเปิดในเบราว์เซอร์ให้เอง เพราะหน้าต่างใน LINE ใช้กล้องไม่ได้",
  "หน้าเว็บบน GitHub ไม่มีแถบเตือนของ Google ด้านบน",
  "ข้อมูลในชีตยังอยู่ในบัญชี Google ของคุณ GitHub เก็บแค่หน้าเว็บ",
];

const clock = (ms: number) => {
  const s = Math.max(0, Math.floor(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

/**
 * The publish as it really goes: the server records each step (lib/pages/progress.ts for GitHub Pages, lib/deploy-progress.ts
 * for Google) and this polls `endpoint` while `running`. Done steps show how long they took; the current one its live
 * time and detail. `slowStep` is the step that waits longest (its creep is slower and it shows the tips).
 */
export function PublishProgress({
  projectId,
  running,
  endpoint = "/api/pages-progress",
  steps = UI_STEPS,
  tips = WHILE_YOU_WAIT,
  slowStep = 3,
  firstDetail = "ส่งโค้ดขึ้น Google และอัปเดตเวอร์ชันที่เผยแพร่",
}: {
  projectId: string;
  running: boolean;
  endpoint?: string;
  steps?: Steps;
  tips?: string[];
  slowStep?: number;
  firstDetail?: string;
}) {
  const [p, setP] = useState<Progress | null>(null);
  const [skew, setSkew] = useState(0); // server clock − this clock
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    if (!running) return;
    let stop = false;
    const startedHere = Date.now();
    async function poll() {
      try {
        const r = await fetch(`${endpoint}/${projectId}`, { cache: "no-store" });
        const j = (await r.json()) as { progress: Progress | null; now: number };
        // a progress from an earlier publish is ignored until this one starts. Server times are on the server's
        // clock: a server stamp t means client time t - skew, so the bar is accepted when t - skew >= startedHere - 10 s
        // (a phone whose clock ran ahead of the computer's never passed the old check and sat at 0:00 until the end)
        const skewNow = j.now - Date.now();
        if (!stop && j.progress && j.progress.startedAt - skewNow >= startedHere - 10_000) {
          setP(j.progress);
          setSkew(j.now - Date.now());
        }
      } catch {
        /* the next poll tries again */
      }
      if (!stop) setTimeout(poll, 700);
    }
    void poll();
    const tick = setInterval(() => setNow(Date.now()), 250);
    return () => {
      stop = true;
      clearInterval(tick);
    };
  }, [projectId, running, endpoint]);

  const serverNow = now + skew;
  const current = p ? steps.findIndex((s) => s.steps.includes(p.step)) : running ? 0 : -1;
  const finished = !!p?.finishedAt;
  const failed = !!p?.error;
  const startOf = (i: number) => {
    const ts = steps[i].steps.map((s) => p?.at[s]).filter((x): x is number => !!x);
    return ts.length ? Math.min(...ts) : null;
  };
  const endOf = (i: number) => (i + 1 < steps.length ? startOf(i + 1) : (p?.finishedAt ?? null));
  // the bar: whole steps done + a slow creep inside the current one (never reaching the next)
  const creep = current >= 0 && !finished ? Math.min(0.85, (serverNow - (startOf(current) ?? serverNow)) / (current === slowStep ? 60_000 : 20_000)) : 0;
  const pct = finished && !failed ? 100 : Math.round(((Math.max(0, current) + creep) / steps.length) * 100);
  const tip = tips[Math.floor(serverNow / 6000) % tips.length];

  return (
    <div className="flex flex-col gap-2.5">
      {running || p ? (
        <div className="flex items-center gap-2.5">
          <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-sunken" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
            <div className={`h-full rounded-full transition-all duration-700 ${failed ? "bg-danger" : "bg-accent"}`} style={{ width: `${Math.max(4, pct)}%` }} />
          </div>
          <span className="w-10 text-right font-mono text-xs tabular-nums text-muted">{p ? clock((p.finishedAt ?? serverNow) - p.startedAt) : "0:00"}</span>
        </div>
      ) : null}
      <ol className="flex flex-col gap-1.5 text-sm">
        {steps.map((s, i) => {
          const state = !running && !p ? "idle" : failed && i === current ? "failed" : i < current || (finished && !failed) ? "done" : i === current ? "active" : "pending";
          const start = startOf(i);
          const end = endOf(i);
          return (
            <li key={s.label} className={`flex items-start gap-2.5 ${state === "pending" || state === "idle" ? "text-muted" : ""}`}>
              <span
                className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold transition-all duration-300 ${
                  state === "done"
                    ? "scale-100 bg-accent text-white"
                    : state === "failed"
                      ? "bg-danger text-white"
                      : state === "active"
                        ? "border-2 border-accent border-t-transparent animate-spin"
                        : "bg-sunken"
                }`}
              >
                {state === "done" ? <CheckIcon className="h-3.5 w-3.5" /> : state === "failed" ? <XMarkIcon className="h-3.5 w-3.5" /> : state === "active" ? null : i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <span className="flex items-baseline gap-2">
                  <span className={state === "active" ? "font-medium" : ""}>{s.label}</span>
                  {state === "done" && start && end && <span className="font-mono text-[11px] text-muted">{((end - start) / 1000).toFixed(1)} วิ</span>}
                  {state === "active" && start && <span className="font-mono text-[11px] text-accent-text">{clock(serverNow - start)}</span>}
                </span>
                {state === "active" && (
                  <span className="hint block text-xs">{p?.detail ?? (i === 0 ? firstDetail : "กำลังทำ…")}</span>
                )}
                {state === "active" && i === slowStep && <span className="hint block text-xs italic">{tip}</span>}
                {state === "failed" && p?.error && <span className="block text-xs text-danger">{p.error}</span>}
              </span>
            </li>
          );
        })}
      </ol>
    </div>
  );
}
