"use client";

import { useEffect, useState, type ReactNode } from "react";
import { createPortal } from "react-dom";

/**
 * Render a dialog at the end of <body>. A `.dialog-backdrop` inside the sticky top bar or toolbar is caught in that
 * bar's stacking context (z-20 / z-30): its z-60 then only counts inside the bar, and the top bar covered the
 * dialog's top edge on phones. Every dialog goes through here.
 */
export function Portal({ children }: { children: ReactNode }) {
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  return mounted ? createPortal(children, document.body) : null;
}
