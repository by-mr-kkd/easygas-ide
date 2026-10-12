"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CodeBracketIcon, DevicePhoneMobileIcon, LockClosedIcon, PlusIcon, TableCellsIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { newProjectReturnId } from "@/app/projects/actions";
import { UpgradeDialog } from "@/components/premium/UpgradeDialog";
import { USE_LIST, type ProjectUse } from "@/lib/project-use";

const NAME_MAX = 80;
const ICON: Record<ProjectUse, typeof CodeBracketIcon> = { google: CodeBracketIcon, sheet: TableCellsIcon, github: DevicePhoneMobileIcon };

/**
 * "สร้างโปรเจกต์ใหม่": a name and "ใช้งานผ่านอะไร" (lib/project-use.ts), then the code screen — where the user
 * talks to the AI. The use is asked here because the AI must know from its first line whether the code lives
 * in a Sheet (getActiveSpreadsheet) or on its own. GitHub Pages is Pro: a free install sees it and can pick it,
 * and the button becomes "ปลดล็อก Pro". Scripts from Google and share links are views of the home screen.
 */
export function CreateProjectDialog({
  existingNames,
  pro,
  githubConnected,
  onClose,
}: {
  existingNames: string[];
  pro: boolean;
  githubConnected: boolean;
  onClose: () => void;
}) {
  const router = useRouter();
  const nameRef = useRef<HTMLInputElement>(null);
  const [name, setName] = useState("");
  const [use, setUse] = useState<ProjectUse>("google");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [upgradeOpen, setUpgradeOpen] = useState(false);
  const [proNow, setProNow] = useState(pro);
  const clean = name.replace(/\s+/g, " ").trim();
  const duplicate = clean !== "" && existingNames.includes(clean);
  const locked = use === "github" && !proNow;

  useEffect(() => {
    nameRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !pending && !upgradeOpen) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose, pending, upgradeOpen]);

  async function submit() {
    if (pending) return;
    if (locked) return setUpgradeOpen(true);
    if (!clean) {
      setError("ตั้งชื่อโปรเจกต์ก่อน");
      nameRef.current?.focus();
      return;
    }
    setPending(true);
    setError(null);
    try {
      const r = await newProjectReturnId(clean, use);
      if ("error" in r) {
        setPending(false);
        setError(r.error);
        return;
      }
      // stays pending on purpose: the page is navigating away
      router.push(`/projects/${r.id}`);
    } catch {
      setPending(false);
      setError("สร้างโปรเจกต์ไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  return createPortal(
    <div className="dialog-backdrop" onMouseDown={() => !pending && !upgradeOpen && onClose()}>
      <form
        role="dialog"
        aria-modal="true"
        aria-labelledby="create-title"
        className="dialog flex max-w-2xl flex-col gap-4 p-5"
        onMouseDown={(e) => e.stopPropagation()}
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <div className="flex items-center gap-2.5">
          <span className="icon-chip tone-accent">
            <PlusIcon className="h-4 w-4" />
          </span>
          <h2 id="create-title" className="text-lg font-semibold">
            สร้างโปรเจกต์ใหม่
          </h2>
          <button type="button" onClick={onClose} disabled={pending} aria-label="ปิด" className="btn btn-ghost btn-sm btn-icon ml-auto">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>

        <div className="flex flex-col gap-1.5">
          <label htmlFor="create-name" className="text-[13px] font-medium">
            ชื่อโปรเจกต์
          </label>
          <input
            id="create-name"
            ref={nameRef}
            value={name}
            maxLength={NAME_MAX}
            onChange={(e) => {
              setName(e.target.value);
              setError(null);
            }}
            placeholder="เช่น ระบบจองคิวร้านตัดผม"
            className="field h-11 text-[15px]"
            disabled={pending}
          />
          <p className="hint text-xs">
            {duplicate ? `มีโปรเจกต์ชื่อนี้แล้ว จะตั้งเป็น “${clean} (2)”` : "ใช้เป็นชื่อสคริปต์บน Google ตอนเผยแพร่ครั้งแรกด้วย · เปลี่ยนชื่อในแอปทีหลังได้"}
          </p>
        </div>

        <fieldset className="flex flex-col gap-2">
          <legend className="mb-2 text-[13px] font-medium">ใช้งานผ่านอะไร</legend>
          <div className="grid gap-2 sm:grid-cols-3">
            {USE_LIST.map((u) => {
              const Icon = ICON[u.id];
              const on = use === u.id;
              const proTone = u.pro && !proNow;
              return (
                <label
                  key={u.id}
                  className={`flex cursor-pointer flex-col gap-1 rounded-lg border p-3 transition ${
                    on ? (proTone ? "border-warn-line ring-2 ring-warn-soft" : "border-accent ring-2 ring-accent-soft") : "border-line-strong hover:border-accent"
                  }`}
                >
                  <span className="flex items-center gap-2">
                    <input type="radio" name="use" value={u.id} checked={on} onChange={() => setUse(u.id)} disabled={pending} className="accent-[var(--accent)]" />
                    <Icon className="h-4 w-4 text-muted" aria-hidden />
                    {u.pro && <span className="pro-badge">PRO</span>}
                  </span>
                  <span className="text-[13.5px] font-semibold leading-snug">{u.label}</span>
                  <span className="hint text-xs">{u.hint}</span>
                </label>
              );
            })}
          </div>
          {use === "github" && proNow && !githubConnected && (
            <p className="callout callout-warn text-[13px]">
              <span className="min-w-0 flex-1">สร้างได้เลย แต่ก่อนเผยแพร่ต้องเชื่อมบัญชี GitHub ที่</span>
              <Link href="/settings?s=premium" className="link">
                ตั้งค่า → Pro
              </Link>
            </p>
          )}
          {locked && (
            <p className="callout callout-warn items-center text-[13px]">
              <LockClosedIcon className="h-4 w-4 shrink-0" />
              <span className="min-w-0 flex-1">แบบนี้ใช้ได้ใน EasyGAS Pro · ถ้ายังไม่พร้อม เลือก “ลิงก์หน้าเว็บของ Google” ไปก่อน แล้วเปลี่ยนทีหลังได้จนกว่าจะเผยแพร่</span>
            </p>
          )}
        </fieldset>

        {error && (
          <p role="alert" className="callout callout-danger">
            {error}
          </p>
        )}

        <div className="flex items-center justify-end gap-2 border-t border-line pt-3">
          <button type="button" onClick={onClose} disabled={pending} className="btn btn-secondary">
            ยกเลิก
          </button>
          {locked ? (
            <button type="submit" className="btn btn-warn">
              <LockClosedIcon className="h-4 w-4" />
              ปลดล็อก Pro
            </button>
          ) : (
            <button type="submit" disabled={pending} className="btn btn-primary">
              {pending ? "กำลังสร้าง…" : "สร้างแล้วเปิด"}
              {!pending && <ArrowRightIcon className="h-4 w-4" />}
            </button>
          )}
        </div>
      </form>
      <UpgradeDialog open={upgradeOpen} onClose={() => setUpgradeOpen(false)} reason="pages" onActivated={() => setProNow(true)} />
    </div>,
    document.body,
  );
}
