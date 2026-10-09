/**
 * Pro: tell the phone that started an AI turn (or a live test) how it ended, even when the phone has
 * gone to sleep and its stream was cut (server-only). The gateway names the phone in x-egs-device
 * (lib/remote/gateway.ts) and drops that header from anything that arrives from outside.
 */
import { notifyDevice } from "./runtime.ts";
import type { TurnNotice } from "./notice.ts";

/** The paired phone behind this request, or null when it was made on the computer itself. */
export function remoteDeviceOf(headers: Headers): string | null {
  if (!headers.has("x-egs-remote")) return null;
  const id = headers.get("x-egs-device");
  return id && /^[a-z0-9]{6,32}$/.test(id) ? id : null;
}

/** Fire and forget: a notification never delays or fails the turn. */
export function notifyTurnEnd(deviceId: string | null, projectId: string, notice: TurnNotice): void {
  if (!deviceId) return;
  notifyDevice(deviceId, { ...notice, path: `/projects/${projectId}`, tag: `project-${projectId}` }).catch((e) =>
    console.error("[remote] notify:", e instanceof Error ? e.message : e),
  );
}
