"use client";

import { useState } from "react";
import { ArrowTopRightOnSquareIcon, CheckIcon, ClipboardIcon } from "@heroicons/react/24/outline";

/**
 * The two addresses of a published web app, each with what it is for (lib/run-link.ts):
 *   run.easygaside.tech/…  — for sharing: opens in any browser, even one signed in to several Google accounts
 *   script.google.com/…/exec — Google's own: the owner's first "Allow", embedding elsewhere
 * An app that needs a Google sign-in has only the second.
 */
export function AppLinks({ runUrl, execUrl, authorized = true }: { runUrl: string | null; execUrl: string; authorized?: boolean }) {
  return (
    <div className="flex flex-col gap-2.5">
      {runUrl && (
        <LinkRow
          title="ลิงก์สำหรับแชร์"
          tag="แนะนำ"
          url={runUrl}
          text="ส่งลิงก์นี้ให้คนใช้งาน เปิดได้ทุกเครื่อง แม้ในเบราว์เซอร์ที่ล็อกอิน Google หลายบัญชี และไม่มีแถบเตือนของ Google"
          canOpen={authorized}
          closedText="เปิดได้หลังกดอนุญาตครั้งแรก"
        />
      )}
      <LinkRow
        title="ลิงก์ Google (ตัวจริง)"
        url={execUrl}
        text={
          runUrl
            ? "ใช้ตอนกดอนุญาตครั้งแรก หรือฝังในเว็บอื่น เช่น Google Sites · เบราว์เซอร์ที่ล็อกอิน Google หลายบัญชีอาจขึ้นว่าเปิดไฟล์ไม่ได้"
            : "แอปนี้ให้ผู้ใช้ล็อกอิน Google ก่อนใช้ จึงต้องใช้ลิงก์นี้ · ถ้าเบราว์เซอร์ล็อกอินหลายบัญชีแล้วเปิดไม่ได้ ให้เปิดในหน้าต่างไม่ระบุตัวตน"
        }
        canOpen
      />
    </div>
  );
}

function LinkRow({ title, tag, url, text, canOpen, closedText }: { title: string; tag?: string; url: string; text: string; canOpen: boolean; closedText?: string }) {
  const [copied, setCopied] = useState(false);
  async function copy() {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked */
    }
  }
  return (
    <div className="rounded-lg border border-line p-3">
      <p className="flex items-center gap-2 text-[13px] font-semibold">
        {title}
        {tag && <span className="badge badge-ok">{tag}</span>}
      </p>
      <p className="hint mt-0.5 text-xs">{text}</p>
      <p className="mt-2 break-all rounded-md bg-sunken px-2 py-1.5 font-mono text-[11.5px] text-muted">{url}</p>
      <div className="mt-2 flex flex-wrap items-center gap-2">
        <button type="button" onClick={copy} className="btn btn-secondary btn-sm">
          {copied ? <CheckIcon className="h-4 w-4" /> : <ClipboardIcon className="h-4 w-4" />}
          {copied ? "คัดลอกแล้ว" : "คัดลอก"}
        </button>
        {canOpen ? (
          <a href={url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
            เปิด <ArrowTopRightOnSquareIcon className="h-4 w-4" />
          </a>
        ) : (
          <span className="hint text-xs">{closedText}</span>
        )}
      </div>
    </div>
  );
}
