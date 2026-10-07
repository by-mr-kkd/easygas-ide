/**
 * In-memory cache of the licence server's offer. Nothing here runs at render time by itself: callers are
 * user actions (opening the dialog, asking for a camera feature). Cached about an hour; a call with a stale
 * cache answers from the cache at once and refreshes in the background.
 */
import { fetchOffer, type PremiumOffer } from "./api.ts";

const TTL_MS = 60 * 60 * 1000;

let cached: { offer: PremiumOffer; at: number } | null = null;
let inflight: Promise<PremiumOffer> | null = null;

function refresh(): Promise<PremiumOffer> {
  if (inflight) return inflight;
  inflight = fetchOffer()
    .then((offer) => {
      cached = { offer, at: Date.now() };
      return offer;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * The offer, fresh from the server when the cache is empty or `force` is set; otherwise the cached one
 * (refreshed in the background when older than an hour). Throws a PremiumApiError when the server cannot
 * be reached and nothing is cached.
 */
export async function getOffer(force = false): Promise<PremiumOffer> {
  if (!cached || force) return refresh();
  if (Date.now() - cached.at > TTL_MS) refresh().catch(() => undefined);
  return cached.offer;
}

/** Whether the licence server currently lists premium at a launch-promotion price (cached; true when unknown). */
export async function launchPromo(): Promise<boolean> {
  if (cached) {
    if (Date.now() - cached.at > TTL_MS) refresh().catch(() => undefined);
    return cached.offer.promo;
  }
  try {
    return (await refresh()).promo;
  } catch {
    return true;
  }
}

/** Test seam. */
export function resetOfferCache(): void {
  cached = null;
  inflight = null;
}
