"use client";

import { useEffect } from "react";
import { refreshPremiumDeviceAction } from "@/app/premium/actions";

/**
 * Renews this machine's Pro activation in the background, once per app session. The action itself only
 * talks to the licence server when the token is a week old, so this costs nothing most of the time.
 * Renders nothing.
 */
export function PremiumRefresher() {
  useEffect(() => {
    try {
      if (sessionStorage.getItem("egs-premium-refreshed")) return;
      sessionStorage.setItem("egs-premium-refreshed", "1");
    } catch {
      // storage blocked: renew anyway, it is cheap
    }
    refreshPremiumDeviceAction().catch(() => {});
  }, []);
  return null;
}
