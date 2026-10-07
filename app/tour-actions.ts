"use server";

import { setAppSetting } from "@/lib/settings";
import { TOURS, type TourId, tourSeenKey } from "@/lib/tour";

/**
 * Remembers that a tour was shown, in the app's own settings file. The desktop app starts its
 * server on a new port each launch, so the browser's localStorage is a different one every time
 * and cannot hold this.
 */
export async function markTourSeenAction(tour: TourId): Promise<void> {
  if (!(tour in TOURS)) return;
  await setAppSetting(tourSeenKey(tour), "1");
}
