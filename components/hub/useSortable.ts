"use client";

import { useRef, useState } from "react";

/**
 * Drag-to-reorder for a vertical list that works with a mouse AND a finger (HTML drag-and-drop does not fire on
 * phones): press the handle, move, and the list reorders under the pointer. `move(from, to)` is called while
 * dragging; the caller swaps the items. Each row registers its element with `rowRef(index)`.
 */
export function useSortable(count: number, move: (from: number, to: number) => void) {
  const rows = useRef<(HTMLElement | null)[]>([]);
  const [dragging, setDragging] = useState<number | null>(null);
  const current = useRef<number | null>(null);

  const rowRef = (i: number) => (el: HTMLElement | null) => {
    rows.current[i] = el;
  };

  const handleProps = (i: number) => ({
    onPointerDown(e: React.PointerEvent<HTMLElement>) {
      if (e.button !== 0) return;
      e.preventDefault();
      e.currentTarget.setPointerCapture(e.pointerId);
      current.current = i;
      setDragging(i);
    },
    onPointerMove(e: React.PointerEvent<HTMLElement>) {
      const from = current.current;
      if (from === null) return;
      const y = e.clientY;
      for (let j = 0; j < count; j++) {
        const el = rows.current[j];
        if (!el || j === from) continue;
        const r = el.getBoundingClientRect();
        // past the middle of a neighbour: take its place
        if ((j < from && y < r.top + r.height / 2) || (j > from && y > r.top + r.height / 2)) {
          move(from, j);
          current.current = j;
          setDragging(j);
          break;
        }
      }
    },
    onPointerUp() {
      current.current = null;
      setDragging(null);
    },
    onPointerCancel() {
      current.current = null;
      setDragging(null);
    },
    style: { touchAction: "none" as const, cursor: "grab" },
    "aria-label": "ลากเพื่อจัดลำดับ",
  });

  return { rowRef, handleProps, dragging };
}

/** A copy of `list` with the element at `from` moved to `to`. */
export function moved<T>(list: T[], from: number, to: number): T[] {
  const next = list.slice();
  const [x] = next.splice(from, 1);
  next.splice(to, 0, x);
  return next;
}
