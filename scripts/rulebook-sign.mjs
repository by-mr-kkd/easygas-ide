// Sign rulebook/pack.json for publishing.
//
//   node scripts/rulebook-sign.mjs [--key <private-key.pem>] [--out <dir>]
//
// Writes <out>/easygas-rulebook.json (a byte-for-byte copy of pack.json) and easygas-rulebook.json.sig
// (base64 Ed25519 signature of those bytes). Upload BOTH files to a GitHub release of the rulebook
// repository; the app downloads them from releases/latest and installs the pack only when the signature
// matches a key in lib/rulebook/trust.ts.
import { createPrivateKey, sign } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const arg = (name, fallback) => {
  const i = process.argv.indexOf(name);
  return i >= 0 ? process.argv[i + 1] ?? "" : fallback;
};
const home = process.env.USERPROFILE || process.env.HOME || "";
const keyPath = resolve(arg("--key", process.env.EASYGAS_RULEBOOK_KEY || join(home, ".easygas-ide-keys", "rulebook-signing-key.pem")));
const outDir = resolve(arg("--out", join(root, "dist", "rulebook")));

const bytes = readFileSync(join(root, "rulebook", "pack.json"));
const key = createPrivateKey(readFileSync(keyPath));
const signature = sign(null, bytes, key).toString("base64");

mkdirSync(outDir, { recursive: true });
writeFileSync(join(outDir, "easygas-rulebook.json"), bytes);
writeFileSync(join(outDir, "easygas-rulebook.json.sig"), signature + "\n");
console.log(`signed rulebook v${JSON.parse(bytes.toString("utf8")).version} → ${outDir}`);
console.log("upload easygas-rulebook.json and easygas-rulebook.json.sig to a release of the rulebook repository");
