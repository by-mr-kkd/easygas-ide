"use client";

import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { QuestionMarkCircleIcon, XMarkIcon } from "@heroicons/react/24/outline";
import { markTourSeenAction } from "@/app/tour-actions";
import { Tooltip } from "@/components/ui/Tooltip";
import { TOURS, type Rect, type TourId, type TourStep, bubblePosition, presentSteps, spotlightRect, tourSeenKey } from "@/lib/tour";

const BUBBLE_W = 320;
const FIRST_RUN_DELAY_MS = 600;

const findTarget = (target: string): HTMLElement | null => document.querySelector<HTMLElement>(`[data-tour="${target}"]`);

const isShown = (el: HTMLElement): boolean => el.offsetParent !== null || getComputedStyle(el).position === "fixed";

/**
 * The `?` button in a screen's top bar, and the tour it opens: a dark overlay with one element lit
 * up, a bubble explaining it, and next / back / skip. Opens by itself the first time the screen is
 * seen and again whenever the button is pressed. `seen` comes from the app's settings file (the
 * page reads it); localStorage only backs it up within one launch, since the desktop app's origin
 * changes with its port. Esc, the skip button
 * or the last step's "เข้าใจแล้ว" closes it; → / ← / Enter move through the steps.
 */
export function GuidedTour({ tour, seen, className = "" }: { tour: TourId; seen: boolean; className?: string }) {
  const [steps, setSteps] = useState<TourStep[] | null>(null);
  const [index, setIndex] = useState(0);
  const open = steps !== null;

  const start = useCallback(() => {
    const present = presentSteps(TOURS[tour], (t) => {
      const el = findTarget(t);
      return !!el && isShown(el);
    });
    if (present.length === 0) return;
    setIndex(0);
    setSteps(present);
  }, [tour]);

  const close = useCallback(() => {
    setSteps(null);
    try {
      localStorage.setItem(tourSeenKey(tour), "1");
    } catch {
      // storage blocked: the settings file below still remembers it
    }
    void markTourSeenAction(tour).catch(() => {
      // could not be saved: the tour shows once more next launch, nothing worse
    });
  }, [tour]);

  // first visit: open on its own, after the page has settled
  useEffect(() => {
    if (seen) return;
    try {
      if (localStorage.getItem(tourSeenKey(tour)) === "1") return;
    } catch {
      // unreadable storage: trust `seen`
    }
    const t = setTimeout(start, FIRST_RUN_DELAY_MS);
    return () => clearTimeout(t);
  }, [tour, seen, start]);

  return (
    <>
      <Tooltip label={open ? "ปิดคำแนะนำ" : "แนะนำการใช้งาน"} placement="bottom" className="shrink-0">
        <button
          type="button"
          onClick={open ? close : start}
          aria-pressed={open}
          aria-label="แนะนำการใช้งาน"
          className={`btn btn-ghost btn-icon ${open ? "bg-accent-soft text-accent-text" : ""} ${className}`}
        >
          <QuestionMarkCircleIcon className="h-[18px] w-[18px]" />
        </button>
      </Tooltip>
      {steps && (
        <TourOverlay
          steps={steps}
          index={index}
          onIndex={setIndex}
          onClose={close}
        />
      )}
    </>
  );
}

