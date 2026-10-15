"use client";

import {
  ArrowRightIcon,
  ArrowTopRightOnSquareIcon,
  BeakerIcon,
  BugAntIcon,
  CheckIcon,
  EyeIcon,
  LightBulbIcon,
  RocketLaunchIcon,
  ShareIcon,
  WrenchScrewdriverIcon,
} from "@heroicons/react/24/outline";
import type { ReactNode } from "react";
import { useProjectStore } from "@/store/useProjectStore";

export type PublishedState = { state: "none" | "current" | "changed"; url: string | null; shared?: boolean };

/**
 * "แนะนำให้ทำต่อ" under the chat (redesign 2026-10-15, the user's pick from the mock-ups): the APP's next steps, never
 * read from the AI's text.
 * - a one-line overview strip (สร้าง → ตรวจ → เผยแพร่ → แชร์, muted; the current step in the info blue)
 * - ONE recommended action as the big green card, chosen from what the app knows — leftover findings → fix them;
 *   not published → publish; code newer than the app → publish the update; up to date → open the app — with the reason
 *   under it
 * - every other action as a small pill in the "หรือ" row (the live test stays offered, never run by itself)
 */
export function NextSteps({
  published,
  engineReady,
  onSend,
  onVerify,
}: {
  published: PublishedState | null;
  engineReady: boolean;
  onSend: (text: string) => void;
  onVerify: () => void;
}) {
  const requestAction = useProjectStore((s) => s.requestAction);
  const runAgent = useProjectStore((s) => s.runAgent);
  const clearIssues = useProjectStore((s) => s.clearIssues);
  const issues = useProjectStore((s) => s.issues);
  const flat = Object.values(issues).flat();
  const openShare = () => window.dispatchEvent(new CustomEvent("egs:share-open"));

  // the same repair request the issues panel sends (IssuesPanel.fixAll)
  function fixIssues() {
    const lines = flat.map((i) => `- ${i.file}${i.line ? `:${i.line}` : ""} ${i.problem}${i.fix ? ` (แนวทาง: ${i.fix})` : ""}`);
    runAgent("send", "ช่วยแก้จุดที่ตรวจพบต่อไปนี้ให้เรียบร้อยด้วย edit_file/write_file แล้วสรุปสั้น ๆ ว่าแก้อะไรบ้าง:\n" + lines.join("\n"));
    clearIssues();
  }

  const state = published?.state ?? "none";
  const url = published?.url ?? null;
  const shared = !!published?.shared;
  const checked = flat.length === 0;
  const live = state === "current" && !!url;

  // the overview: which of the four steps are done; the current one is the first that is not
  const steps: { label: string; done: boolean }[] = [
    { label: "สร้าง", done: true },
    { label: "ตรวจ", done: checked },
    { label: "เผยแพร่", done: state === "current" },
    { label: "แชร์", done: shared },
  ];
  const current = steps.findIndex((s) => !s.done);
  const stepNo = current < 0 ? steps.length : current + 1;

  // the one recommendation
  type Hero = { key: string; icon: ReactNode; title: string; sub: string; why: string; onClick?: () => void; href?: string; disabled?: boolean };
  const hero: Hero = !checked
    ? {
        key: "fix",
        icon: <WrenchScrewdriverIcon className="h-6 w-6" />,
        title: `แก้ ${flat.length} จุดที่ตรวจพบ`,
        sub: "ให้ AI แก้ให้ตามแนวทางที่ตรวจเจอ",
        why: "เพราะการตรวจซ้ำยังเหลือจุดที่ควรแก้",
        onClick: fixIssues,
        disabled: !engineReady,
      }
    : state === "none"
      ? {
          key: "publish",
          icon: <RocketLaunchIcon className="h-6 w-6" />,
          title: "เผยแพร่",
          sub: "ได้ลิงก์ให้คนอื่นเปิดใช้ · ประมาณ 1 นาที",
          why: "เพราะแอปยังไม่ได้เผยแพร่ ตอนนี้มีแต่พรีวิวจำลอง",
          onClick: () => requestAction("publish"),
        }
      : state === "changed"
        ? {
            key: "update",
            icon: <RocketLaunchIcon className="h-6 w-6" />,
            title: "เผยแพร่อัปเดต",
            sub: "ลิงก์เดิมใช้ได้ต่อ · ประมาณ 1 นาที",
            why: "เพราะโค้ดใหม่กว่าแอปที่คนใช้อยู่ตอนนี้",
            onClick: () => requestAction("publish"),
          }
        : {
            key: "open",
            icon: <ArrowTopRightOnSquareIcon className="h-6 w-6" />,
            title: "เปิดแอป",
            sub: shared ? "แอปและลิงก์แชร์ใช้โค้ดล่าสุดแล้ว" : "ลองใช้ของจริง แล้วแชร์ให้คนอื่นโคลนได้",
            why: "เพราะแอปที่เผยแพร่อยู่ใช้โค้ดล่าสุดแล้ว",
            href: url ?? undefined,
          };

  // everything else, as small pills
  const alts: { key: string; icon: ReactNode; label: string; tone?: string; onClick?: () => void; href?: string; disabled?: boolean; title?: string }[] = [
    { key: "preview", icon: <EyeIcon className="h-3.5 w-3.5" />, label: "ดูพรีวิว", onClick: () => requestAction("view:preview") },
    {
      key: "explain",
      icon: <LightBulbIcon className="h-3.5 w-3.5" />,
      label: "อธิบายโค้ด",
      tone: "text-info",
      disabled: !engineReady,
      title: "ให้ AI สรุปเป็นข้อ ๆ ว่าโค้ดในโปรเจกต์นี้ทำงานอย่างไร อ่านอย่างเดียว ไม่แก้ไฟล์",
      onClick: () => onSend("อธิบายว่าโค้ดในโปรเจกต์นี้ทำงานยังไง แบบสรุปสั้น ๆ เป็นข้อ ๆ"),
    },
    ...(url
      ? [
          {
            key: "verify",
            icon: <BeakerIcon className="h-3.5 w-3.5" />,
            label: state === "changed" ? "เผยแพร่แล้วทดสอบรันจริง" : "ทดสอบรันจริง",
            tone: "text-ai",
            disabled: !engineReady,
            title: (state === "changed" ? "เผยแพร่โค้ดล่าสุดก่อน (ลิงก์เดิม) แล้ว" : "") + "เปิดแอปจริง ให้ AI เลือกฟังก์ชันที่ปลอดภัยมาลองเรียกและอ่าน log ถ้าพังจะแก้และเผยแพร่ใหม่ให้เอง (ใช้โควตา AI ไม่อยากให้ทดสอบก็ข้ามได้)",
            onClick: onVerify,
          },
        ]
      : []),
    {
      key: "bugs",
      icon: <BugAntIcon className="h-3.5 w-3.5" />,
      label: "ตรวจหาบั๊ก",
      tone: "text-warn-text",
      disabled: !engineReady,
      title: "ให้ AI อ่านโค้ดทั้งหมดหาบั๊กและจุดที่ผิดหลัก Apps Script แล้วแก้ให้ (อ่านโค้ด ไม่ได้รันจริง) ของเดิมย้อนได้จากประวัติ",
      onClick: () => onSend("ตรวจโค้ดทั้งหมดหาบั๊กและจุดที่ไม่ตรง best practice ของ Google Apps Script แล้วแก้ให้เรียบร้อย"),
    },
    ...(hero.key !== "publish" && hero.key !== "update" && state !== "current"
      ? [{ key: "publish", icon: <RocketLaunchIcon className="h-3.5 w-3.5" />, label: state === "changed" ? "เผยแพร่อัปเดต" : "เผยแพร่", tone: "text-accent-text", onClick: () => requestAction("publish") }]
      : []),
    ...(hero.key !== "open" && live ? [{ key: "open", icon: <ArrowTopRightOnSquareIcon className="h-3.5 w-3.5" />, label: "เปิดแอป", tone: "text-accent-text", href: url ?? undefined }] : []),
    ...(live ? [{ key: "share", icon: <ShareIcon className="h-3.5 w-3.5" />, label: shared ? "อัปเดตลิงก์แชร์" : "แชร์ให้คนอื่นโคลน", onClick: openShare }] : []),
  ];

  const pill = "inline-flex h-8 items-center gap-1.5 rounded-full border border-line bg-surface px-2.5 text-[13px] font-semibold text-fg hover:border-line-strong hover:bg-sunken disabled:opacity-50";
  const heroInner = (
    <>
      <span className="grid h-11 w-11 flex-none place-items-center rounded-xl bg-white/20">{hero.icon}</span>
      <span className="min-w-0 flex-1 text-left">
        <span className="block text-base font-bold leading-tight">{hero.title}</span>
        <span className="block text-xs opacity-90">{hero.sub}</span>
      </span>
      <ArrowRightIcon className="next-hero-go h-5 w-5 flex-none" />
    </>
  );

  return (
    <div className="space-y-3 pt-1">
      {/* the overview strip */}
      <div className="flex items-center gap-3 rounded-xl border border-line bg-surface px-3 py-2">
        <span className="flex-none text-[11px] leading-tight text-faint">
          <b className="block text-xs font-semibold text-muted">ภาพรวมของโปรเจกต์</b>ขั้น {stepNo} จาก {steps.length}
        </span>
        <ol className="flex min-w-0 flex-1 items-center" aria-label="ขั้นตอนของโปรเจกต์">
          {steps.map((s, i) => (
            <li key={s.label} className="contents">
              {i > 0 && <span className={`mb-[13px] h-[1.5px] flex-1 ${steps[i - 1].done ? "bg-line-strong" : "bg-line"}`} style={{ margin: "0 -6px 13px" }} />}
              <span className={`flex w-12 flex-none flex-col items-center gap-0.5 text-[10px] ${i === current ? "font-semibold text-info" : "text-faint"}`} aria-current={i === current ? "step" : undefined}>
                <span
                  className={`grid h-5 w-5 place-items-center rounded-full border-[1.5px] text-[10px] font-bold ${
                    s.done ? "border-line bg-line text-muted" : i === current ? "border-info bg-surface text-info shadow-[0_0_0_3px_var(--info-soft)]" : "border-line-strong bg-surface text-faint"
                  }`}
                >
                  {s.done ? <CheckIcon className="h-3 w-3" strokeWidth={2.5} /> : i + 1}
                </span>
                {s.label}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {/* the recommendation */}
      <div>
        <p className="mb-2 text-xs font-semibold text-muted">แนะนำให้ทำต่อ</p>
        {hero.href ? (
          <a href={hero.href} target="_blank" rel="noreferrer" className="next-hero flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-on-accent">
            {heroInner}
          </a>
        ) : (
          <button type="button" onClick={hero.onClick} disabled={hero.disabled} className="next-hero flex w-full items-center gap-3 rounded-2xl bg-accent px-4 py-3.5 text-on-accent disabled:opacity-60">
            {heroInner}
          </button>
        )}
        <p className="mt-1.5 flex items-center gap-1.5 text-xs text-muted">
          <span className="h-[7px] w-[7px] flex-none rounded-full bg-warn-line" aria-hidden="true" />
          {hero.why}
        </p>
      </div>

      {/* the rest */}
      <div className="flex flex-wrap items-center gap-1.5 text-[13px] text-muted">
        {alts.map((a) =>
          a.href ? (
            <a key={a.key} href={a.href} target="_blank" rel="noreferrer" className={`${pill} ${a.tone ?? ""}`}>
              {a.icon}
              {a.label}
            </a>
          ) : (
            <button key={a.key} type="button" onClick={a.onClick} disabled={a.disabled} title={a.title} className={`${pill} ${a.tone ?? ""}`}>
              {a.icon}
              {a.label}
            </button>
          ),
        )}
      </div>
    </div>
  );
}
