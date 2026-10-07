// Spike B follow-up: restore the web-app manifest that `clasp create-script` overwrote, then push → version →
// update the EXISTING deployment and probe /exec (retrying briefly in case of propagation delay).
// Usage: node redeploy-fixed-manifest.mjs <workDir> <goodManifest> <deploymentId>
import { spawnSync } from "node:child_process";
import { copyFileSync, realpathSync } from "node:fs";
import { join } from "node:path";

const [workArg, goodManifest, deploymentId] = process.argv.slice(2);
const work = realpathSync.native(workArg);
const CLASP = join(process.env.APPDATA, "npm", "node_modules", "@google", "clasp", "build", "src", "index.js");

function clasp(args) {
  const r = spawnSync(process.execPath, [CLASP, "-P", work, ...args], { cwd: work, encoding: "utf8", windowsHide: true });
  const out = `${r.stdout ?? ""}${r.stderr ? "\nSTDERR: " + r.stderr : ""}`.trim();
  console.log(`$ clasp ${args.join(" ")}  [exit ${r.status}]\n${out}\n`);
  if (r.status !== 0) throw new Error(`clasp ${args[0]} failed`);
  return out;
}

copyFileSync(goodManifest, join(work, "appsscript.json"));
clasp(["push", "--force"]);
const v = clasp(["create-version", "spike v3 manifest fix"]).match(/version\s+(\d+)/i)?.[1];
clasp(["update-deployment", deploymentId, "-V", v, "-d", "spike v3", "--json"]);

const execUrl = `https://script.google.com/macros/s/${deploymentId}/exec`;
for (const [label, url] of [["page", execUrl], ["diag", `${execUrl}?__egsdiag=egsverify`]]) {
  for (let attempt = 1; attempt <= 4; attempt++) {
    const t0 = Date.now();
    const res = await fetch(url, { redirect: "follow" });
    const body = await res.text();
    const title = body.match(/<title>([^<]*)<\/title>/i)?.[1] ?? null;
    console.log(`PROBE ${label} #${attempt}: HTTP ${res.status} ${Date.now() - t0}ms title=${JSON.stringify(title)} bytes=${body.length} ` +
      `hasQty=${/จำนวน/.test(body)} marker=${body.includes("EGS-SPIKE-V2")} gasError=${/Script function not found|TypeError|ReferenceError|Exception:|server error/i.test(body)}`);
    if (res.status === 200) break;
    await new Promise((r) => setTimeout(r, 5000));
  }
}
console.log(`execUrl=${execUrl}`);
