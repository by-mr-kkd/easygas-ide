import { strict as assert } from "node:assert";
import { createPublicKey } from "node:crypto";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { test } from "node:test";
import { parsePack } from "../lib/rulebook/format.ts";
import { RULEBOOK_PUBLIC_KEYS, rulebookUrls } from "../lib/rulebook/trust.ts";
import { RULEBOOK_DIR, buildPack, serializePack } from "../scripts/rulebook-build.mjs";

const read = (name: string) => readFileSync(join(RULEBOOK_DIR, name), "utf8");
const map = JSON.parse(read("easygas-map.json"));
const source = JSON.parse(read("source.json"));

test("rulebook/pack.json is exactly what the build script produces (run `npm run rulebook:build`)", () => {
  const rebuilt = serializePack(buildPack({ rulesDir: join(RULEBOOK_DIR, "rules"), map, source }));
  assert.equal(read("pack.json").replace(/\r\n/g, "\n"), rebuilt);
});

test("the bundled pack passes the same validation as a downloaded one", () => {
  const pack = parsePack(JSON.parse(read("pack.json")));
  assert.equal(pack.version, source.version);
  assert.ok(pack.rules.length >= 15);
});

test("every vendored card is mapped, and every mapped card is vendored", () => {
  const vendored = readdirSync(join(RULEBOOK_DIR, "rules")).map((f) => f.replace(/\.md$/, "")).sort();
  const mapped = map.rules.map((r: { id: string }) => r.id).sort();
  assert.deepEqual(vendored, mapped);
});

test("no rule is both mapped and excluded", () => {
  for (const r of map.rules) assert.ok(!(r.id in map.excluded), r.id);
});

test("cards the app must not ship stay excluded (they tell the user to deploy by hand)", () => {
  for (const id of ["deployment-versioning", "external-frontend", "project-structure", "testing-debugging"]) {
    assert.ok(id in map.excluded, id);
  }
});

test("every trusted key is a real Ed25519 public key", () => {
  assert.ok(RULEBOOK_PUBLIC_KEYS.length >= 1);
  for (const pem of RULEBOOK_PUBLIC_KEYS) assert.equal(createPublicKey(pem).asymmetricKeyType, "ed25519");
});

test("no private key material is checked into the repository's rulebook or trust files", () => {
  const trust = readFileSync(join(RULEBOOK_DIR, "..", "lib", "rulebook", "trust.ts"), "utf8");
  assert.doesNotMatch(trust + read("pack.json"), /PRIVATE KEY/);
});

test("update URL: https by default, plain http only for this machine", () => {
  const saved = process.env.EASYGAS_RULEBOOK_URL;
  try {
    delete process.env.EASYGAS_RULEBOOK_URL;
    assert.match(rulebookUrls()!.pack, /^https:\/\/github\.com\/.+\/releases\/latest\/download\/easygas-rulebook\.json$/);
    assert.equal(rulebookUrls()!.signature, `${rulebookUrls()!.pack}.sig`);
    process.env.EASYGAS_RULEBOOK_URL = "http://127.0.0.1:8123/easygas-rulebook.json";
    assert.ok(rulebookUrls());
    for (const bad of ["http://example.com/p.json", "http://127.0.0.1.evil.test/p.json", "file:///c:/p.json", "ftp://x/p.json"]) {
      process.env.EASYGAS_RULEBOOK_URL = bad;
      assert.equal(rulebookUrls(), null, bad);
    }
  } finally {
    if (saved === undefined) delete process.env.EASYGAS_RULEBOOK_URL;
    else process.env.EASYGAS_RULEBOOK_URL = saved;
  }
});
