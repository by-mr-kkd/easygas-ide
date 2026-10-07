// Create the Ed25519 key pair that signs rulebook updates. Run ONCE by the publisher.
//
//   node scripts/rulebook-keygen.mjs [--out <private-key.pem>]
//
// The private key is written OUTSIDE this repository (default: <home>/.easygas-ide-keys/) and is never
// printed. Only the public key is printed — paste it into lib/rulebook/trust.ts. Anyone holding the
// private key can change the instructions every installed copy gives its AI, so keep it offline and
// backed up; if it leaks, ship an app update that removes its public key from trust.ts.
import { generateKeyPairSync } from "node:crypto";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const home = process.env.USERPROFILE || process.env.HOME;
const outIdx = process.argv.indexOf("--out");
const out = resolve(outIdx >= 0 ? process.argv[outIdx + 1] ?? "" : join(home ?? "", ".easygas-ide-keys", "rulebook-signing-key.pem"));

if (outIdx < 0 && !home) throw new Error("no home directory found — pass --out <path>");
const rel = relative(root, out);
// a path on another drive comes back absolute (Windows), which is also outside the repository
if (!rel.startsWith("..") && !isAbsolute(rel)) throw new Error("refusing to write the private key inside the repository");
if (existsSync(out)) throw new Error(`a key already exists at ${out} — delete it yourself if you really mean to replace it`);

const { publicKey, privateKey } = generateKeyPairSync("ed25519");
mkdirSync(dirname(out), { recursive: true });
writeFileSync(out, privateKey.export({ type: "pkcs8", format: "pem" }), { mode: 0o600, flag: "wx" });

console.log(`private key written to: ${out}  (keep it secret and backed up)`);
console.log("public key — add to RULEBOOK_PUBLIC_KEYS in lib/rulebook/trust.ts:\n");
console.log(publicKey.export({ type: "spki", format: "pem" }));
