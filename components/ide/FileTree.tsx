"use client";

import { useProjectStore } from "@/store/useProjectStore";

function dotColor(path: string): string {
  if (path.endsWith(".gs")) return "#e0b06a";
  if (path.endsWith(".html")) return "#7aa2f7";
  if (path.endsWith(".json")) return "#b69cf0";
  return "#9aa7b6";
}

/**
 * The project's files as tabs. `pane` = its own strip above the editor (narrow window);
 * `toolbar` = inline in the toolbar row of a wide window, where it sits next to the editor's buttons.
 */
export function FileTree({ variant = "pane" }: { variant?: "pane" | "toolbar" }) {
  const order = useProjectStore((s) => s.order);
  const active = useProjectStore((s) => s.activePath);
  const working = useProjectStore((s) => s.workingPath);
  const issues = useProjectStore((s) => s.issues);
  const setActive = useProjectStore((s) => s.setActive);

  if (variant === "toolbar" && order.length === 0) return null;

  return (
    <div
      className={
        variant === "toolbar"
          ? "flex min-w-[8rem] items-center gap-1 overflow-x-auto [scrollbar-width:thin]"
          : "flex h-11 flex-none items-center gap-1 overflow-x-auto border-b border-line px-2"
      }
    >
      {order.length === 0 ? (
        <span className="hint px-1">ยังไม่มีไฟล์</span>
      ) : (
        order.map((p) => (
          <button
            key={p}
            onClick={() => setActive(p)}
            aria-pressed={active === p}
            className={`flex h-7 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-md font-mono transition ${variant === "toolbar" ? "px-2 text-[12.5px]" : "px-2.5 text-[13px]"} ${
              active === p ? "bg-sunken font-medium text-fg" : "text-muted hover:bg-sunken hover:text-fg"
            }`}
          >
            <span className="relative flex h-1.5 w-1.5">
              {p === working && (
                <span
                  className="absolute inline-flex h-full w-full animate-ping rounded-full opacity-75"
                  style={{ background: dotColor(p) }}
                />
              )}
              <span className="relative inline-flex h-1.5 w-1.5 rounded-full" style={{ background: dotColor(p) }} />
            </span>
            {p}
            {(issues[p]?.length ?? 0) > 0 && (
              <span
                className={`grid h-4 min-w-4 place-items-center rounded-full px-1 font-sans text-[11px] font-semibold leading-none ${
                  issues[p].some((i) => i.severity === "high") ? "bg-danger-soft text-danger" : "bg-warn-soft text-warn-text"
                }`}
              >
                {issues[p].length}
              </span>
            )}
          </button>
        ))
      )}
    </div>
  );
}
