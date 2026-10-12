import { createHash } from "node:crypto";
import { ensureAuthor } from "@/lib/share/author";
import { premiumStatus } from "@/lib/premium/status";
import { readPremium } from "@/lib/premium/store";
import { parseActivation } from "@/lib/premium/license";
import { listHubProjects, type HubProject } from "./projects";

export type HubSyncData = {
  key: string;
  author: string;
  masked: string;
  /** sha256 of the signed-in Google account: the phone notices a change without holding the address */
  account: string | null;
  /** this machine's activation token while Pro is on (the site checks it), else null */
  pro: string | null;
  proUntil: string | null;
  projects: HubProject[];
  machineName: string | null;
};

/**
 * What the Pro phone app takes from this computer for "ฮับของฉัน" (gateway /__egs/api/hub-sync, a paired device
 * only): the share author key (who owns the hubs), the Pro token and the published projects. Hubs themselves live
 * on easygaside.tech, so with these the phone edits them while this computer is off.
 */
export async function hubSyncData(): Promise<HubSyncData> {
  const { key, author, account } = await ensureAuthor();
  const premium = await premiumStatus().catch(() => null);
  const token = premium?.active ? (await readPremium()).activation : null;
  const parsed = token ? parseActivation(token) : null;
  return {
    key,
    author: author.display,
    masked: author.masked,
    account: account ? createHash("sha256").update(`egs-hub|${account}`).digest("hex") : null,
    pro: parsed?.ok ? token : null,
    proUntil: parsed?.ok ? new Date(parsed.payload.exp * 1000).toISOString() : null,
    projects: await listHubProjects(),
    machineName: null,
  };
}
