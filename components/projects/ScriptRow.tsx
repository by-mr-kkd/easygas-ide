"use client";

import { useState } from "react";
import {
  ArrowDownTrayIcon,
  ArrowPathIcon,
  ArrowTopRightOnSquareIcon,
  CodeBracketIcon,
  ComputerDesktopIcon,
  EyeIcon,
  EyeSlashIcon,
  FolderOpenIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import { deleteProjectAction } from "@/app/projects/actions";
import {
  checkWithGoogleAction,
  openProjectFolderAction,
  pullRemoteAction,
  setScriptHiddenAction,
} from "@/app/projects/import-actions";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import type { PublishInfo } from "@/lib/publish-info";
import type { GoogleCheck, GoogleScript } from "@/lib/import";
import type { SyncStatus } from "@/lib/sync-status";

const ORIGIN: Record<"created" | "imported", { label: string; cls: string }> = {
  created: { label: "สร้างด้วย EasyGAS", cls: "badge badge-ok" },
  imported: { label: "แก้ไขด้วย EasyGAS", cls: "badge tone-info" },
};

const SYNC: Record<SyncStatus, { text: string; cls: string }> = {
  same: { text: "ตรงกับตัวล่าสุดบน Google แล้ว", cls: "text-accent-text" },
  google_newer: { text: "บน Google มีโค้ดใหม่กว่าในเครื่อง", cls: "text-warn-text" },
  local_newer: { text: "ในเครื่องมีที่แก้แล้วยังไม่ได้เผยแพร่ขึ้น Google", cls: "text-info" },
  both: { text: "มีการแก้ทั้งในเครื่องและบน Google", cls: "text-warn-text" },
};

function editedAgo(iso: string): string {
  if (!iso) return "";
  const d = Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
  if (Number.isNaN(d)) return "";
  if (d < 1) return "แก้ล่าสุดวันนี้";
  if (d < 30) return `แก้ล่าสุด ${d} วันที่แล้ว`;
  if (d < 365) return `แก้ล่าสุด ${Math.floor(d / 30)} เดือนที่แล้ว`;
  return `แก้ล่าสุด ${Math.floor(d / 365)} ปีที่แล้ว`;
}

function PublishBadge({ info }: { info: PublishInfo | null | undefined }) {
  if (info === undefined) return <span className="badge text-faint">กำลังเช็คการเผยแพร่…</span>;
  if (info === null) return null; // could not be read: no claim either way
  if (info.kind === "none") return <span className="badge">ยังไม่เผยแพร่</span>;
  return (
    <span className="badge badge-ok">
      เผยแพร่แล้ว{info.kind === "webapp" ? " · เว็บแอป" : ""}
      {info.version ? ` v${info.version}` : ""}
    </span>
  );
}

/**
 * One script on the "แก้ไขสคริปต์ที่มีอยู่" page: what it is (published? made or edited here? on this
 * computer?), the main action (แก้ไข = pull it down / เปิด = open the local project), and the tools:
 * compare with Google, take Google's copy, open the folder, remove the local copy, hide from the list.
 */
export function ScriptRow({
  script,
  publish,
  busy,
  importing,
  onImport,
  onOpen,
  onHiddenChange,
  onLocalRemoved,
}: {
  script: GoogleScript;
  publish: PublishInfo | null | undefined;
  /** an import is running (any row) / this row is the one being pulled down */
  busy: boolean;
  importing: boolean;
  onImport: () => void;
  onOpen: () => void;
  onHiddenChange: (hidden: boolean) => void;
  onLocalRemoved: () => void;
}) {
  const [tool, setTool] = useState<"check" | "update" | "delete" | null>(null);
  const [check, setCheck] = useState<GoogleCheck | null | undefined>(undefined);
  const [note, setNote] = useState("");
  const [confirmDelete, setConfirmDelete] = useState(false);
  const local = script.projectId;

  async function compare() {
    if (!local) return;
    setTool("check");
    setNote("");
    const r = await checkWithGoogleAction(local).catch(() => null);
    setTool(null);
    if (!r) return setNote("เช็คไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) return setNote(r.error);
    setCheck(r.data);
    if (r.data === null) setNote("โปรเจกต์ที่วางหน้าเว็บบน GitHub เช็คแบบนี้ไม่ได้");
  }

  async function update() {
    if (!local) return;
    if (!confirm("อัปเดตโค้ดในเครื่องเป็นตัวล่าสุดจาก Google?\nโค้ดในเครื่องตอนนี้ถูกเก็บไว้ในประวัติ ย้อนกลับได้")) return;
    setTool("update");
    setNote("");
    const r = await pullRemoteAction(local).catch(() => null);
    setTool(null);
    if (!r?.ok) return setNote(r?.error ?? "อัปเดตไม่สำเร็จ ลองใหม่อีกครั้ง");
    setCheck({ status: "same", canUpdate: false });
    setNote("อัปเดตแล้ว โค้ดเดิมอยู่ในประวัติของโปรเจกต์");
  }

  async function openFolder() {
    if (!local) return;
    const r = await openProjectFolderAction(local).catch(() => null);
    if (!r?.ok) setNote(r?.error ?? "เปิดโฟลเดอร์ไม่สำเร็จ");
  }

  async function removeLocal() {
    if (!local) return;
    setTool("delete");
    try {
      await deleteProjectAction(local);
      setConfirmDelete(false);
      setCheck(undefined);
      onLocalRemoved();
    } catch {
      setNote("ลบไม่สำเร็จ ลองใหม่อีกครั้ง");
    } finally {
      setTool(null);
    }
  }

  async function toggleHidden() {
    const r = await setScriptHiddenAction(script.id, !script.hidden).catch(() => null);
    if (r?.ok) onHiddenChange(!script.hidden);
    else setNote("บันทึกไม่สำเร็จ");
  }

  const sync = check ? SYNC[check.status] : null;
  const ago = editedAgo(script.modifiedTime);

  return (
    <li className={`flex items-start gap-3 px-4 py-3 sm:px-5 ${script.hidden ? "opacity-60" : ""}`}>
      <CodeBracketIcon className="mt-0.5 h-4 w-4 shrink-0 text-muted" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-medium text-fg">{script.name}</p>
        <div className="mt-1 flex flex-wrap gap-1">
          <PublishBadge info={publish} />
          {script.badge && <span className={ORIGIN[script.badge].cls}>{ORIGIN[script.badge].label}</span>}
          {local && (
            <span className="badge tone-accent">
              <ComputerDesktopIcon className="h-3.5 w-3.5" />
              มีในเครื่องแล้ว
            </span>
          )}
          {script.hidden && <span className="badge">ซ่อนอยู่</span>}
        </div>
        {ago && <p className="mt-1 text-xs text-faint">{ago}</p>}

        <div className="mt-1.5 flex flex-wrap items-center gap-1">
          {local && (
            <>
              <button type="button" onClick={compare} disabled={tool !== null} className="btn btn-ghost btn-sm !px-2">
                <ArrowPathIcon className={`h-4 w-4 text-info ${tool === "check" ? "animate-spin" : ""}`} />
                {tool === "check" ? "กำลังเช็ค…" : "เช็คกับ Google"}
              </button>
              {check?.canUpdate && (
                <button type="button" onClick={update} disabled={tool !== null} className="btn btn-secondary btn-sm">
                  <ArrowDownTrayIcon className="h-4 w-4" />
                  {tool === "update" ? "กำลังอัปเดต…" : "อัปเดตจาก Google"}
                </button>
              )}
              <button type="button" onClick={openFolder} className="btn btn-ghost btn-sm !px-2">
                <FolderOpenIcon className="h-4 w-4 text-muted" />
                เปิดโฟลเดอร์
              </button>
            </>
          )}
          {publish?.url && (
            <a href={publish.url} target="_blank" rel="noopener noreferrer" className="btn btn-ghost btn-sm !px-2">
              <ArrowTopRightOnSquareIcon className="h-4 w-4 text-muted" />
              เปิดแอป
            </a>
          )}
          <a
            href={`https://script.google.com/d/${script.id}/edit`}
            target="_blank"
            rel="noopener noreferrer"
            className="btn btn-ghost btn-sm !px-2"
          >
            <ArrowTopRightOnSquareIcon className="h-4 w-4 text-muted" />
            เปิดบน Google
          </a>
          <button type="button" onClick={toggleHidden} className="btn btn-ghost btn-sm !px-2">
            {script.hidden ? <EyeIcon className="h-4 w-4 text-muted" /> : <EyeSlashIcon className="h-4 w-4 text-muted" />}
            {script.hidden ? "แสดง" : "ซ่อน"}
          </button>
          {local && (
            <button type="button" onClick={() => setConfirmDelete(true)} className="btn btn-ghost btn-sm !px-2 text-danger">
              <TrashIcon className="h-4 w-4" />
              ลบออกจากเครื่อง
            </button>
          )}
        </div>
        {sync && !note && <p className={`mt-0.5 text-xs ${sync.cls}`}>{sync.text}</p>}
        {note && <p className="mt-0.5 text-xs text-muted">{note}</p>}
      </div>

      {local ? (
        <button type="button" onClick={onOpen} className="btn btn-secondary btn-sm shrink-0">
          เปิด
        </button>
      ) : (
        <button type="button" onClick={onImport} disabled={busy} className="btn btn-secondary btn-sm shrink-0">
          {importing ? "กำลังดึง…" : "แก้ไข"}
        </button>
      )}

      <ConfirmDialog
        open={confirmDelete}
        tone="amber"
        title="ลบโปรเจกต์นี้ออกจากเครื่อง?"
        body={
          <>
            เอาโปรเจกต์นี้ออกจากโปรแกรมเท่านั้น สคริปต์และแอปบน <b>Google ยังอยู่และใช้งานได้ตามเดิม</b> จะดึงลงมาแก้อีกเมื่อไหร่ก็ได้
            <br />
            ถ้าจะลบบน Google ด้วย กด “เปิดบน Google” แล้วลบที่นั่น
          </>
        }
        confirmLabel="ลบออกจากเครื่อง"
        busy={tool === "delete"}
        onConfirm={removeLocal}
        onCancel={() => setConfirmDelete(false)}
      />
    </li>
  );
}
