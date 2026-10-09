/**
 * Was this request forwarded by the remote gateway (a phone), or made on the computer itself? The gateway
 * replaces any incoming x-egs-remote header with its own, so a phone cannot pass as the computer by leaving
 * it out (server-only).
 */
import { headers } from "next/headers";

/**
 * Fails closed: ANY x-egs-remote header counts as remote. The gateway always sets it (with the secret) and
 * drops whatever a phone sent; a request made on the computer has none. A wrong value is still remote, so a
 * mix-up between bundles holding different secrets can only make a request more restricted, never less.
 */
export async function isRemoteRequest(): Promise<boolean> {
  return (await headers()).has("x-egs-remote");
}

export const REMOTE_FORBIDDEN = "ทำได้เฉพาะบนคอม ไม่ใช่จากมือถือ";

/** For server actions that only the person at the computer may run (remote settings, uninstall, installs). */
export async function assertLocalRequest(): Promise<void> {
  if (await isRemoteRequest()) throw new Error(REMOTE_FORBIDDEN);
}
