/**
 * Whether a guided tour is on screen, about to open by itself, or neither — so other first-run effects (the
 * chat box's "เริ่มไอเดียของคุณที่นี่" spotlight) wait for it instead of drawing on top of it. GuidedTour is the
 * only writer; the phase lives on `window` because the tour's button and the chat sit in different trees.
 *   pending = a first visit: the tour will open in a moment · open = on screen · idle = neither
 */
export type TourPhase = "pending" | "open" | "idle";

const EVENT = "egs:tour-phase";

declare global {
  interface Window {
    __egsTourPhase?: TourPhase;
  }
}

export function setTourPhase(phase: TourPhase): void {
  if (typeof window === "undefined" || window.__egsTourPhase === phase) return;
  window.__egsTourPhase = phase;
  window.dispatchEvent(new CustomEvent(EVENT));
}

/** No tour on this screen at all reads as idle. */
export const tourPhase = (): TourPhase => (typeof window === "undefined" ? "idle" : window.__egsTourPhase ?? "idle");

export function onTourPhase(listener: (phase: TourPhase) => void): () => void {
  const handler = () => listener(tourPhase());
  window.addEventListener(EVENT, handler);
  return () => window.removeEventListener(EVENT, handler);
}
