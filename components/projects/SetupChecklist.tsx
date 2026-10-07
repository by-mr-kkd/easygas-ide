import Link from "next/link";
import type { ReactNode } from "react";
import { CheckCircleIcon } from "@heroicons/react/24/outline";
import type { SetupStatus } from "@/lib/setup-status";

function Row({
  done,
  blocking = false,
  title,
  hint,
  action,
}: {
  done: boolean;
  /** only for a step that stops the user from building — the one place this card uses warn colours */
  blocking?: boolean;
  title: string;
  hint: string;
  action?: ReactNode;
}) {
  return (
    <li
      className={`flex flex-col gap-2.5 border-t border-line px-4 py-3 sm:flex-row sm:items-center sm:gap-4 ${
        blocking ? "bg-warn-soft" : ""
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        {done ? (
          <CheckCircleIcon className="mt-px h-5 w-5 shrink-0 text-accent" aria-hidden />
        ) : (
          <span
            className={`m-0.5 mt-[3px] h-4 w-4 shrink-0 rounded-full border-2 ${
              blocking ? "border-warn-line" : "border-line-strong"
            }`}
            aria-hidden
          />
        )}
        <div className="min-w-0">
          <div className={`text-sm font-semibold ${blocking ? "text-warn-text" : ""}`}>
            {title}
            <span className="sr-only">{done ? " (เสร็จแล้ว)" : " (ยังไม่ได้ทำ)"}</span>
          </div>
          <p className={`hint break-words ${blocking ? "text-warn-text" : ""}`}>{hint}</p>
        </div>
      </div>
      {/* under the text on a narrow window, lined up with it */}
      {action && <div className="shrink-0 pl-[1.875rem] sm:pl-0">{action}</div>}
    </li>
  );
}

/** First-run steps on the projects home. The page renders it only while a step is still open. */
export function SetupChecklist({ setup }: { setup: SetupStatus }) {
  const { engineReady, google } = setup;
  return (
    <section className="card overflow-hidden" aria-labelledby="setup-title" data-tour="setup">
      <h2 id="setup-title" className="px-4 py-2.5 text-sm font-semibold">
        เริ่มต้นใช้งาน
      </h2>
      <ul>
        <Row
          done={engineReady}
          blocking={!engineReady}
          title="ตั้งค่า AI"
          hint={engineReady ? setup.engineLabel : (setup.engineHint ?? "")}
          action={
            !engineReady && (
              <Link href="/settings?s=ai" className="btn btn-primary btn-sm">
                ตั้งค่า AI
              </Link>
            )
          }
        />
        <Row
          done={google.loggedIn}
          title="เชื่อมบัญชี Google"
          hint={
            google.loggedIn
              ? (google.email ?? "เชื่อมต่อแล้ว")
              : "ใช้ตอนเผยแพร่เท่านั้น ยังไม่เชื่อมก็สร้างและแก้ได้ตามปกติ"
          }
          action={
            !google.loggedIn && (
              <Link href="/settings?s=google" className="btn btn-secondary btn-sm">
                เชื่อมต่อ
              </Link>
            )
          }
        />
      </ul>
    </section>
  );
}
