"use client";

import { ExclamationTriangleIcon, SparklesIcon } from "@heroicons/react/24/outline";
import { useProjectStore } from "@/store/useProjectStore";

const sevCls: Record<string, string> = {
  high: "bg-danger-soft text-danger",
  medium: "bg-warn-soft text-warn-text",
  low: "bg-sunken text-muted",
};
const sevLabel: Record<string, string> = { high: "สำคัญ", medium: "ควรแก้", low: "เล็กน้อย" };

/** Findings from "ให้ AI ตรวจซ้ำ" (Gate 0 lint + Gate 1 critic). Click an item to jump to the file
 *  (its line is marked in the editor); "ให้ AI แก้ให้" routes a repair prompt into the chat flow. */
export function IssuesPanel() {
  const issues = useProjectStore((s) => s.issues);
  const setActive = useProjectStore((s) => s.setActive);
  const clearIssues = useProjectStore((s) => s.clearIssues);
  const runAgent = useProjectStore((s) => s.runAgent);
  const flat = Object.values(issues).flat();
  if (flat.length === 0) return null;

  function fixAll() {
    const lines = flat.map(
      (i) => `- ${i.file}${i.line ? `:${i.line}` : ""} ${i.problem}${i.fix ? ` (แนวทาง: ${i.fix})` : ""}`,
    );
    runAgent(
      "send",
      "ช่วยแก้จุดที่ตรวจพบต่อไปนี้ให้เรียบร้อยด้วย edit_file/write_file แล้วสรุปสั้น ๆ ว่าแก้อะไรบ้าง:\n" +
        lines.join("\n"),
    );
    clearIssues(); // the fix streams into chat + updates the editor; findings will be stale
  }

  return (
    <div className="flex max-h-48 flex-none flex-col overflow-y-auto border-t border-line">
      <div className="sticky top-0 flex items-center gap-2 border-b border-warn-line bg-warn-soft px-3 py-1.5 text-[13px] font-medium text-warn-text">
        <ExclamationTriangleIcon className="h-4 w-4 shrink-0" />
        <span className="truncate">พบ {flat.length} จุดที่ควรแก้ กดที่รายการเพื่อไปยังไฟล์</span>
        <span className="flex-1" />
        <button onClick={fixAll} className="btn btn-primary btn-sm shrink-0">
          <SparklesIcon className="h-4 w-4" />
          ให้ AI แก้ให้
        </button>
        <button onClick={clearIssues} className="btn btn-ghost btn-sm shrink-0">
          ล้างรายการ
        </button>
      </div>
      <ul className="flex flex-col gap-1 p-2">
        {flat.map((i, idx) => (
          <li key={idx}>
            <button
              onClick={() => setActive(i.file)}
              className="w-full rounded-md px-2 py-1.5 text-left transition hover:bg-sunken"
            >
              <div className="flex items-center gap-1.5 text-xs">
                <span className={`rounded px-1.5 py-0.5 font-semibold leading-none ${sevCls[i.severity] ?? sevCls.medium}`}>
                  {sevLabel[i.severity] ?? i.severity}
                </span>
                <span className="font-mono text-muted">
                  {i.file}
                  {i.line ? `:${i.line}` : ""}
                </span>
              </div>
              <div className="mt-0.5 text-[13px] leading-snug text-fg">{i.problem}</div>
              {i.fix && <div className="text-[13px] leading-snug text-muted">วิธีแก้: {i.fix}</div>}
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}
