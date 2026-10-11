"use client";

import { useCallback, useEffect, useState } from "react";
import { remoteStatusAction, type RemoteView } from "@/app/settings/remote-actions";

/** while nothing is happening the button only needs to notice a change made elsewhere (Settings, the tray) */
const IDLE_POLL_MS = 15_000;

/**
 * The remote-access state behind the IDE's phone button and its dialog: fetched again every so often while
 * the window is visible, so "ออนไลน์" / "กำลังเชื่อม…" / "เชื่อมไม่สำเร็จ" is what is true now. The dialog
 * follows a start or a pairing more closely itself (PhoneDialog) and hands each new state back here.
 * `initial` null = this page was opened from a phone: nothing to show, nothing to ask.
 */
export function usePhoneRemote(initial: RemoteView | null) {
  const [v, setV] = useState(initial);

  const refresh = useCallback(() => {
    remoteStatusAction()
      .then(setV)
      .catch(() => {});
  }, []);

  const off = !initial; // opened from a phone: there is no button
  useEffect(() => {
    if (off) return;
    const tick = () => {
      if (document.visibilityState === "visible") refresh();
    };
    const t = setInterval(tick, IDLE_POLL_MS);
    document.addEventListener("visibilitychange", tick);
    return () => {
      clearInterval(t);
      document.removeEventListener("visibilitychange", tick);
    };
  }, [refresh, off]);

  return { v, setV, refresh };
}
