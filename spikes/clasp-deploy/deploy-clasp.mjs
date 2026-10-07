// Spike B: deploy a local GAS project folder through the bundled clasp CLI (never touching its token).
// create → push → version → deployment → probe /exec → edit → push → version → update SAME deployment.
// Usage: node deploy-clasp.mjs <srcDir> <workDir>
import { spawnSync } from "node:child_process";
import { cpSync, readFileSync, writeFileSync, mkdirSync, realpathSync } from "node:fs";
import { join } from "node:path";

const [srcDir, workArg] = process.argv.slice(2);
mkdirSync(workArg, { recursive: true });
const work = realpathSync.native(workArg);
cpSync(srcDir, work, { recursive: true });

// In the product, clasp ships as a dependency and runs with Electron's Node; here: the global install.
const CLASP = join(process.env.APPDATA, "npm", "node_modules", "@google", "clasp", "build", "src", "index.js");

function clasp(args) {
  const t0 = Date.now();
  // -P pins the project: without it clasp walks UP the tree and silently reuses any stray .clasp.json
  // (it even exits 0 with "Project file already exists"), so never trust its exit code alone.
  const r = spawnSync(process.execPath, [CLASP, "-P", work, ...args], { cwd: work, encoding: "utf8", windowsHide: true });
  const out = (r.stdout ?? "").trim();
  const err = (r.stderr ?? "").trim();
  console.log(`$ clasp ${args.join(" ")}  [exit ${r.status}, ${Date.now() - t0}ms]\n${out}${err ? "\nSTDERR: " + err : ""}\n`);
  if (r.status !== 0) throw new Error(`clasp ${args[0]} failed`);
  return out;
}

function firstJson(text) {
  const i = text.search(/[[{]/);
  return i < 0 ? null : JSON.parse(text.slice(i));
}

async function probe(url, label) {
  const t0 = Date.now();
  const res = await fetch(url, { redirect: "follow" });
  const body = await res.text();
  const title = body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
  console.log(`PROBE ${label}: HTTP ${res.status} in ${Date.now() - t0}ms, title=${JSON.stringify(title)}, bytes=${body.length}, ` +
    `hasQty=${/จำนวน/.test(body)}, marker=${body.includes("EGS-SPIKE-V2")}, error=${/Script function not found|TypeError|ReferenceError|Exception:|server error/i.test(body)}`);
  return body;
}

clasp(["create-script", "--type", "standalone", "--title", "EasyGAS spike VAT (delete me)", "--rootDir", "."]);
const { scriptId } = JSON.parse(readFileSync(join(work, ".clasp.json"), "utf8"));
console.log(`scriptId=${scriptId}\n`);

clasp(["push", "--force"]);
const v1 = clasp(["create-version", "spike v1"]).match(/version\s+(\d+)/i)?.[1];
const dep = clasp(["create-deployment", "-V", v1, "-d", "spike v1"]);
const deploymentId = dep.match(/(AKfy[\w-]+)/)?.[1];
const execUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
console.log(`version=${v1} deploymentId=${deploymentId}\nexecUrl=${execUrl}\n`);

await probe(execUrl, "v1");
await probe(`${execUrl}?__egsdiag=egsverify`, "v1 diag");

// edit → redeploy onto the SAME deployment (never create a new one: 20/script cap + URL change)
const idx = join(work, "Index.html");
writeFileSync(idx, readFileSync(idx, "utf8").replace("</body>", "<!-- EGS-SPIKE-V2 --></body>"), "utf8");
clasp(["push", "--force"]);
const v2 = clasp(["create-version", "spike v2"]).match(/version\s+(\d+)/i)?.[1];
clasp(["update-deployment", deploymentId, "-V", v2, "-d", "spike v2", "--json"]);
await probe(execUrl, "v2 (same URL)");

console.log("DEPLOYMENTS:");
console.log(JSON.stringify(firstJson(clasp(["list-deployments", "--json"])) ?? "n/a", null, 1));
console.log(`\nRESULT scriptId=${scriptId} deploymentId=${deploymentId} v1=${v1} v2=${v2}`);
