// Release guard: fail the build if the standalone bundle would ship anything from OUTSIDE the project
// (e.g. a user-profile folder holding other apps' credentials) or a local secret/data file.
//  1. Every .nft.json under .next lists files the standalone build copies; each must be inside the project.
//  2. The .next/standalone output itself must not contain settings, credentials or env files.
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { dirname, isAbsolute, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const nextDir = join(root, ".next");
const SECRET_NAME = /^(\.env(\..*)?|\.clasprc\.json|settings\.json|credentials\.json|auth\.json|.*\.pem|.*\.key)$/i;
const SECRET_PATH = /[\/](AppData|\.claude|\.config|\.ssh)[\/]/i;
const problems = [];

function walk(dir, onFile, skip = () => false) {
  for (const ent of readdirSync(dir, { withFileTypes: true })) {
    const p = join(dir, ent.name);
    if (ent.isDirectory()) {
      if (!skip(p)) walk(p, onFile, skip);
    } else onFile(p);
  }
}

// 1. traced inputs
walk(
  nextDir,
  (p) => {
    if (!p.endsWith(".nft.json")) return;
    for (const f of JSON.parse(readFileSync(p, "utf8")).files) {
      const rel = relative(root, resolve(dirname(p), f));
      if (rel.startsWith("..") || isAbsolute(rel) || /[A-Za-z]:[\/]/.test(f)) problems.push(`traced outside project: ${f}`);
    }
  },
  (p) => p === join(nextDir, "cache"),
);

// 2. the shipped artifact
const standalone = join(nextDir, "standalone");
if (existsSync(standalone)) {
  walk(
    standalone,
    (p) => {
      const rel = relative(standalone, p);
      const name = rel.split(/[\/]/).pop() ?? "";
      const inDeps = rel.split(/[\/]/).includes("node_modules");
      if ((!inDeps && SECRET_NAME.test(name)) || SECRET_PATH.test(`/${rel}`)) problems.push(`suspicious file in standalone: ${rel}`);
    },
  );
}

if (problems.length > 0) {
  console.error(`check-trace: ${problems.length} problem(s) — refusing to ship:`);
  for (const p of problems.slice(0, 25)) console.error(`  ${p}`);
  process.exit(1);
}
console.log("check-trace: bundle contains only project files");
