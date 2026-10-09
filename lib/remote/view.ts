/**
 * What Settings → ใช้จากมือถือ shows (server-only, pure apart from types): the runtime snapshot plus the
 * Pro parts. Pro pairs through the Pro app on easygaside.tech, so its QR opens the fixed link with the
 * pairing code after "#" (never sent to any server) instead of the temporary tunnel address.
 */
import { relayPageUrl } from "./relay.ts";
import type { RemoteSnapshot } from "./runtime.ts";

export type RemoteView = RemoteSnapshot & { pro: boolean; relayUrl: string | null };

export function remoteView(snap: RemoteSnapshot, pro: boolean): RemoteView {
  const link = snap.relayName ?? snap.relayId;
  const relayUrl = pro && link ? relayPageUrl(link) : null;
  const pairing = snap.pairing && relayUrl && snap.mode === "tunnel" ? { ...snap.pairing, link: `${relayUrl}#c=${snap.pairing.code}` } : snap.pairing;
  return { ...snap, pairing, pro, relayUrl };
}
