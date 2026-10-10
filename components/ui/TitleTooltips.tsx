"use client";

import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

/** where an element's text is kept once its native `title` is taken over (so the browser's bubble never shows) */
const KEPT = "data-egs-title";
const SHOW_DELAY_MS = 350;
const GAP = 6;
const EDGE = 8;
/** places that draw their own hovers */
const SKIP = ".monaco-editor, iframe, [data-native-title]";

type Tip = { text: string; x: number; y: number; above: boolean };

/** The element whose title should show, taking the `title` attribute over on the way (null = none). */
function takeOver(start: EventTarget | null): HTMLElement | null {
  const el = start instanceof Element ? start.closest<HTMLElement>(`[title], [${KEPT}]`) : null;
  if (!el || el.closest(SKIP)) return null;
  const title = el.getAttribute("title");
  if (title !== null) {
    // React re-sets `title` when its value changes: the latest one wins
    el.setAttribute(KEPT, title);
    el.removeAttribute("title");
    // an icon-only control was named by its title; keep it named for screen readers
    if (!el.getAttribute("aria-label") && !el.textContent?.trim()) el.setAttribute("aria-label", title);
  }
  return el.getAttribute(KEPT)?.trim() ? el : null;
}

/**
 * Every native `title` tooltip in the app, drawn in the same dark bubble as components/ui/Tooltip — mounted
 * once in the root layout, so no screen has to wrap its buttons. Mouse hover (after a short delay) or keyboard
 * focus shows it; touch never does. Below the element, above it when there is no room, kept inside the window.
 */
export function TitleTooltips() {
  const [tip, setTip] = useState<Tip | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const current = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const hide = () => {
      if (timer.current) clearTimeout(timer.current);
      timer.current = null;
      current.current = null;
      setTip(null);
    };
    const place = (el: HTMLElement): Tip => {
      const r = el.getBoundingClientRect();
      const above = r.bottom + 40 > window.innerHeight;
      return { text: el.getAttribute(KEPT) ?? "", x: r.left + r.width / 2, y: above ? r.top - GAP : r.bottom + GAP, above };
    };
    const show = (el: HTMLElement, delay: number) => {
      if (current.current === el) return;
      hide();
      current.current = el;
      timer.current = setTimeout(() => {
        if (current.current === el && el.isConnected) setTip(place(el));
      }, delay);
    };

    const onOver = (e: PointerEvent) => {
      if (e.pointerType === "touch") return;
      const el = takeOver(e.target);
      if (el) show(el, SHOW_DELAY_MS);
      else if (current.current && !current.current.contains(e.target as Node)) hide();
    };
    const onOut = (e: PointerEvent) => {
      if (current.current && !current.current.contains(e.relatedTarget as Node | null)) hide();
    };
    const onFocus = (e: FocusEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLElement) || !t.matches(":focus-visible")) return;
      const el = takeOver(t);
      if (el) show(el, 0);
    };

    document.addEventListener("pointerover", onOver, true);
    document.addEventListener("pointerout", onOut, true);
    document.addEventListener("focusin", onFocus, true);
    document.addEventListener("focusout", hide, true);
    document.addEventListener("pointerdown", hide, true);
    document.addEventListener("keydown", hide, true);
    window.addEventListener("scroll", hide, true);
    window.addEventListener("blur", hide);
    return () => {
      hide();
      document.removeEventListener("pointerover", onOver, true);
      document.removeEventListener("pointerout", onOut, true);
      document.removeEventListener("focusin", onFocus, true);
      document.removeEventListener("focusout", hide, true);
      document.removeEventListener("pointerdown", hide, true);
      document.removeEventListener("keydown", hide, true);
      window.removeEventListener("scroll", hide, true);
      window.removeEventListener("blur", hide);
    };
  }, []);

  // keep the bubble inside the window once its width is known
  useEffect(() => {
    const b = bubble.current;
    if (!tip || !b) return;
    const w = b.offsetWidth;
    const left = Math.min(Math.max(tip.x - w / 2, EDGE), window.innerWidth - w - EDGE);
    b.style.left = `${left}px`;
    b.style.visibility = "visible";
  }, [tip]);

  if (!tip) return null;
  return createPortal(
    <div
      ref={bubble}
      role="tooltip"
      style={{ top: tip.y, left: tip.x, visibility: "hidden", transform: tip.above ? "translateY(-100%)" : undefined }}
      className="pointer-events-none fixed z-[90] w-max max-w-[min(260px,70vw)] whitespace-normal rounded-md bg-[#1b222a] px-2.5 py-1.5 text-xs font-medium leading-relaxed text-white shadow-pop dark:bg-[#3a4450]"
    >
      {tip.text}
    </div>,
    document.body,
  );
}
