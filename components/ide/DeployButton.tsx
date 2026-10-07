"use client";

import { useEffect, useState } from "react";
import {
  ArrowTopRightOnSquareIcon,
  CheckCircleIcon,
  ClockIcon,
  ExclamationTriangleIcon,
  RocketLaunchIcon,
} from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";
import { ConfirmDialog } from "@/components/ui/ConfirmDialog";
import { Tooltip } from "@/components/ui/Tooltip";
import { PagesPublishPanel } from "@/components/pages/PagesPublishPanel";
import { pagesStateAction, type PagesState } from "@/app/pages/actions";
import { pullRemoteAction } from "@/app/projects/import-actions";
import { useRouter } from "next/navigation";

type Result =
  | { kind: "idle" }
  | { kind: "busy" }
  | {
      kind: "ok";
      execUrl?: string;
      needsTriggerSetup: boolean;
      scriptEditorUrl: string;
      scopesAdded: string[];
      probe?: { ok: boolean; error?: string; authRequired?: boolean; infraError?: boolean };
    }
  | { kind: "enable_api"; enableUrl: string; message: string }
  | { kind: "error"; message: string };

const ERR_MSG: Record<string, string> = {
  REMOTE_CHANGED: "มีคนแก้สคริปต์นี้บน script.google.com หลังจากที่ดึงมา ถ้าส่งขึ้นตอนนี้งานบน Google จะหาย ดึงของล่าสุดลงมาก่อน (โค้ดตอนนี้ถูกเก็บในประวัติ ย้อนกลับได้)",
  NOT_CONNECTED: "ยังไม่ได้เชื่อมบัญชี Google",
  NEEDS_REAUTH: "การเชื่อมต่อ Google หมดอายุ ต้องเชื่อมใหม่อีกครั้ง",
  GOOGLE_API_ERROR: "Google ตอบกลับผิดพลาด ลองใหม่อีกครั้ง",
  NO_FILES: "ยังไม่มีอะไรให้เผยแพร่ ให้ AI สร้างระบบก่อน",
  UNKNOWN: "เกิดข้อผิดพลาด ลองใหม่อีกครั้ง",
};

// Friendly Thai labels for scopes a redeploy may newly require (owner must re-authorize the script).
const SCOPE_LABELS: Record<string, string> = {
  "https://www.googleapis.com/auth/script.scriptapp": "ตั้งเวลา/แจ้งเตือนอัตโนมัติ",
  "https://www.googleapis.com/auth/script.send_mail": "ส่งอีเมล",
  "https://mail.google.com/": "ส่งอีเมล",
  "https://www.googleapis.com/auth/documents": "สร้างเอกสาร/PDF",
  "https://www.googleapis.com/auth/drive": "จัดการไฟล์ใน Drive",
  "https://www.googleapis.com/auth/drive.file": "ไฟล์ที่แอปสร้าง",
  "https://www.googleapis.com/auth/spreadsheets": "Google Sheets",
};
function scopeLabel(s: string): string {
  return SCOPE_LABELS[s] ?? s.replace("https://www.googleapis.com/auth/", "");
}

