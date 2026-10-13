"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, CheckIcon, GlobeAltIcon, PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { hubAddProjectAction, hubListForProjectAction } from "@/app/projects/hub-actions";
import { Portal } from "@/components/ui/Portal";

/**
 * "เพิ่มไปยังฮับ" from the projects list: pick one of my hubs and the project's link goes into it (first section).
 * No hub yet → "สร้างฮับ" makes one with this link and opens it in the ฮับ tab.
 */
export function AddToHubDialog({ project, onClose }: { project: { id: string; name: string }; onClose: () => void }) {
  const router = useRouter();
  const [list, setList] = useState<{ hubs: { id: string; title: string; url: string; has: boolean }[] } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [done, setDone] = useState<Record<string, "added" | "already">>({});

  useEffect(() => {
    void hubListForProjectAction(project.id)
      .then((r) => {
        if (!r.ok) return setError(r.error);
        setList(r.data);
        setDone(Object.fromEntries(r.data.hubs.filter((h) => h.has).map((h) => [h.id, "already" as const])));
      })
      .catch(() => setError("โหลดรายชื่อฮับไม่สำเร็จ ลองใหม่อีกครั้ง"));
  }, [project.id]);

  const openHub = (id: string) => router.push(`/projects?mode=hub&hub=${encodeURIComponent(id)}`);

  async function add(hubId: string | null) {
    setBusy(hubId ?? "new");
    setError(null);
    const r = await hubAddProjectAction(hubId, project.id).catch(() => null);
    setBusy(null);
    if (!r || !r.ok) return setError(r && !r.ok ? r.error : "เพิ่มไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!hubId) return openHub(r.data.hubId); // a new hub: open it
    setDone((d) => ({ ...d, [hubId]: r.data.already ? "already" : "added" }));
  }

  return (
    <Portal>
      <div className="dialog-backdrop" onClick={() => !busy && onClose()}>
        <div role="dialog" aria-modal="true" aria-label="เพิ่มไปยังฮับ" className="dialog max-w-md p-0" onClick={(e) => e.stopPropagation()}>
          <div className="flex items-center gap-2 border-b border-line px-5 py-3.5">
            <span className="icon-chip tone-info">
              <GlobeAltIcon className="h-4 w-4" />
            </span>
            <h3 className="min-w-0 flex-1 truncate text-[15px] font-semibold">เพิ่ม “{project.name}” ไปยังฮับ</h3>
            <button type="button" onClick={onClose} className="btn btn-ghost btn-sm btn-icon" aria-label="ปิด">
              <XMarkIcon className="h-4 w-4" />
            </button>
          </div>
          <div className="flex flex-col gap-2 px-5 py-4">
            {!list && !error && <p className="hint">กำลังโหลดฮับของคุณ…</p>}
            {list && list.hubs.length === 0 && (
              <>
                <p className="text-sm">ยังไม่มีฮับ — หน้ารวมลิงก์ทุกระบบไว้หน้าเดียว แชร์เป็นลิงก์หรือ QR ได้</p>
                <button type="button" onClick={() => void add(null)} disabled={!!busy} className="btn btn-primary self-start">
                  <PlusIcon className="h-4 w-4" />
                  {busy ? "กำลังสร้าง…" : "สร้างฮับพร้อมลิงก์นี้"}
                </button>
              </>
            )}
            {list && list.hubs.length > 0 && (
              <>
                <p className="hint">ลิงก์จะไปอยู่ในหมวดแรกของฮับ ย้ายหมวดหรือแก้ชื่อได้ในแท็บ ฮับ</p>
                <ul className="flex flex-col gap-1.5">
                  {list.hubs.map((h) => (
                    <li key={h.id} className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border border-line px-3 py-2.5">
                      <span className="min-w-[10rem] flex-1">
                        <span className="block truncate text-sm font-medium">{h.title}</span>
                        <span className="block truncate font-mono text-xs text-muted">{h.url.replace(/^https?:\/\//, "")}</span>
                      </span>
                      {done[h.id] ? (
                        <>
                          <span className="flex shrink-0 items-center gap-1 text-xs text-accent-text">
                            <CheckIcon className="h-4 w-4" />
                            {done[h.id] === "added" ? "เพิ่มแล้ว" : "อยู่ในฮับนี้แล้ว"}
                          </span>
                          <button type="button" onClick={() => openHub(h.id)} className="btn btn-secondary btn-sm shrink-0">
                            เปิดฮับ
                            <ArrowRightIcon className="h-4 w-4" />
                          </button>
                        </>
                      ) : (
                        <button type="button" onClick={() => void add(h.id)} disabled={!!busy} className="btn btn-secondary btn-sm">
                          {busy === h.id ? "กำลังเพิ่ม…" : "เพิ่ม"}
                        </button>
                      )}
                    </li>
                  ))}
                </ul>
                <div className="mt-1 flex flex-wrap items-center gap-2">
                  <button type="button" onClick={() => router.push("/projects?mode=hub")} className="link text-sm">
                    ไปที่แท็บ ฮับ
                  </button>
                </div>
              </>
            )}
            {error && <p className="callout callout-danger text-sm">{error}</p>}
          </div>
        </div>
      </div>
    </Portal>
  );
}
