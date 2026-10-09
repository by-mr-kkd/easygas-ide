"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowTopRightOnSquareIcon, ClipboardDocumentIcon, DocumentDuplicateIcon, ExclamationTriangleIcon, MagnifyingGlassIcon } from "@heroicons/react/24/outline";
import { cloneShareAction, previewShareAction } from "@/app/projects/share-actions";
import type { SharePublic } from "@/lib/share/payload";
import { scopeLabel } from "@/lib/share/scan";

type Preview = { share: SharePublic; existing: { id: string; name: string }[] };

const kb = (n: number): string => (n < 1000 ? `${n} B` : `${Math.round(n / 100) / 10} KB`);

/**
 * Home → โคลนจากลิงก์: paste an EasyGAS share link (easygaside.tech/s/<slug> or easygas://clone/<slug>), see
 * what it is (files, permissions, the scanner's warnings), then clone it as a new project here. The same
 * screen serves the phone through the remote gateway. `initialLink` comes from the protocol handler
 * (?clone=<slug>) and is looked up at once.
 */
export function CloneFromLink({ initialLink = "" }: { initialLink?: string }) {
  const router = useRouter();
  const [link, setLink] = useState(initialLink);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState("");
  // the website said this share is Pro-only (its front page is on GitHub Pages)
  const [needsPro, setNeedsPro] = useState(false);
  const [busy, setBusy] = useState<"idle" | "preview" | "clone">("idle");
  const [showFiles, setShowFiles] = useState(false);
  const input = useRef<HTMLInputElement>(null);
  const run = useRef(0);

  const lookup = useCallback(async (value: string) => {
    const mine = ++run.current;
    const v = value.trim();
    setError("");
    setNeedsPro(false);
    setPreview(null);
    if (!v) return;
    setBusy("preview");
    const r = await previewShareAction(v).catch(() => null);
    if (mine !== run.current) return;
    setBusy("idle");
    if (!r) return setError("ติดต่อเว็บไซต์ไม่สำเร็จ ลองใหม่อีกครั้ง");
    if (!r.ok) {
      setNeedsPro(r.code === "pro");
      return setError(r.error);
    }
    setPreview(r.data);
  }, []);

  useEffect(() => {
    if (initialLink) void lookup(initialLink);
    else input.current?.focus();
  }, [initialLink, lookup]);

  async function paste() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) {
        setLink(text);
        void lookup(text);
      }
    } catch {
      input.current?.focus();
    }
  }

  async function clone() {
    if (!preview) return;
    setBusy("clone");
    setError("");
    const r = await cloneShareAction(link.trim()).catch(() => null);
    if (!r) {
      setBusy("idle");
      return setError("โคลนไม่สำเร็จ ลองใหม่อีกครั้ง");
    }
    if (!r.ok) {
      setBusy("idle");
      return setError(r.error);
    }
    router.push(`/projects/${r.data.projectId}`);
  }

  const s = preview?.share ?? null;

  return (
    <div className="mt-4 space-y-4">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          void lookup(link);
        }}
        className="flex flex-wrap gap-2"
      >
        <label htmlFor="share-link" className="sr-only">ลิงก์แชร์</label>
        <input
          ref={input}
          id="share-link"
          value={link}
          onChange={(e) => setLink(e.target.value)}
          placeholder="https://easygaside.tech/s/…"
          inputMode="url"
          autoComplete="off"
          spellCheck={false}
          className="field min-w-0 flex-1 font-mono text-sm"
        />
        <button type="button" onClick={paste} className="btn btn-secondary" title="วางจากคลิปบอร์ด">
          <ClipboardDocumentIcon className="h-4 w-4" />
          <span className="max-sm:hidden">วาง</span>
        </button>
        <button type="submit" disabled={busy !== "idle" || !link.trim()} className="btn btn-soft tone-info">
          <MagnifyingGlassIcon className="h-4 w-4" />
          {busy === "preview" ? "กำลังดู…" : "ดูรายละเอียด"}
        </button>
      </form>

      {error && (
        <p className="callout callout-warn text-sm" role="alert">
          {error}
          {needsPro && (
            <>
              {" "}
              <a href="/settings?s=premium" className="font-semibold underline underline-offset-4">
                ดู Pro
              </a>
            </>
          )}
        </p>
      )}

      {s && (
        <section aria-label="รายละเอียดโค้ดที่แชร์" className="card overflow-hidden p-0">
          <div className="flex flex-wrap items-start justify-between gap-3 border-b border-line p-4">
            <div className="min-w-0">
              <h2 className="text-lg font-semibold leading-snug [overflow-wrap:anywhere]">{s.title}</h2>
              <p className="hint mt-0.5">
                โดย {s.author.name}
                {s.author.kind === "pro" && <span className="ml-1 rounded bg-warn-soft px-1.5 py-px text-[10px] font-bold text-warn-text">PRO</span>}
                {s.author.kind === "admin" && <span className="ml-1 rounded bg-sunken px-1.5 py-px text-[10px] font-bold">แอดมิน</span>} · {s.fileCount} ไฟล์ · {kb(s.bytes)} · เวอร์ชัน {s.version} · โคลนแล้ว {s.cloneCount} ครั้ง
              </p>
            </div>
            {s.url && (
              <a href={s.url} target="_blank" rel="noreferrer" className="btn btn-ghost btn-sm">
                <ArrowTopRightOnSquareIcon className="h-4 w-4" />
                ดูบนเว็บ
              </a>
            )}
          </div>

          {s.description && <p className="whitespace-pre-wrap border-b border-line p-4 text-sm leading-relaxed">{s.description}</p>}

          <div className="grid gap-4 p-4 sm:grid-cols-2">
            <div>
              <p className="text-xs font-semibold text-muted">ไฟล์</p>
              <ul className="mt-1.5 space-y-1 font-mono text-[13px]">
                {s.files.map((f) => (
                  <li key={f.name} className="flex justify-between gap-3">
                    <span className="truncate">{f.name}</span>
                    <span className="shrink-0 text-muted">{f.source.split("\n").length} บรรทัด</span>
                  </li>
                ))}
              </ul>
            </div>
            <div>
              <p className="text-xs font-semibold text-muted">สิทธิ์ที่ Google จะถามตอนเผยแพร่</p>
              {s.scopes.length ? (
                <ul className="mt-1.5 space-y-1 text-[13px]">
                  {s.scopes.map((sc) => (
                    <li key={sc}>{scopeLabel(sc)}</li>
                  ))}
                </ul>
              ) : (
                <p className="hint mt-1.5">ไม่ได้ระบุไว้ Apps Script จะขอตามที่โค้ดใช้</p>
              )}
              {s.services.length > 0 && (
                <p className="mt-2 flex flex-wrap gap-1">
                  {s.services.map((x) => (
                    <span key={x} className="rounded-full bg-sunken px-2 py-px text-[11px]">{x}</span>
                  ))}
                </p>
              )}
            </div>
          </div>

          {s.warnings.length > 0 && (
            <div className="callout callout-warn mx-4 mb-4 items-start text-[13px]">
              <ExclamationTriangleIcon className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                <b>หลังโคลนต้องเปลี่ยนเป็นของคุณ:</b> {s.warnings.slice(0, 5).map((w) => `${w.kind} (${w.file}:${w.line})`).join(" · ")}
                {s.warnings.length > 5 && ` · และอีก ${s.warnings.length - 5} จุด`}
              </span>
            </div>
          )}

          <div className="border-t border-line p-4">
            <button type="button" onClick={() => setShowFiles((v) => !v)} className="link text-sm">
              {showFiles ? "ซ่อนโค้ด" : "อ่านโค้ดก่อนโคลน"}
            </button>
            {showFiles && (
              <div className="mt-3 space-y-3">
                {s.files.map((f) => (
                  <details key={f.name} className="rounded-lg border border-line">
                    <summary className="cursor-pointer px-3 py-2 font-mono text-xs">{f.name}</summary>
                    <pre className="max-h-72 overflow-auto border-t border-line bg-sunken p-3 text-[12px] leading-5">{f.source}</pre>
                  </details>
                ))}
              </div>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-line p-4">
            <button type="button" onClick={clone} disabled={busy !== "idle"} className="btn btn-primary">
              <DocumentDuplicateIcon className="h-4 w-4" />
              {busy === "clone" ? "กำลังโคลน…" : "โคลนเป็นโปรเจกต์ใหม่"}
            </button>
            {preview && preview.existing.length > 0 && (
              <span className="hint">
                เคยโคลนไว้แล้ว:{" "}
                {preview.existing.map((p, i) => (
                  <span key={p.id}>
                    {i > 0 && ", "}
                    <Link href={`/projects/${p.id}`} className="link">{p.name}</Link>
                  </span>
                ))}
              </span>
            )}
            <span className="hint ml-auto">ได้โค้ดในเครื่อง แล้วค่อย เผยแพร่ เข้าบัญชี Google ของคุณเอง</span>
          </div>
        </section>
      )}

      {!s && !error && busy === "idle" && (
        <p className="hint">
          ลิงก์มาจากปุ่ม <b>แชร์โปรเจกต์</b> ในโปรแกรมของคนอื่น หรือจากกระทู้ในห้อง แชร์ระบบที่สร้าง บนเว็บบอร์ด{" "}
          <a href="https://easygaside.tech/board/r/showcase" target="_blank" rel="noreferrer" className="link">ดูระบบที่คนอื่นแชร์ไว้ ↗</a>
        </p>
      )}
    </div>
  );
}
