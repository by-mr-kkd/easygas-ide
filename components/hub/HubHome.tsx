"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowTopRightOnSquareIcon, DevicePhoneMobileIcon, EyeIcon, GlobeAltIcon, LockClosedIcon, PlusIcon, UserGroupIcon } from "@heroicons/react/24/outline";
import { hubCreateAction, hubJoinAction, hubListAction, type HubListData } from "@/app/projects/hub-actions";
import { HubEditor } from "./HubEditor";

const VIS_LABEL = { public: "สาธารณะ", unlisted: "เฉพาะคนมีลิงก์", pin: "ล็อก PIN" } as const;

/**
 * Home → "ฮับ": the user's hubs (หน้ารวมลิงก์ at easygaside.tech/hub/<name>) and the editor of one. Free accounts
 * get one hub; Pro more (the website decides — this screen only says so). Everything is loaded from a client
 * effect (a render never waits on the network).
 */
export function HubHome({ googleConnected, initialHub }: { googleConnected: boolean; initialHub: string | null }) {
  const [data, setData] = useState<HubListData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<string | null>(initialHub);
  const [title, setTitle] = useState("");
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<{ text: string; pro?: boolean; ok?: boolean } | null>(null);

  const load = useCallback(() => {
    setError(null);
    hubListAction()
      .then((r) => (r.ok ? setData(r.data) : setError(r.error)))
      .catch(() => setError("โหลดรายการฮับไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }, []);

  useEffect(() => {
    if (googleConnected) load();
  }, [googleConnected, load]);

  // the open hub rides in the address, so a reload (or the phone app) comes back to it
  useEffect(() => {
    const u = new URL(window.location.href);
    if (open) u.searchParams.set("hub", open);
    else u.searchParams.delete("hub");
    window.history.replaceState(null, "", u.toString());
  }, [open]);

  async function create() {
    setBusy(true);
    setNote(null);
    const r = await hubCreateAction(title.trim() || "หน้ารวมลิงก์ของฉัน").catch(() => null);
    setBusy(false);
    if (!r) return setNote({ text: "สร้างไม่สำเร็จ ลองใหม่อีกครั้ง" });
    if (!r.ok) return setNote({ text: r.error, pro: r.pro });
    setTitle("");
    setOpen(r.data.id);
  }

  async function join() {
    setBusy(true);
    setNote(null);
    const r = await hubJoinAction(token.trim()).catch(() => null);
    setBusy(false);
    if (!r?.ok) return setNote({ text: r?.error ?? "เข้าร่วมไม่สำเร็จ" });
    setToken("");
    setOpen(r.data.id);
  }

  if (!googleConnected) {
    return (
      <div className="card p-5">
        <p className="text-sm font-semibold">ฮับ · หน้ารวมลิงก์ของคุณ</p>
        <p className="hint mt-1">ฮับผูกกับบัญชี Google ที่เชื่อมในแอป (บัญชีเดียวกับชื่อผู้แชร์) เชื่อมบัญชีก่อนแล้วกลับมาที่นี่</p>
        <Link href="/settings?s=google" className="btn btn-primary btn-sm mt-3">
          เชื่อมบัญชี Google
        </Link>
      </div>
    );
  }

  if (open) return <HubEditor id={open} onBack={() => (setOpen(null), load())} onDeleted={() => (setOpen(null), load())} />;

  const owned = data?.hubs.filter((h) => h.role === "owner").length ?? 0;
  const atFreeLimit = !!data && !data.pro && owned >= 1;

  return (
    <div className="flex flex-col gap-4">
      <div className="card flex flex-col gap-3 p-4 sm:p-5">
        <div className="flex items-start gap-3">
          <span className="icon-chip tone-info h-10 w-10 shrink-0 rounded-[10px]">
            <GlobeAltIcon className="h-5 w-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <p className="text-[15px] font-semibold">ฮับ · หน้ารวมลิงก์ของคุณ</p>
            <p className="hint mt-0.5">
              รวมลิงก์ระบบทั้งหมดไว้หน้าเดียว เช่น ระบบงานโรงเรียน หรือลิงก์ส่วนตัว แล้วแชร์ลิงก์หรือ QR ให้คนอื่นเปิด
              {data && (data.pro ? " · Pro: สร้างได้หลายหน้า" : " · บัญชีฟรีสร้างได้ 1 หน้า")}
            </p>
          </div>
        </div>
        {atFreeLimit ? (
          <p className="callout flex-wrap items-center">
            <span className="min-w-0 flex-1">บัญชีฟรีมีฮับได้ 1 หน้า อัปเกรดเป็น Pro เพื่อสร้างหลายหน้า ล็อกด้วย PIN ดูสถิติ และชวนคนช่วยแก้</span>
            <Link href="/settings?s=premium&from=" className="btn btn-soft tone-warn btn-sm">
              ดู Pro
            </Link>
          </p>
        ) : (
          <div className="flex flex-wrap gap-2">
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && !busy && create()}
              maxLength={80}
              placeholder="ชื่อหน้า เช่น ระบบงานโรงเรียนบ้านนา"
              aria-label="ชื่อฮับใหม่"
              className="field min-w-0 flex-1 basis-56"
            />
            <button type="button" onClick={create} disabled={busy || !data} className="btn btn-primary">
              <PlusIcon className="h-4 w-4" />
              สร้างฮับ
            </button>
          </div>
        )}
        {note && (
          <p className={`text-sm ${note.ok ? "text-accent-text" : note.pro ? "text-warn" : "text-danger"}`}>
            {note.text}
            {note.pro && (
              <Link href="/settings?s=premium" className="link ml-2">
                ดู Pro
              </Link>
            )}
          </p>
        )}
      </div>

      {error ? (
        <p className="callout callout-warn flex-wrap items-center">
          <span className="min-w-0 flex-1">{error}</span>
          <button type="button" onClick={load} className="btn btn-secondary btn-sm">
            ลองใหม่
          </button>
        </p>
      ) : !data ? (
        <p className="hint px-1">กำลังโหลด…</p>
      ) : data.hubs.length === 0 ? (
        <p className="hint px-1">ยังไม่มีฮับ ตั้งชื่อแล้วกด “สร้างฮับ” ได้เลย</p>
      ) : (
        <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {data.hubs.map((h) => (
            <li key={h.id} className="card flex min-w-0 flex-col gap-3 p-4">
              <button type="button" onClick={() => setOpen(h.id)} className="flex min-w-0 items-start gap-3 text-left">
                <span className={`icon-chip h-10 w-10 shrink-0 rounded-[10px] ${h.disabled ? "tone-danger" : "tone-info"}`}>
                  {h.visibility === "pin" ? <LockClosedIcon className="h-5 w-5" /> : <GlobeAltIcon className="h-5 w-5" />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[15px] font-semibold">{h.title}</span>
                  <span className="block truncate font-mono text-[11.5px] text-muted">{h.url.replace(/^https:\/\//, "")}</span>
                </span>
              </button>
              <div className="flex flex-wrap items-center gap-1.5">
                <span className={`badge ${h.disabled ? "badge-warn" : "badge-ok"}`}>{h.disabled ? "ถูกปิดโดยผู้ดูแล" : VIS_LABEL[h.visibility]}</span>
                <span className="badge">
                  <EyeIcon className="h-3.5 w-3.5" /> {h.views.toLocaleString("th-TH")}
                </span>
                {h.role === "editor" && (
                  <span className="badge">
                    <UserGroupIcon className="h-3.5 w-3.5" /> ช่วยแก้
                  </span>
                )}
              </div>
              <div className="mt-auto flex flex-wrap gap-2">
                <button type="button" onClick={() => setOpen(h.id)} className="btn btn-primary btn-sm">
                  แก้ไข
                </button>
                <a href={h.url} target="_blank" rel="noreferrer" className="btn btn-secondary btn-sm">
                  เปิดหน้า <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
              </div>
            </li>
          ))}
        </ul>
      )}

      {data?.pro && (
        <p className="hint flex items-start gap-2 px-1 text-xs">
          <DevicePhoneMobileIcon className="mt-0.5 h-4 w-4 shrink-0" />
          ดูและแก้ฮับจากแอป EasyGAS Pro บนมือถือได้ แม้ปิดคอม: แอป Pro → ฮับ (ครั้งแรกเปิดคอมไว้ ระบบซิงก์ให้เอง)
        </p>
      )}

      <details className="card px-4 py-3">
        <summary className="cursor-pointer text-sm font-medium">มีรหัสเชิญให้ช่วยแก้ฮับของคนอื่น?</summary>
        <div className="mt-3 flex flex-wrap gap-2">
          <input value={token} onChange={(e) => setToken(e.target.value)} placeholder="hubinv_…" aria-label="รหัสเชิญ" className="field min-w-0 flex-1 basis-56 font-mono" />
          <button type="button" onClick={join} disabled={busy || !token.trim()} className="btn btn-secondary">
            <UserGroupIcon className="h-4 w-4" />
            เข้าร่วม
          </button>
        </div>
      </details>
    </div>
  );
}
