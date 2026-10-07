"use server";

import { claudeQuota } from "@/lib/engines/claude-quota";
import { codexQuota } from "@/lib/engines/codex-quota";
import type { QuotaEngine, QuotaInfo } from "@/lib/quota";

export type QuotaResult = { ok: true; info: QuotaInfo } | { ok: false; error: string };

const CACHE_MS = 60_000;
const cache: Partial<Record<QuotaEngine, { at: number; value: QuotaResult }>> = {};
const inFlight: Partial<Record<QuotaEngine, Promise<QuotaResult>>> = {};

/**
 * The quota left on the AI the status bar names. One reading a minute per AI: several open
 * projects or a quick re-open share it, and a Claude reading costs one tiny request.
 */
export async function aiQuotaAction(engine: unknown, force = false): Promise<QuotaResult> {
  if (engine !== "codex-cli" && engine !== "claude-cli") return { ok: false, error: "AI นี้ไม่มีโควตาให้ดู" };
  const hit = cache[engine];
  if (!force && hit && Date.now() - hit.at < CACHE_MS) return hit.value;
  const pending = inFlight[engine];
  if (pending) return pending;
  const run = (async (): Promise<QuotaResult> => {
    const r = await (engine === "codex-cli" ? codexQuota() : claudeQuota());
    const value: QuotaResult = "error" in r ? { ok: false, error: r.error } : { ok: true, info: r };
    if (value.ok) cache[engine] = { at: Date.now(), value };
    return value;
  })();
  inFlight[engine] = run;
  try {
    return await run;
  } finally {
    delete inFlight[engine];
  }
}
