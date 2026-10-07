import { randomUUID } from "node:crypto";
import { mkdir, rename, rm, writeFile } from "node:fs/promises";
import { rulebookDir } from "@/lib/local/paths";
import { MAX_PACK_BYTES, RulebookError, verifyAndParsePack } from "@/lib/rulebook/format";
import { APP_VERSION, downloadedPackPath, downloadedSignaturePath, getActivePack, type PackOrigin } from "@/lib/rulebook/store";
import { RULEBOOK_PUBLIC_KEYS, rulebookUrls } from "@/lib/rulebook/trust";
import { getSettings, updateAppSettings } from "@/lib/settings";

/**
 * Rulebook updates (server-only). The app only ever DOWNLOADS: two files from the rulebook repository's
 * latest GitHub release (the pack and its signature). Nothing about the user or their projects is sent.
 * A pack is installed only after lib/rulebook/format.verifyAndParsePack accepts it; any failure leaves
 * the current rulebook in place.
 */

const FETCH_TIMEOUT_MS = 15_000;
const AUTO_CHECK_EVERY_MS = 24 * 60 * 60 * 1000;
const MAX_SIGNATURE_BYTES = 512;

export type UpdateStatus = "updated" | "current" | "unavailable" | "rejected";
export interface UpdateResult {
  status: UpdateStatus;
  /** Rulebook version in use after the check. */
  version: string;
  /** Machine-readable reason for unavailable / rejected. */
  detail?: string;
}

export interface RulebookStatus {
  version: string;
  origin: PackOrigin;
  source: string;
  cards: number;
  autoUpdate: boolean;
  checkedAt: string | null;
  lastStatus: UpdateStatus | null;
}

/** Read a response body, refusing anything larger than `limit` (never buffer an unbounded download). */
async function readCapped(res: Response, limit: number): Promise<Uint8Array> {
  const declared = Number(res.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > limit) throw new RulebookError("too_large");
  if (!res.body) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  let total = 0;
  const reader = res.body.getReader();
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.byteLength;
    if (total > limit) {
      await reader.cancel();
      throw new RulebookError("too_large");
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks);
}

async function download(url: string, limit: number): Promise<Uint8Array | null> {
  const res = await fetch(url, { redirect: "follow", signal: AbortSignal.timeout(FETCH_TIMEOUT_MS), cache: "no-store" });
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`http_${res.status}`);
  return readCapped(res, limit);
}

async function install(bytes: Uint8Array, signature: string): Promise<void> {
  const dir = rulebookDir();
  await mkdir(dir, { recursive: true });
  const tag = randomUUID();
  const tmpPack = `${downloadedPackPath()}.${tag}.tmp`;
  const tmpSig = `${downloadedSignaturePath()}.${tag}.tmp`;
  try {
    await writeFile(tmpPack, bytes);
    await writeFile(tmpSig, signature, "utf8");
    // A crash between the two renames leaves a pack whose signature does not match; getActivePack
    // rejects that pair and keeps using the bundled rulebook.
    await rename(tmpPack, downloadedPackPath());
    await rename(tmpSig, downloadedSignaturePath());
  } finally {
    await Promise.all([rm(tmpPack, { force: true }), rm(tmpSig, { force: true })]);
  }
}

/**
 * Remember the outcome for the Settings page. `reached` = the release host answered: only then does
 * the daily timer restart, so a launch with no network tries again next time instead of waiting a
 * day. Never throws — bookkeeping must not turn a finished install into a reported failure.
 */
async function record(status: UpdateStatus, reached: boolean): Promise<void> {
  try {
    await updateAppSettings({
      rulebook_last: status,
      ...(reached ? { rulebook_checked_at: new Date().toISOString() } : {}),
    });
  } catch (e) {
    console.warn("[rulebook] could not record the check:", (e as Error).message);
  }
}

const g = globalThis as unknown as { __egsRulebookCheck?: Promise<UpdateResult> };

async function runCheck(): Promise<UpdateResult> {
  const current = (await getActivePack()).pack.version;
  const urls = rulebookUrls();
  if (!urls) return { status: "unavailable", version: current, detail: "bad_url" };
  try {
    const [bytes, sig] = await Promise.all([download(urls.pack, MAX_PACK_BYTES), download(urls.signature, MAX_SIGNATURE_BYTES)]);
    if (!bytes || !sig) {
      await record("unavailable", true);
      return { status: "unavailable", version: current, detail: "not_published" };
    }
    const signature = Buffer.from(sig).toString("utf8").trim();
    const pack = verifyAndParsePack(bytes, signature, {
      publicKeys: RULEBOOK_PUBLIC_KEYS,
      currentVersion: current,
      appVersion: APP_VERSION,
    });
    await install(bytes, signature);
    await record("updated", true);
    return { status: "updated", version: pack.version };
  } catch (e) {
    if (e instanceof RulebookError && e.code === "downgrade") {
      await record("current", true);
      return { status: "current", version: current };
    }
    const rejected = e instanceof RulebookError;
    const detail = rejected ? e.code : e instanceof Error && e.name === "TimeoutError" ? "timeout" : "network";
    console.warn("[rulebook] update check failed:", (e as Error).message);
    await record(rejected ? "rejected" : "unavailable", rejected);
    return { status: rejected ? "rejected" : "unavailable", version: current, detail };
  }
}

/** Check now (the Settings button). Concurrent callers share one in-flight check. */
export function checkRulebookUpdate(): Promise<UpdateResult> {
  return (g.__egsRulebookCheck ??= runCheck().finally(() => {
    g.__egsRulebookCheck = undefined;
  }));
}

/** Background check, at most once a day, only while the user leaves automatic updates on. Never throws. */
export async function maybeAutoCheckRulebook(): Promise<void> {
  try {
    const { app } = await getSettings();
    if (app.rulebook_auto === "off") return;
    const last = Date.parse(app.rulebook_checked_at ?? "");
    if (Number.isFinite(last) && Date.now() - last < AUTO_CHECK_EVERY_MS) return;
    await checkRulebookUpdate();
  } catch (e) {
    console.warn("[rulebook] auto check skipped:", (e as Error).message);
  }
}

export async function getRulebookStatus(): Promise<RulebookStatus> {
  const [{ pack, origin }, { app }] = await Promise.all([getActivePack(), getSettings()]);
  const last = app.rulebook_last as UpdateStatus | undefined;
  return {
    version: pack.version,
    origin,
    source: pack.source,
    cards: pack.rules.length,
    autoUpdate: app.rulebook_auto !== "off",
    checkedAt: app.rulebook_checked_at ?? null,
    lastStatus: last ?? null,
  };
}
