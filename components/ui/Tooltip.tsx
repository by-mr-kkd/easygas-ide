"use client";

import { type ReactNode } from "react";

type Placement = "top" | "bottom" | "left" | "right";

// where the bubble sits relative to the trigger
const POS: Record<Placement, string> = {
  top: "bottom-full left-1/2 -translate-x-1/2 mb-1.5",
  bottom: "top-full left-1/2 -translate-x-1/2 mt-1.5",
  left: "right-full top-1/2 -translate-y-1/2 mr-1.5",
  right: "left-full top-1/2 -translate-y-1/2 ml-1.5",
};

/**
 * Styled hover/focus tooltip — replaces the browser's native (yellow) `title` bubble.
 * Wrap any trigger; pass the text via `label`. CSS-only (hover, or keyboard focus), so no JS/positioning
 * state. Long Thai strings wrap at a sensible max width. Hidden with display:none (not opacity) so a bubble
 * near the edge never widens the page on a phone, and a tap (focus without focus-visible) does not open it.
 *
 *   <Tooltip label="ลบรายการ"><button>…</button></Tooltip>
 */
export function Tooltip({
  label,
  placement = "bottom",
  children,
  className,
}: {
  label: ReactNode;
  placement?: Placement;
  children: ReactNode;
  className?: string;
}) {
  return (
    <span className={`group/tt relative inline-flex ${className ?? ""}`}>
      {children}
      {label != null && label !== "" && (
        <span
          role="tooltip"
          className={`pointer-events-none absolute z-[80] w-max max-w-[min(240px,60vw)] whitespace-normal rounded-md bg-[#1b222a] px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-pop hidden group-hover/tt:block group-has-focus-visible/tt:block dark:bg-[#3a4450] ${POS[placement]}`}
        >
          {label}
        </span>
      )}
    </span>
  );
}
