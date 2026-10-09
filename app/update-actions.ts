"use server";

import { readUpdateState } from "@/lib/app-update";
import { isRemoteRequest } from "@/lib/remote/request";

/**
 * The downloaded update waiting for a restart, for the small notice (components/UpdateNotice). Only on the
 * computer: a phone cannot restart the app, so it never sees the notice.
 */
export async function updateNoticeAction(): Promise<{ version: string } | null> {
  if (await isRemoteRequest()) return null;
  const s = await readUpdateState();
  return s?.status === "ready" && s.version ? { version: s.version } : null;
}
