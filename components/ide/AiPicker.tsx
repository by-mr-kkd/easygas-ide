"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowPathIcon, CheckIcon, ChevronUpDownIcon, Cog6ToothIcon, CpuChipIcon, KeyIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { listModelsAction, saveProjectAiAction } from "@/app/projects/actions";
import { MODEL_ID, type AiChoice } from "@/lib/ai-choice";
import type { AiOption } from "@/lib/ai-options";
import { useProjectStore } from "@/store/useProjectStore";

const optionOf = (options: AiOption[], c: AiChoice | null): AiOption | undefined =>
  c ? options.find((o) => o.engine === c.engine && (o.engine !== "api" || o.provider === c.provider)) : undefined;

/** "Codex · gpt-x" — what the status bar and the picker's button show. */
export function aiLabel(options: AiOption[], choice: AiChoice | null): string {
  const option = optionOf(options, choice);
  if (!option) return "เลือก AI";
  return choice?.model ? `${option.label} · ${choice.model}` : option.label;
}

/**
 * The AI switcher in the chat box: which AI answers the NEXT message, and with which model — like the
 * model menu of a chat app. Monthly-plan programs and API keys sit in one list; only what is set up on
 * this machine can be picked. The pick is remembered per project (and the quality re-check follows it).
 */
