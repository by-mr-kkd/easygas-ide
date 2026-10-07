/**
 * "เช็คกับ Google": does the local copy of a script match what is on Google now, and if not, which side
 * moved. Pure (no IO) so it is tested directly; lib/import.ts feeds it the files.
 */

export interface SyncFile {
  path: string;
  content: string;
}

/** same = nothing to do; google_newer = edited on script.google.com; local_newer = edits not yet published. */
export type SyncStatus = "same" | "google_newer" | "local_newer" | "both";

function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v && typeof v === "object") {
    return Object.fromEntries(
      Object.keys(v as Record<string, unknown>)
        .sort()
        .map((k) => [k, sortKeys((v as Record<string, unknown>)[k])]),
    );
  }
  return v;
}

/** Google re-formats appsscript.json and may change line endings: compare meaning, not bytes. */
function canonical(f: SyncFile): string {
  const text = f.content.replace(/\r\n/g, "\n").trimEnd();
  if (f.path !== "appsscript.json") return text;
  try {
    return JSON.stringify(sortKeys(JSON.parse(text)));
  } catch {
    return text;
  }
}

export function sameFiles(a: SyncFile[], b: SyncFile[]): boolean {
  if (a.length !== b.length) return false;
  const other = new Map(b.map((f) => [f.path, f]));
  return a.every((f) => {
    const g = other.get(f.path);
    return !!g && canonical(f) === canonical(g);
  });
}

/**
 * `baseline` = the files at the last sync (imported scripts keep them), so both sides can be told apart.
 * Without one (a script made in the app) only the local side is known: `localChangedSinceDeploy` says
 * whether the code changed after the last publish; if it did not, the difference came from Google.
 */
export function decideSync(args: {
  local: SyncFile[];
  remote: SyncFile[];
  baseline: SyncFile[] | null;
  localChangedSinceDeploy: boolean;
}): SyncStatus {
  const { local, remote, baseline } = args;
  if (sameFiles(local, remote)) return "same";
  if (!baseline) return args.localChangedSinceDeploy ? "local_newer" : "google_newer";
  const googleMoved = !sameFiles(baseline, remote);
  const localMoved = !sameFiles(baseline, local);
  if (googleMoved && !localMoved) return "google_newer";
  if (localMoved && !googleMoved) return "local_newer";
  return "both";
}
