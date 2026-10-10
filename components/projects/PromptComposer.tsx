"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRightIcon, GlobeAltIcon, LightBulbIcon, QueueListIcon, Squares2X2Icon, TableCellsIcon } from "@heroicons/react/24/outline";
import { newProjectReturnId } from "@/app/projects/actions";

const NAME_MAX = 60;
const WIZARD_PROJECT_NAME = "โปรเจกต์ใหม่";

/** what is being built: a web page people open, or a script inside a Google Sheet (lib/bound.ts) */
const KINDS = [
  {
    id: "webapp",
    label: "เว็บแอป",
    Icon: GlobeAltIcon,
    hint: "ได้ลิงก์หน้าเว็บให้คนเปิดใช้",
    tip: "หน้าเว็บที่คนเปิดจากลิงก์ได้ เช่น ฟอร์มจองคิว หน้าสรุปยอด เก็บข้อมูลลง Google Sheet ให้อัตโนมัติ",
  },
  {
    id: "bound",
    label: "ผูกกับ Google Sheet",
    Icon: TableCellsIcon,
    hint: "สร้างชีตใหม่พร้อมสคริปต์ในชีต ใช้งานจากเมนูในชีต",
    tip: "ตอนเผยแพร่ แอปจะสร้าง Google Sheet ใหม่พร้อมสคริปต์ในตัว ใช้งานจากเมนูบนชีต ปุ่ม แถบด้านข้าง หรือการตั้งเวลา ไม่มีลิงก์หน้าเว็บ",
  },
] as const;
type Kind = (typeof KINDS)[number]["id"];

/** one click puts the text in the box; the label is what fits on a chip */
const EXAMPLES: { label: string; text: string }[] = [
  { label: "จองคิวร้านตัดผม", text: "ระบบจองคิวร้านตัดผม ลูกค้ากรอกฟอร์มเลือกวันและเวลา แล้วได้รับอีเมลยืนยันอัตโนมัติ" },
  { label: "สต็อกสินค้า", text: "ระบบสต็อกสินค้า บันทึกของเข้าและของออก แล้วแจ้งเตือนเมื่อสินค้าใกล้หมด" },
  { label: "ขอลางาน", text: "ระบบขอลางาน พนักงานกรอกฟอร์ม หัวหน้ากดอนุมัติ และดูวันลาคงเหลือของแต่ละคนได้" },
  { label: "สรุปยอดขายรายวัน", text: "หน้าสรุปยอดขายรายวันจาก Google Sheet มีกราฟและยอดรวมแยกตามสินค้า" },
  { label: "ส่งอีเมลตามรายชื่อ", text: "ส่งอีเมลอัตโนมัติถึงลูกค้าทุกคนในรายชื่อจาก Google Sheet โดยใส่ชื่อของแต่ละคนในเนื้อหา" },
  { label: "ใบเสนอราคา PDF", text: "ออกใบเสนอราคาเป็น PDF จากแม่แบบ โดยกรอกข้อมูลลูกค้าและรายการสินค้าในฟอร์ม" },
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
export function PromptComposer({ engineReady }: { engineReady: boolean }) {
  const router = useRouter();
  const fieldRef = useRef<HTMLTextAreaElement>(null);
  // state lags a render behind — the ref is what stops a second Enter in the same tick
  const busy = useRef(false);
  const [prompt, setPrompt] = useState("");
  const [pending, setPending] = useState<"prompt" | "wizard" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [projectKind, setProjectKind] = useState<Kind>("webapp");

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
      const r = await newProjectReturnId(name, projectKind);
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
        <h1 className="text-xl font-semibold sm:text-[22px]">อยากได้ระบบอะไร?</h1>
        <p className="hint mb-3">เล่าเป็นภาษาพูดได้ AI จะเขียนโค้ดและทำหน้าจอตัวอย่างให้ดูก่อน ยังไม่แตะบัญชี Google จนกว่าจะกดเผยแพร่</p>
        <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1.5">
          <div className="seg" role="radiogroup" aria-label="ระบบแบบไหน">
            {KINDS.map((k) => (
              <button
                key={k.id}
                type="button"
                role="radio"
                aria-checked={projectKind === k.id}
                aria-pressed={projectKind === k.id}
                onClick={() => setProjectKind(k.id)}
                disabled={pending !== null}
                title={k.tip}
                className="seg-item"
              >
                <k.Icon className="h-4 w-4" aria-hidden />
                {k.label}
              </button>
            ))}
          </div>
          <span className="hint">{KINDS.find((k) => k.id === projectKind)?.hint}</span>
        </div>
        <textarea
          ref={fieldRef}
          rows={4}
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
          // grows with the text (4 → about 8 lines), then scrolls
          className="field block max-h-[12.25rem] min-h-[6rem] resize-none overflow-y-auto text-[15px] [field-sizing:content]"
        />
        {error && (
          <p role="alert" className="callout callout-danger mt-2">
            {error}
          </p>
        )}
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => void createAndOpen("wizard", WIZARD_PROJECT_NAME, { "egs:wizard": "1" })}
            disabled={pending !== null}
            title="ตอบคำถามสั้น ๆ ทีละข้อ แล้วแอปเรียบเรียงเป็นโจทย์ให้ AI"
            className="btn btn-soft tone-ai btn-sm"
          >
            <QueueListIcon className="h-4 w-4" />
            {pending === "wizard" ? "กำลังสร้าง…" : "ถามทีละข้อ"}
          </button>
          <Link href="/styleshopping" title="ดูตัวอย่างหน้าตาหลายแบบ เลือกแบบที่ชอบ แล้วเริ่มสร้างจากแบบนั้น" className="btn btn-soft tone-info btn-sm">
            <Squares2X2Icon className="h-4 w-4" />
            ดูตัวอย่างหน้าตา
          </Link>
          <p id="composer-hint" className="hint sr-only flex-1 lg:not-sr-only">
            {engineReady ? "Enter เพื่อเริ่ม · Shift+Enter ขึ้นบรรทัดใหม่" : "ตั้งค่า AI ก่อน ถึงจะเริ่มสร้างได้"}
          </p>
          <button type="submit" disabled={!engineReady || pending !== null} data-tour="start-button" className="btn btn-primary ml-auto shrink-0">
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

      {/* a brief when you do not have one yet: one click fills the box, then edit */}
      <div data-tour="alt-starts" className="mt-4 flex flex-wrap items-center gap-1.5">
        <span className="hint mr-1 flex items-center gap-1">
          <LightBulbIcon className="h-4 w-4 text-accent-text" aria-hidden />
          ยังนึกไม่ออก? ลองกดตัวอย่าง
        </span>
        {EXAMPLES.map((ex) => (
          <button key={ex.label} type="button" onClick={() => fillExample(ex.text)} disabled={pending !== null} title={ex.text} className="btn btn-secondary btn-sm rounded-full">
            {ex.label}
          </button>
        ))}
      </div>
    </div>
  );
}
