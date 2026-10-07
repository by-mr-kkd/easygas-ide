// Spike A helper: pull GAS_RULEBOOK + WEBAPP_ADDENDUM out of the old repo's lib/gas-codegen.ts
// and append a CLI-engine adapter section. Usage: node extract-rulebook.mjs <gas-codegen.ts> <out.md>
import { readFileSync, writeFileSync } from "node:fs";

const [src, out] = process.argv.slice(2);
const ts = readFileSync(src, "utf8");

function templateConst(name) {
  const start = ts.indexOf(`const ${name} = \``);
  if (start < 0) throw new Error(`missing ${name}`);
  const bodyStart = ts.indexOf("`", start) + 1;
  const end = ts.indexOf("`;", bodyStart);
  return ts.slice(bodyStart, end).replace(/\\`/g, "`").replace(/\\\$/g, "$");
}

const CLI_ADAPTER = `

## Engine adapter (CLI mode) — overrides the tool names above
You are running inside a local project folder. The current working directory IS the Apps Script project.
- write_file → use the Write tool with a path relative to the current directory (e.g. Code.gs, Index.html, appsscript.json).
- edit_file → use the Edit tool. delete_file → not available; tell the user which file to remove.
- read_project → use Glob + Read on the current directory.
- propose_spec → not available in this mode. Skip the spec step and build directly.
- NEVER read or write anything outside the current directory.`;

writeFileSync(out, templateConst("GAS_RULEBOOK") + templateConst("WEBAPP_ADDENDUM") + CLI_ADAPTER, "utf8");
console.log(`wrote ${out}`);