export function DeployButton({
  projectId,
  googleConnected = true,
  deployed = false,
  onDeployed,
  onConnectGoogle,
}: {
  projectId: string;
  googleConnected?: boolean;
  deployed?: boolean;
  onDeployed?: (execUrl: string) => void;
  /** Open the connect-Google dialog (the shell owns it, and re-requests the deploy afterwards). */
  onConnectGoogle?: () => void;
}) {
  const [res, setRes] = useState<Result>({ kind: "idle" });
  // the code that failed, so the result dialog can offer the matching fix (reconnect Google)
  const [errCode, setErrCode] = useState<string | null>(null);
  const [confirmOpen, setConfirmOpen] = useState(false);
  // "วางหน้าเว็บบน GitHub" (premium): null until loaded; hosting "gas" keeps the flow below unchanged
  const [pagesState, setPagesState] = useState<PagesState | null>(null);
  const [pagesOpen, setPagesOpen] = useState(false);
  const actionRequest = useProjectStore((s) => s.actionRequest);
  const clearActionRequest = useProjectStore((s) => s.clearActionRequest);
  const runAgent = useProjectStore((s) => s.runAgent);

  const loadPagesState = () => pagesStateAction(projectId).then(setPagesState).catch(() => {});
  useEffect(() => {
    void loadPagesState();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  const githubHosting = pagesState?.hosting === "github";

  /** The GitHub flow has its own dialog (premium + GitHub checks live there); the GAS flow confirms first. */
  function askToPublish() {
    // re-read first: the first camera request of a session switches the project to GitHub hosting after
    // this button mounted, and a stale state would publish to Google only
    void pagesStateAction(projectId)
      .then((s) => {
        setPagesState(s);
        if (s?.hosting === "github") setPagesOpen(true);
        else setConfirmOpen(true);
      })
      .catch(() => (githubHosting ? setPagesOpen(true) : setConfirmOpen(true)));
  }

  // command palette / connect-Google dialog → "เผยแพร่" (only dispatched once Google is connected)
  useEffect(() => {
    if (actionRequest !== "deploy" || res.kind === "busy") return;
    clearActionRequest();
    askToPublish(); // confirm first, then deploy
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [actionRequest]);

  async function deploy() {
    setConfirmOpen(false);
    setRes({ kind: "busy" });
    try {
      const r = await fetch(`/api/deploy/${projectId}`, { method: "POST" });
      const data = await r.json();
      if (r.ok) {
        setRes({
          kind: "ok",
          execUrl: data.execUrl,
          needsTriggerSetup: !!data.needsTriggerSetup,
          scriptEditorUrl: data.scriptEditorUrl,
          scopesAdded: Array.isArray(data.scopesAdded) ? data.scopesAdded : [],
          probe: data.probe,
        });
        if (data.execUrl) onDeployed?.(data.execUrl); // surface the URL in the persistent bar
      } else if (data.error === "USER_SETTINGS_DISABLED") {
        setRes({ kind: "enable_api", enableUrl: data.enableUrl, message: data.message });
      } else {
        setErrCode(typeof data.error === "string" ? data.error : null);
        setRes({ kind: "error", message: ERR_MSG[data.error] ?? data.error ?? "เกิดข้อผิดพลาด" });
      }
    } catch {
      setErrCode(null);
      setRes({ kind: "error", message: "เชื่อมต่อล้มเหลว ลองใหม่อีกครั้ง" });
    }
  }

  const needsGoogle = errCode === "NOT_CONNECTED" || errCode === "NEEDS_REAUTH";
  const router = useRouter();
  const [pulling, setPulling] = useState(false);
  async function pullLatest() {
    setPulling(true);
    const r = await pullRemoteAction(projectId);
    setPulling(false);
    if (!r.ok) {
      setRes({ kind: "error", message: r.error });
      return;
    }
    setRes({ kind: "idle" });
    router.refresh(); // the editor shows Google's copy; the AI can now redo the change on top of it
  }

  return (
    <>
      {!googleConnected ? (
        <Tooltip label="การเผยแพร่ต้องใช้บัญชี Google ของคุณ กดเพื่อเชื่อม" placement="bottom" className="shrink-0">
          <button type="button" onClick={onConnectGoogle} className="btn btn-primary btn-sm">
            <RocketLaunchIcon className="h-4 w-4 shrink-0" />
            เผยแพร่
          </button>
        </Tooltip>
      ) : deployed ? (
        <Tooltip label="เผยแพร่แล้ว ถ้าแก้โค้ดเพิ่ม กด “เผยแพร่ใหม่” ที่แถบด้านล่าง ลิงก์ยังเป็นลิงก์เดิม" placement="bottom" className="shrink-0">
          <span className="badge badge-ok h-[1.875rem] px-2.5 text-[13px]">
            <CheckCircleIcon className="h-4 w-4 shrink-0" />
            <span className="hidden sm:inline">เผยแพร่แล้ว</span>
          </span>
        </Tooltip>
      ) : (
        <button onClick={askToPublish} disabled={res.kind === "busy"} className="btn btn-primary btn-sm shrink-0">
          <RocketLaunchIcon className="h-4 w-4 shrink-0" />
          {res.kind === "busy" ? "กำลังเผยแพร่…" : "เผยแพร่"}
        </button>
      )}

      {pagesOpen && pagesState && (
        <div className="dialog-backdrop">
          <div role="dialog" aria-modal="true" className="dialog max-w-md p-5">
            <PagesPublishPanel
              projectId={projectId}
              state={pagesState}
              onStateChange={loadPagesState}
              onPublished={(o) => onDeployed?.(o.url)}
              onClose={() => setPagesOpen(false)}
            />
          </div>
        </div>
      )}

      <ConfirmDialog
        open={confirmOpen}
        title="เผยแพร่ขึ้นบัญชี Google ของคุณ?"
        body={
          <>
            แอปจะไปอยู่ในบัญชี Google ของคุณ พร้อมลิงก์สำหรับเปิดใช้งานจริง
            <br />
            ครั้งแรก Google จะถามขออนุญาตหนึ่งครั้ง
          </>
        }
        confirmLabel="เผยแพร่"
        onConfirm={deploy}
        onCancel={() => setConfirmOpen(false)}
      />

      {res.kind !== "idle" && res.kind !== "busy" && (
        <div className="dialog-backdrop">
          <div role="dialog" aria-modal="true" className="dialog max-w-md p-5">
            {res.kind === "ok" && (
              <div className="flex flex-col gap-3">
                <h3 className="flex items-center gap-2 text-[15px] font-semibold">
                  <CheckCircleIcon className="h-6 w-6 shrink-0 text-accent-text" />
                  เผยแพร่สำเร็จ แอปอยู่ในบัญชี Google ของคุณแล้ว
                </h3>
                {res.execUrl && (
                  <>
                    <a href={res.execUrl} target="_blank" rel="noreferrer" className="btn btn-primary">
                      เปิดแอปของคุณ <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                    </a>
                    <p className="break-all rounded-md bg-sunken px-2.5 py-1.5 font-mono text-xs text-muted">{res.execUrl}</p>
                  </>
                )}
                {res.probe &&
                  !res.probe.authRequired &&
                  (res.probe.ok ? (
                    <p className="hint">ลองเปิดหน้าแอปให้แล้ว เปิดได้ปกติ ยังไม่ได้ลองกดปุ่มหรือบันทึกข้อมูล</p>
                  ) : res.probe.infraError ? (
                    <p className="hint">หน้าแอปยังเปิดไม่ขึ้น อาจต้องรอสักครู่ ลองเปิดลิงก์เอง หรือกด “ทดสอบรันจริง” อีกครั้ง</p>
                  ) : (
                    <div className="callout callout-warn flex-col">
                      <span>เปิดแล้วเจอปัญหาตอนรัน: {res.probe.error}</span>
                      <button
                        onClick={() => {
                          setRes({ kind: "idle" });
                          runAgent("verify");
                        }}
                        className="btn btn-secondary btn-sm"
                      >
                        ให้ AI ทดสอบรันจริงและซ่อมให้
                      </button>
                    </div>
                  ))}
                <p className="hint">
                  ครั้งแรกที่เปิด Google จะขอสิทธิ์เข้าถึง เช่น Sheets หรือ Gmail ให้เจ้าของแอปกด{" "}
                  <b>Review permissions → Advanced → Allow</b> ครั้งเดียวพอ คนอื่นที่เปิดลิงก์ไม่ต้องกดอีก
                </p>
                {res.needsTriggerSetup && (
                  <div className="callout callout-warn">
                    <ClockIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      ระบบนี้มีการแจ้งเตือนหรือตั้งเวลา เปิดสคริปต์แล้วรันฟังก์ชัน <code className="font-mono">installTriggers()</code> ครั้งเดียวเพื่อเปิดใช้{" "}
                      <a href={res.scriptEditorUrl} target="_blank" rel="noreferrer" className="link">
                        เปิดสคริปต์
                      </a>
                    </span>
                  </div>
                )}
                {res.scopesAdded.length > 0 && (
                  <div className="callout callout-warn">
                    <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                    <span>
                      ฟีเจอร์ใหม่ต้องการสิทธิ์เพิ่ม: <b>{res.scopesAdded.map(scopeLabel).join(", ")}</b> เปิดแอปของคุณหลังอัปเดตนี้ ถ้าแอปขึ้นปุ่ม “กดอนุญาตสิทธิ์”
                      ให้กดครั้งเดียว (Advanced → Allow) แล้วใช้ได้เลย
                    </span>
                  </div>
                )}
                <button onClick={() => setRes({ kind: "idle" })} className="btn btn-secondary">
                  ปิด
                </button>
              </div>
            )}

            {res.kind === "enable_api" && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[15px] font-semibold">ต้องเปิด Apps Script API ก่อน (ทำครั้งเดียว)</h3>
                <p className="hint">{res.message}</p>
                <a href={res.enableUrl} target="_blank" rel="noreferrer" className="btn btn-secondary">
                  เปิดหน้าตั้งค่าของ Google <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                </a>
                <button onClick={deploy} className="btn btn-primary">
                  เปิดแล้ว ลองเผยแพร่อีกครั้ง
                </button>
                <button onClick={() => setRes({ kind: "idle" })} className="btn btn-ghost">
                  ปิด
                </button>
              </div>
            )}

            {res.kind === "error" && (
              <div className="flex flex-col gap-3">
                <h3 className="text-[15px] font-semibold text-danger">เผยแพร่ไม่สำเร็จ</h3>
                <p className="hint">{res.message}</p>
                {errCode === "REMOTE_CHANGED" && (
                  <button onClick={pullLatest} disabled={pulling} className="btn btn-primary">
                    {pulling ? "กำลังดึง…" : "ดึงของล่าสุดจาก Google"}
                  </button>
                )}
                {needsGoogle && onConnectGoogle && (
                  <button
                    onClick={() => {
                      setRes({ kind: "idle" });
                      onConnectGoogle();
                    }}
                    className="btn btn-primary"
                  >
                    เชื่อมบัญชี Google
                  </button>
                )}
                <button onClick={() => setRes({ kind: "idle" })} className="btn btn-secondary">
                  ปิด
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
