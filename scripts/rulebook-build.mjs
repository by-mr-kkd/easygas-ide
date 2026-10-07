// Build the rulebook pack (rulebook/pack.json) from the vendored rule cards + rulebook/easygas-map.json.
//
//   node scripts/rulebook-build.mjs                      rebuild pack.json from rulebook/rules as they are
//   node scripts/rulebook-build.mjs --source <checkout>  first re-vendor the cards from a gas-best-practices
//                                                        checkout (version = its newest CHANGELOG heading)
//
// The pack is the ONE file the app reads: bundled at build time, and the same bytes (signed with
// scripts/rulebook-sign.mjs) are what a published update ships. tests/rulebook-pack.test.ts fails when
// pack.json is stale, so edit the map or the cards and rerun this — never edit pack.json by hand.
import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { copyFileSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
export const RULEBOOK_DIR = join(root, "rulebook");
export const PACK_FORMAT = 1;

const readJson = (p) => JSON.parse(readFileSync(p, "utf8"));
const lf = (s) => s.replace(/\r\n/g, "\n");

/** Assemble the pack object from a directory of <id>.md cards, the map and the source record. */
export function buildPack({ rulesDir, map, source }) {
  const rules = map.rules.map((r) => {
    const content = lf(readFileSync(join(rulesDir, `${r.id}.md`), "utf8"));
    return {
      id: r.id,
      title: r.title,
      when: r.when,
      keywords: r.keywords,
      features: r.features,
      kinds: r.kinds,
      baseline: r.baseline === true,
      bytes: Buffer.byteLength(content, "utf8"),
      sha256: createHash("sha256").update(content, "utf8").digest("hex"),
      content,
    };
  });
  return {
    format: PACK_FORMAT,
    version: source.version,
    source: source.source,
    commit: source.commit,
    minAppVersion: map.minAppVersion,
    rules,
  };
}

/** The exact bytes of pack.json for a pack object (what gets signed). */
export const serializePack = (pack) => JSON.stringify(pack, null, 1) + "\n";

function vendorFrom(sourceDir, map) {
  const srcRules = join(sourceDir, "rules");
  if (!existsSync(srcRules)) throw new Error(`no rules/ folder in ${sourceDir}`);
  const wanted = new Set(map.rules.map((r) => r.id));
  const upstream = readdirSync(srcRules)
    .filter((f) => f.endsWith(".md"))
    .map((f) => f.slice(0, -3));

  const unmapped = upstream.filter((id) => !wanted.has(id) && !(id in map.excluded));
  if (unmapped.length > 0) {
    console.warn(`! not in easygas-map.json (left out of the pack): ${unmapped.join(", ")}`);
    console.warn("  add each to \"rules\" or \"excluded\" in rulebook/easygas-map.json, then rerun");
  }
  const missing = [...wanted].filter((id) => !upstream.includes(id));
  if (missing.length > 0) throw new Error(`mapped rules missing upstream: ${missing.join(", ")}`);

  const dest = join(RULEBOOK_DIR, "rules");
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(dest, { recursive: true });
  for (const id of wanted) writeFileSync(join(dest, `${id}.md`), lf(readFileSync(join(srcRules, `${id}.md`), "utf8")));
  if (existsSync(join(sourceDir, "LICENSE"))) copyFileSync(join(sourceDir, "LICENSE"), join(RULEBOOK_DIR, "LICENSE"));

  const changelog = existsSync(join(sourceDir, "CHANGELOG.md")) ? readFileSync(join(sourceDir, "CHANGELOG.md"), "utf8") : "";
  const version = /^##\s+v(\d+\.\d+\.\d+)/m.exec(changelog)?.[1];
  if (!version) throw new Error("could not read a version (## vX.Y.Z) from the source CHANGELOG.md");
  let commit = "";
  try {
    commit = execFileSync("git", ["-C", sourceDir, "rev-parse", "HEAD"], { encoding: "utf8" }).trim();
  } catch {
    console.warn("! source is not a git checkout — commit left empty");
  }
  const prev = readJson(join(RULEBOOK_DIR, "source.json"));
  const next = { source: prev.source, version, commit };
  writeFileSync(join(RULEBOOK_DIR, "source.json"), JSON.stringify(next, null, 2) + "\n");
  return next;
}

function main() {
  const args = process.argv.slice(2);
  const srcIdx = args.indexOf("--source");
  const map = readJson(join(RULEBOOK_DIR, "easygas-map.json"));
  const source =
    srcIdx >= 0 ? vendorFrom(resolve(args[srcIdx + 1] ?? ""), map) : readJson(join(RULEBOOK_DIR, "source.json"));
  const pack = buildPack({ rulesDir: join(RULEBOOK_DIR, "rules"), map, source });
  writeFileSync(join(RULEBOOK_DIR, "pack.json"), serializePack(pack));
  const kb = Math.round(pack.rules.reduce((a, r) => a + r.bytes, 0) / 1024);
  console.log(`rulebook v${pack.version}: ${pack.rules.length} cards, ${kb} KB → rulebook/pack.json`);
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) main();
