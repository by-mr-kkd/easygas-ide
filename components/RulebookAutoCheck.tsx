"use client";

import { useEffect } from "react";
import { autoCheckRulebookAction } from "@/app/settings/actions";

/**
 * Kicks off the once-a-day rulebook update check after the page is on screen. It runs from the browser
 * (not during server render) so a production build or a slow network never touches the page.
 */
export function RulebookAutoCheck() {
  useEffect(() => {
    autoCheckRulebookAction().catch(() => {
      /* best-effort — the Settings page shows the last result */
    });
  }, []);
  return null;
}
