"use client";

import { useEffect, useState } from "react";
import { renameShareAuthorAction, shareAuthorAction } from "@/app/projects/share-actions";
import type { ShareAuthor } from "@/lib/share/author";

const thaiDate = (iso: string) => new Date(iso).toLocaleDateString("th-TH", { day: "numeric", month: "short", year: "numeric" });

/**
 * "ชื่อผู้แชร์": the name every shared project shows (lib/share/author.ts). It belongs to the Google account
 * above — by default its masked email — and changes here only, once every 30 days; the website then renames
 * every share and the board threads they opened. Loaded from a client effect (a render never waits on the net).
 */
export function ShareAuthorCard({ loggedIn }: { loggedIn: boolean }) {
  const [author, setAuthor] = useState<ShareAuthor | null>(null);
  const [error, setError] = useState("");
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState("");

  useEffect(() => {
    if (!loggedIn) return;
    let live = true;
    shareAuthorAction()
      .then((r) => {
        if (!live) return;
        if (r.ok) {
          setAuthor(r.data);
          setName(r.data.custom ?? "");
        } else setError(r.error);
      })
      .catch(() => live && setError("อ่านชื่อผู้แชร์ไม่สำเร็จ ลองเปิดหน้านี้ใหม่"));
    return () => {
      live = false;
    };
  }, [loggedIn]);

  async function save(next: string | null) {
    const label = next ?? author?.masked ?? "อีเมลแบบปิดบางส่วน";
    if (!window.confirm(`ใช้ชื่อ “${label}” กับทุกระบบที่แชร์?\nเปลี่ยนแล้ว เปลี่ยนอีกได้หลัง 30 วัน`)) return;
    setBusy(true);
    setError("");
    setSaved("");
    const r = await renameShareAuthorAction(next).catch(() => null);
    setBusy(false);
    if (!r) return setError("บันทึกไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setError(r.error);
    setAuthor(r.data);
    setName(r.data.custom ?? "");
    setSaved("บันทึกแล้ว ทุกระบบที่แชร์และกระทู้ของระบบเหล่านั้นใช้ชื่อนี้แล้ว");
  }

  const locked = !!author?.nextRenameAt;
  const changed = name.trim() !== (author?.custom ?? "");

  return (
    <div className="card px-4 py-4">
      <p className="text-sm font-semibold text-fg">ชื่อผู้แชร์</p>
      <p className="hint mt-1">
        ชื่อที่ขึ้นบนระบบที่คุณแชร์และกระทู้ของระบบนั้น ผูกกับบัญชี Google ด้านบน ชื่อเดียวกันทุกระบบ ไม่มีใครใช้ชื่อซ้ำได้
      </p>
      {!loggedIn ? (
        <p className="hint mt-2">เชื่อมบัญชี Google ก่อน แล้วชื่อผู้แชร์จะขึ้นที่นี่</p>
      ) : !author ? (
        <p className="hint mt-2">{error || "กำลังโหลด…"}</p>
      ) : (
        <div className="mt-3 space-y-2">
          <p className="text-sm">
            ตอนนี้แสดงเป็น <b className="font-semibold text-accent-text">{author.display}</b>
          </p>
          <div className="flex flex-wrap items-center gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              maxLength={40}
              disabled={locked || busy}
              placeholder={author.masked}
              aria-label="ชื่อที่แสดง"
              className="field min-w-0 flex-1 basis-48"
            />
            <button type="button" onClick={() => save(name.trim() || null)} disabled={locked || busy || !changed} className="btn btn-primary btn-sm">
              {busy ? "กำลังบันทึก…" : "บันทึกชื่อ"}
            </button>
          </div>
          {author.custom && !locked && (
            <button type="button" onClick={() => save(null)} disabled={busy} className="link text-xs">
              กลับไปใช้อีเมลแบบปิดบางส่วน ({author.masked})
            </button>
          )}
          <p className="hint text-xs">
            {locked ? `เปลี่ยนชื่อได้อีกครั้ง ${thaiDate(author.nextRenameAt!)}` : "เปลี่ยนได้ 30 วันครั้ง ระบบที่แชร์ไปแล้วเปลี่ยนชื่อตามทั้งหมด"}
          </p>
          {error && <p className="text-sm font-semibold text-danger">{error}</p>}
          {saved && <p className="text-sm font-semibold text-accent-text">{saved}</p>}
        </div>
      )}
    </div>
  );
}
