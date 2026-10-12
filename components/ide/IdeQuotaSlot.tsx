"use client";

import { useProjectStore } from "@/store/useProjectStore";
import { QuotaStatus } from "./QuotaStatus";

/**
 * The quota part of the code screen's status bar. The bar itself is rendered on the server
 * (components/AppStatusBar), but the AI is picked per message in the chat box, so this slot reads that pick
 * from the store: the monthly-plan AIs (Codex, Claude) have a quota to show, the others show nothing.
 */
export function IdeQuotaSlot({ claudeAllowed, settingsHref }: { claudeAllowed: boolean; settingsHref: string }) {
  const engine = useProjectStore((s) => s.aiChoice?.engine);
  if (engine !== "codex-cli" && engine !== "claude-cli") return null;
  return (
    <div className="flex min-w-0 items-center px-0.5">
      <QuotaStatus engine={engine} claudeAllowed={claudeAllowed} settingsHref={settingsHref} />
    </div>
  );
}
