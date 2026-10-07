"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, LightBulbIcon, PlusIcon, QueueListIcon, Squares2X2Icon } from "@heroicons/react/24/outline";
import { newProjectReturnId } from "@/app/projects/actions";

const NAME_MAX = 60;
const WIZARD_PROJECT_NAME = "โปรเจกต์ใหม่";

const EXAMPLES = [
  "ระบบจองคิวร้านตัดผม ลูกค้ากรอกฟอร์มเลือกวันและเวลา แล้วได้รับอีเมลยืนยันอัตโนมัติ",
  "ระบบสต็อกสินค้า บันทึกของเข้าและของออก แล้วแจ้งเตือนเมื่อสินค้าใกล้หมด",
  "ระบบขอลางาน พนักงานกรอกฟอร์ม หัวหน้ากดอนุมัติ และดูวันลาคงเหลือของแต่ละคนได้",
  "หน้าสรุปยอดขายรายวันจาก Google Sheet มีกราฟและยอดรวมแยกตามสินค้า",
  "ส่งอีเมลอัตโนมัติถึงลูกค้าทุกคนในรายชื่อจาก Google Sheet โดยใส่ชื่อของแต่ละคนในเนื้อหา",
  "ออกใบเสนอราคาเป็น PDF จากแม่แบบ โดยกรอกข้อมูลลูกค้าและรายการสินค้าในฟอร์ม",
];

/** Project name from what the user typed: the first non-empty line, cut at a word boundary. */
function nameFromPrompt(prompt: string): string {
  const line =
    prompt
      .split(/\r?\n/)
      .map((l) => l.replace(/\s+/g, " ").trim())
      .find(Boolean) ?? "";
  if (line.length <= NAME_MAX) return line;
  // Thai has no spaces between words — the segmenter finds the boundary, so a word (or a vowel / tone
  // mark) is never cut in half
  let cut = "";
  if (typeof Intl.Segmenter === "function") {
    for (const { segment } of new Intl.Segmenter("th", { granularity: "word" }).segment(line)) {
      if (cut.length + segment.length > NAME_MAX) break;
      cut += segment;
    }
  }
  if (!cut.trim()) {
    const head = line.slice(0, NAME_MAX);
    const space = head.lastIndexOf(" ");
    cut = space > 0 ? head.slice(0, space) : head;
  }
  return `${cut.trimEnd()}…`;
}

/**
 * The home screen's main action: say what you want, press Enter, land in the IDE with the AI already
 * working on it. The prompt travels in sessionStorage (`egs:kickoff` + `egs:kickoff-auto`); the IDE's
 * chat reads both keys, prefills and sends. `egs:wizard` opens the IDE's question wizard instead.
 */