function TourOverlay({
  steps,
  index,
  onIndex,
  onClose,
}: {
  steps: TourStep[];
  index: number;
  onIndex: (i: number) => void;
  onClose: () => void;
}) {
  const step = steps[index];
  const bubbleRef = useRef<HTMLDivElement>(null);
  const [spot, setSpot] = useState<Rect | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);
  const [viewport, setViewport] = useState({ width: 0, height: 0 });

  const last = index === steps.length - 1;
  const next = useCallback(() => (last ? onClose() : onIndex(index + 1)), [last, onClose, onIndex, index]);
  const back = useCallback(() => onIndex(Math.max(0, index - 1)), [onIndex, index]);

  // measure the lit element; again whenever anything moves
  useLayoutEffect(() => {
    const el = findTarget(step.target);
    if (!el) {
      // it left the page while the tour was open (a card closed): move on
      if (last) onClose();
      else onIndex(index + 1);
      return;
    }
    el.scrollIntoView({ block: "center", inline: "nearest" });

    const measure = () => {
      const vp = { width: window.innerWidth, height: window.innerHeight };
      const r = el.getBoundingClientRect();
      const s = spotlightRect({ top: r.top, left: r.left, width: r.width, height: r.height }, vp);
      const b = bubbleRef.current;
      const size = { width: Math.min(BUBBLE_W, vp.width - 24), height: b?.offsetHeight ?? 160 };
      setViewport(vp);
      setSpot(s);
      setPos(bubblePosition(s, size, vp, step.side));
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    if (bubbleRef.current) ro.observe(bubbleRef.current);
    window.addEventListener("resize", measure);
    window.addEventListener("scroll", measure, true);
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", measure);
      window.removeEventListener("scroll", measure, true);
    };
  }, [step, index, last, onClose, onIndex]);

  useEffect(() => {
    bubbleRef.current?.focus();
  }, [index]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
      else if (e.key === "ArrowRight" || e.key === "Enter") next();
      else if (e.key === "ArrowLeft") back();
      else return;
      e.preventDefault();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose, next, back]);

  const bubbleW = Math.min(BUBBLE_W, Math.max(0, viewport.width - 24));

  return createPortal(
    <div className="fixed inset-0 z-[70] [-webkit-app-region:no-drag]" role="presentation">
      {/* the dark sheet with a hole over the element; clicks on the sheet do nothing (the tour stays) */}
      <svg className="absolute inset-0 h-full w-full" width={viewport.width} height={viewport.height} aria-hidden>
        <defs>
          <mask id="tour-mask">
            <rect x={0} y={0} width="100%" height="100%" fill="#fff" />
            {spot && <rect x={spot.left} y={spot.top} width={spot.width} height={spot.height} rx={10} fill="#000" />}
          </mask>
        </defs>
        <rect x={0} y={0} width="100%" height="100%" fill="rgba(10, 14, 20, 0.6)" mask="url(#tour-mask)" />
      </svg>
      {spot && (
        <div
          aria-hidden
          className="pointer-events-none absolute rounded-[10px] ring-2 ring-accent transition-all duration-200"
          style={{ top: spot.top, left: spot.left, width: spot.width, height: spot.height }}
        />
      )}

      <div
        ref={bubbleRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="tour-title"
        tabIndex={-1}
        className="dialog absolute p-4 outline-none transition-[top,left] duration-200"
        style={{ width: bubbleW, top: pos?.top ?? 12, left: pos?.left ?? 12, visibility: pos ? "visible" : "hidden" }}
      >
        <div className="flex items-start gap-2">
          <span className="badge mt-px shrink-0 tabular-nums">
            {index + 1}/{steps.length}
          </span>
          <h3 id="tour-title" className="min-w-0 flex-1 text-[15px] font-semibold text-fg">
            {step.title}
          </h3>
          <button type="button" onClick={onClose} aria-label="ปิดคำแนะนำ" className="btn btn-ghost btn-sm btn-icon -mr-1.5 -mt-1 shrink-0">
            <XMarkIcon className="h-4 w-4" />
          </button>
        </div>
        <p className="hint mt-2 leading-relaxed">{step.body}</p>
        <div className="mt-4 flex items-center gap-2">
          <button type="button" onClick={onClose} className="btn btn-ghost btn-sm text-muted">
            ข้าม
          </button>
          <span className="flex-1" />
          {index > 0 && (
            <button type="button" onClick={back} className="btn btn-secondary btn-sm">
              ย้อนกลับ
            </button>
          )}
          <button type="button" onClick={next} className="btn btn-primary btn-sm">
            {last ? "เข้าใจแล้ว" : "ถัดไป"}
          </button>
        </div>
      </div>
    </div>,
    document.body,
  );
}