export function AiPicker({
  projectId,
  options,
  settingsHref,
  placement = "top",
  disabled = false,
}: {
  projectId: string;
  options: AiOption[];
  settingsHref: string;
  /** Which way the menu opens: up from the chat panel's box, down on the start screen. */
  placement?: "top" | "bottom";
  disabled?: boolean;
}) {
  const choice = useProjectStore((s) => s.aiChoice);
  const setChoice = useProjectStore((s) => s.setAiChoice);
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState("");
  // model ids fetched from a provider, per option (kept while the page is open)
  const [listed, setListed] = useState<Record<string, string[]>>({});
  const [listing, setListing] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const current = optionOf(options, choice);
  const keyOf = (o: AiOption) => `${o.engine}:${o.provider ?? ""}`;

  function pick(next: AiChoice) {
    setChoice(next);
    setNote(null);
    void saveProjectAiAction(projectId, next).catch(() => {}); // remembered for next time; the message carries it anyway
  }

  const pickOption = (o: AiOption) => pick(o.engine === "api" ? { engine: "api", provider: o.provider } : { engine: o.engine });
  const pickModel = (model: string) => {
    if (!choice) return;
    const { model: _old, ...rest } = choice;
    pick(model ? { ...rest, model } : rest);
  };

  async function fetchModels() {
    if (!current?.provider || listing) return;
    setListing(true);
    setNote(null);
    try {
      const r = await listModelsAction(current.provider);
      if ("error" in r) setNote(r.error);
      else setListed((l) => ({ ...l, [keyOf(current)]: r.models }));
    } catch {
      setNote("ดึงรายชื่อโมเดลไม่สำเร็จ พิมพ์ชื่อโมเดลเองได้");
    } finally {
      setListing(false);
    }
  }

  function useCustom(e: React.FormEvent) {
    e.preventDefault();
    const name = custom.trim();
    if (!MODEL_ID.test(name)) return setNote("ชื่อโมเดลใช้ได้เฉพาะตัวอักษรอังกฤษ ตัวเลข และ . _ - : / เท่านั้น");
    pickModel(name);
    setCustom("");
  }

  const groups: { id: AiOption["group"]; title: string; Icon: typeof KeyIcon }[] = [
    { id: "plan", title: "สมาชิกรายเดือน", Icon: CpuChipIcon },
    { id: "key", title: "API key จ่ายตามที่ใช้", Icon: KeyIcon },
  ];
  const models = current
    ? [
        ...current.models,
        ...(listed[keyOf(current)] ?? []).filter((id) => !current.models.some((m) => m.id === id)).map((id) => ({ id, label: id })),
        // a typed-in model that is in neither list still has to show as the selected one
        ...(choice?.model && !current.models.some((m) => m.id === choice.model) && !(listed[keyOf(current)] ?? []).includes(choice.model)
          ? [{ id: choice.model, label: choice.model }]
          : []),
      ]
    : [];

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        disabled={disabled}
        aria-haspopup="dialog"
        aria-expanded={open}
        title="เลือก AI และโมเดลสำหรับข้อความถัดไป"
        className={`btn btn-soft btn-sm max-w-full ${current?.ready === false ? "tone-warn" : "tone-ai"}`}
      >
        <SparklesIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">{aiLabel(options, choice)}</span>
        <ChevronUpDownIcon className="h-4 w-4 shrink-0 opacity-70" />
      </button>

      {open && (
        <div
          role="dialog"
          aria-label="เลือก AI และโมเดล"
          className={`absolute left-0 z-40 max-h-[min(30rem,60vh)] w-80 max-w-[calc(100vw-2rem)] overflow-auto rounded-lg border border-line bg-surface p-2 shadow-pop ${
            placement === "top" ? "bottom-full mb-1.5" : "top-full mt-1.5"
          }`}
        >
          {groups.map((g) => {
            const list = options.filter((o) => o.group === g.id);
            if (list.length === 0) return null;
            return (
              <div key={g.id} className="mb-1.5">
                <p className="flex items-center gap-1.5 px-2 pb-1 pt-1.5 text-xs font-semibold text-faint">
                  <g.Icon className="h-3.5 w-3.5" />
                  {g.title}
                </p>
                {list.map((o) => {
                  const selected = current === o;
                  return (
                    <button
                      key={keyOf(o)}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      disabled={!o.ready}
                      onClick={() => pickOption(o)}
                      className={`flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                        selected ? "bg-ai-soft font-semibold text-ai" : o.ready ? "text-fg hover:bg-sunken" : "cursor-not-allowed text-faint"
                      }`}
                    >
                      <CheckIcon className={`mt-0.5 h-4 w-4 shrink-0 ${selected ? "" : "invisible"}`} />
                      <span className="min-w-0 flex-1">
                        {o.label}
                        {o.hint && <span className="block text-xs font-normal text-faint">{o.hint}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            );
          })}

          {current && (
            <div className="border-t border-line pt-1.5">
              <p className="px-2 pb-1 pt-1 text-xs font-semibold text-faint">โมเดลของ {current.label}</p>
              <div className="max-h-44 overflow-auto">
                {models.map((m) => {
                  const selected = (choice?.model ?? "") === m.id;
                  return (
                    <button
                      key={m.id || "default"}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => pickModel(m.id)}
                      className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm transition ${
                        selected ? "bg-ai-soft font-semibold text-ai" : "text-fg hover:bg-sunken"
                      }`}
                    >
                      <CheckIcon className={`h-4 w-4 shrink-0 ${selected ? "" : "invisible"}`} />
                      <span className={`min-w-0 flex-1 truncate ${m.label === m.id ? "font-mono text-[13px]" : ""}`}>{m.label}</span>
                    </button>
                  );
                })}
              </div>
              <form onSubmit={useCustom} className="mt-1.5 flex items-center gap-1.5 px-1">
                <input
                  value={custom}
                  onChange={(e) => setCustom(e.target.value)}
                  placeholder="พิมพ์ชื่อโมเดลเอง"
                  aria-label="ชื่อโมเดล"
                  spellCheck={false}
                  className="field min-h-0 flex-1 px-2 py-1 font-mono text-[13px]"
                />
                <button type="submit" disabled={!custom.trim()} className="btn btn-secondary btn-sm">
                  ใช้
                </button>
              </form>
              {current.canListModels && (
                <button type="button" onClick={fetchModels} disabled={listing} className="btn btn-ghost btn-sm mt-1 w-full justify-start">
                  <ArrowPathIcon className={`h-4 w-4 text-info ${listing ? "animate-spin" : ""}`} />
                  {listing ? "กำลังดึงรายชื่อ…" : "ดึงรายชื่อโมเดลจากบัญชีของฉัน"}
                </button>
              )}
              {note && <p className="hint px-2 pt-1">{note}</p>}
            </div>
          )}

          <div className="mt-1.5 border-t border-line pt-1.5">
            <Link href={settingsHref} className="btn btn-ghost btn-sm w-full justify-start">
              <Cog6ToothIcon className="h-4 w-4" />
              ติดตั้ง ล็อกอิน หรือใส่คีย์ได้ที่ตั้งค่า
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}
