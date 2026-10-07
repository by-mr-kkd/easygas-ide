"use client";

import { CheckIcon, PlusIcon } from "@heroicons/react/24/outline";
import type { StyleItem } from "@/lib/style-catalog";

/** One catalog option: live preview mock-up, what it is, and a toggle that adds/removes it. */
export function OptionCard({
  item,
  selected,
  onToggle,
}: {
  item: StyleItem;
  selected: boolean;
  onToggle: (id: string) => void;
}) {
  return (
    <div className={`card flex flex-col overflow-hidden ${selected ? "border-accent" : ""}`}>
      <div className="h-44 border-b border-line bg-sunken">
        <iframe title={item.title} sandbox="allow-scripts" srcDoc={item.previewHtml} className="h-full w-full" />
      </div>
      <div className="flex flex-1 flex-col gap-1.5 p-3.5">
        <div className="font-semibold">{item.title}</div>
        <p className="hint flex-1">{item.when}</p>
        <button
          type="button"
          onClick={() => onToggle(item.id)}
          aria-pressed={selected}
          className={`btn btn-secondary mt-1.5 w-full ${
            selected ? "border-transparent bg-accent-soft text-accent-text" : ""
          }`}
        >
          {selected ? <CheckIcon className="h-4 w-4" /> : <PlusIcon className="h-4 w-4" />}
          {selected ? "เลือกแล้ว" : "เลือกแบบนี้"}
        </button>
      </div>
    </div>
  );
}