export function PromptComposer({
  engineReady,
  foldExamples = false,
}: {
  engineReady: boolean;
  /** Someone who already has projects knows what to type: keep the examples one click away. */
  foldExamples?: boolean;
}) {
  const router = useRouter();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // state lags a render behind — the ref is what stops a second Enter in the same tick
  const busy = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState<"prompt" | "wizard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [showExamples, setShowExamples] = useState(!foldExamples);

  function fail(message: string) {
    busy.current = false;
    setPending(null);
    setError(message);
  }

  async function createAndOpen(kind: "prompt" | "wizard", name: string, stash: Record<string, string>) {
    if (busy.current) return;
    busy.current = true;
    setPending(kind);
    setError(null);
    try {
      const r = await newProjectReturnId(name);
      if ("error" in r) return fail(r.error);
      try {
        for (const [key, value] of Object.entries(stash)) sessionStorage.setItem(key, value);
      } catch {
        // storage blocked: the project exists, so still open it — the user retypes instead of getting a duplicate
      }
      // stays pending on purpose: the page is navigating away
      router.push(`/projects/${r.id}`);
    } catch {
      fail("สร้างโปรเจกต์ไม่สำเร็จ ลองอีกครั้ง");
    }
  }

  function start() {
    if (!engineReady) return;
    const text = prompt.trim();
    if (!text) {
      fieldRef.current?.focus();
      return;
    }
    void createAndOpen("prompt", nameFromPrompt(text), { "egs:kickoff": text, "egs:kickoff-auto": "1" });
  }

  function fillExample(text: string) {
    setPrompt(text);
    setShowExamples(false);
    fieldRef.current?.focus();
  }

  return (
    <div>
      <form
        data-tour="composer"
        onSubmit={(e) => {
          e.preventDefault();
          start();
        }}
      >
        <textarea
          ref={fieldRef}
          rows={3}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key !== "Enter" || e.shiftKey || e.nativeEvent.isComposing) return;
            e.preventDefault();
            start();
          }}
          disabled={pending !== null}
          placeholder="เช่น ระบบจองคิวร้านตัดผม ลูกค้ากรอกฟอร์มแล้วได้อีเมลยืนยัน"
          aria-label="บอกสิ่งที่อยากได้"
          aria-describedby="composer-hint"
          // grows with the text (3 → about 8 lines), then scrolls
          className="field block max-h-[12.25rem] min-h-[5.25rem] resize-none overflow-y-auto [field-sizing:content]"
        />
        {error && (
          <p role="alert" className="callout callout-danger mt-2">
            {error}
          </p>
        )}
        <div className="mt-2 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
          <p id="composer-hint" className="hint">
            {engineReady ? "Enter เพื่อเริ่ม · Shift+Enter ขึ้นบรรทัดใหม่" : "ตั้งค่า AI ด้านบนก่อน ถึงจะเริ่มสร้างได้"}
          </p>
          <button type="submit" disabled={!engineReady || pending !== null} data-tour="start-button" className="btn btn-primary btn-lg shrink-0">
            {pending === "prompt" ? (
              "กำลังสร้าง…"
            ) : (
              <>
                เริ่มสร้าง
                <ArrowRightIcon className="h-4 w-4" />
              </>
            )}
          </button>
        </div>
      </form>

      {/* three ways to get a brief when you do not have one yet; one row, one tone */}
      <div data-tour="alt-starts" className="mt-5 flex flex-wrap items-center gap-2">
        <span className="hint mr-1">ยังนึกไม่ออก?</span>
        <button
          type="button"
          onClick={() => void createAndOpen("wizard", WIZARD_PROJECT_NAME, { "egs:wizard": "1" })}
          disabled={pending !== null}
          title="ตอบคำถามสั้น ๆ ทีละข้อ แล้วแอปเรียบเรียงเป็นโจทย์ให้ AI"
          className="btn btn-soft tone-ai"
        >
          <QueueListIcon className="h-4 w-4" />
          {pending === "wizard" ? "กำลังสร้าง…" : "ถามทีละข้อ"}
        </button>
        <Link
          href="/styleshopping"
          title="ดูตัวอย่างหน้าตาหลายแบบ เลือกแบบที่ชอบ แล้วเริ่มสร้างจากแบบนั้น"
          className="btn btn-soft tone-info"
        >
          <Squares2X2Icon className="h-4 w-4" />
          ดูตัวอย่างหน้าตา
        </Link>
        <button
          type="button"
          onClick={() => setShowExamples((v) => !v)}
          aria-expanded={showExamples}
          aria-controls="prompt-examples"
          title="ตัวอย่างโจทย์ กดอันไหนก็ใส่ลงช่องพิมพ์ให้ แก้ต่อได้"
          className={`btn btn-soft tone-accent ${showExamples ? "ring-2 ring-accent/40" : ""}`}
        >
          <LightBulbIcon className="h-4 w-4" />
          ดูตัวอย่างโจทย์
        </button>
      </div>

      {showExamples && (
        <ul id="prompt-examples" className="mt-3 grid gap-2 sm:grid-cols-2">
          {EXAMPLES.map((text) => (
            <li key={text}>
              <button
                type="button"
                onClick={() => fillExample(text)}
                disabled={pending !== null}
                className="row-btn h-full text-sm"
              >
                <PlusIcon className="h-4 w-4 shrink-0 text-accent-text" />
                <span className="min-w-0 flex-1">{text}</span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
