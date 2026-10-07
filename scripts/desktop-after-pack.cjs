// electron-builder afterPack hook: put the server and clasp beside the app, exactly as staged.
//
// They are copied here by hand instead of through `extraResources` because the packager filters that
// copy: it silently drops every `node_modules` folder and every dot-folder (so `.next` too), and what
// arrives cannot start. A plain recursive copy has no opinions.
const { cpSync, existsSync } = require("node:fs");
const { join } = require("node:path");

exports.default = async function afterPack(context) {
  const staged = join(context.packager.projectDir, "dist", "desktop", "resources");
  const target = join(context.appOutDir, "resources");
  for (const name of ["app", "clasp"]) {
    if (!existsSync(join(staged, name))) throw new Error(`staged folder missing: ${name} (run scripts/build-desktop.mjs)`);
    cpSync(join(staged, name), join(target, name), { recursive: true });
  }
  for (const must of ["app/server.js", "app/desktop-entry.js", "app/.next/BUILD_ID", "app/node_modules/next/package.json", "clasp/clasp.mjs"]) {
    if (!existsSync(join(target, must))) throw new Error(`packaged app is incomplete: resources/${must}`);
  }
};
