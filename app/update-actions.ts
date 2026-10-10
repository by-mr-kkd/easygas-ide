"use server";

import { readUpdateState, requestUpdate, type UpdateState } from "@/lib/app-update";
import { assertLocalRequest, isRemoteRequest } from "@/lib/remote/request";

/**
 * The downloaded update waiting for a restart, for the small notice (components/UpdateNotice). Only on the
 * computer: a phone cannot restart the app, so it never sees the notice.
 */
export async function updateNoticeAction(): Promise<{ version: string } | null> {
  if (await isRemoteRequest()) return null;
  const s = await readUpdateState();
  return s?.status === "ready" && s.version ? { version: s.version } : null;
}

/** The Settings card's buttons: ask the shell to check now, or to install the downloaded version and restart. */
export async function requestUpdateAction(action: "check" | "install"): Promise<{ ok: boolean }> {
  await assertLocalRequest();
  if (action !== "check" && action !== "install") return { ok: false };
  const s = await readUpdateState();
  // no state = not the installed app (dev server): there is no shell to ask
  if (!s) return { ok: false };
  if (action === "install" && s.status !== "ready") return { ok: false };
  await requestUpdate(action);
  return { ok: true };
}

/** The card polls this while a check or download runs. */
export async function updateStateAction(): Promise<UpdateState | null> {
  if (await isRemoteRequest()) return null;
  return readUpdateState();
}
