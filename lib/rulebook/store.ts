import { readFile, stat } from "node:fs/promises";
import { join } from "node:path";
import pkg from "@/package.json";
import bundledJson from "@/rulebook/pack.json";
import { rulebookDir } from "@/lib/local/paths";
import { parsePack, verifyAndParsePack, type RulebookPack } from "@/lib/rulebook/format";
import { RULEBOOK_PUBLIC_KEYS } from "@/lib/rulebook/trust";

/**
 * The rulebook pack in use (server-only): the copy bundled with the app, or a downloaded one when it is
 * signed, valid and strictly newer. The downloaded files are re-verified whenever they change on disk,
 * so a hand-edited or half-written pack silently falls back to the bundled copy.
 */

export type PackOrigin = "bundled" | "downloaded";
export interface ActivePack {
  pack: RulebookPack;
  origin: PackOrigin;
}

export const APP_VERSION: string = pkg.version;
export const downloadedPackPath = (): string => join(rulebookDir(), "pack.json");
export const downloadedSignaturePath = (): string => join(rulebookDir(), "pack.json.sig");

let bundled: RulebookPack | null = null;
export function getBundledPack(): RulebookPack {
  return (bundled ??= parsePack(bundledJson));
}

const g = globalThis as unknown as { __egsRulebook?: { stamp: string; active: ActivePack } };

async function fileStamp(path: string): Promise<string | null> {
  try {
    const s = await stat(path);
    return `${s.mtimeMs}:${s.size}`;
  } catch {
    return null;
  }
}

export async function getActivePack(): Promise<ActivePack> {
  const base = getBundledPack();
  const [packStamp, sigStamp] = await Promise.all([fileStamp(downloadedPackPath()), fileStamp(downloadedSignaturePath())]);
  const stamp = `${base.version}|${rulebookDir()}|${packStamp}|${sigStamp}`;
  if (g.__egsRulebook?.stamp === stamp) return g.__egsRulebook.active;

  let active: ActivePack = { pack: base, origin: "bundled" };
  if (packStamp && sigStamp) {
    try {
      const [bytes, signature] = await Promise.all([readFile(downloadedPackPath()), readFile(downloadedSignaturePath(), "utf8")]);
      const pack = verifyAndParsePack(bytes, signature, {
        publicKeys: RULEBOOK_PUBLIC_KEYS,
        currentVersion: base.version, // an app update that bundles a newer pack wins over an old download
        appVersion: APP_VERSION,
      });
      active = { pack, origin: "downloaded" };
    } catch (e) {
      console.warn("[rulebook] downloaded pack not used:", (e as Error).message);
    }
  }
  g.__egsRulebook = { stamp, active };
  return active;
}
