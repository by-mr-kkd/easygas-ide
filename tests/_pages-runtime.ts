import { readFileSync } from "node:fs";
import { parsePagesRuntime, type PagesRuntime } from "../lib/pages/runtime.ts";

/**
 * The shim + dispatcher are Pro content on the licence server, not in this repository. Behaviour tests run
 * against a local copy when `EASYGAS_PAGES_RUNTIME_FIXTURE` points at the server body (a JSON file,
 * {v, shim, dispatcher}); without it they are skipped. Shape tests use the tiny stand-ins below.
 */
export function realRuntime(): PagesRuntime | null {
  const path = process.env.EASYGAS_PAGES_RUNTIME_FIXTURE;
  if (!path) return null;
  try {
    return parsePagesRuntime(readFileSync(path, "utf8"));
  } catch {
    return null;
  }
}

export const SKIP_REAL = "needs the server runtime: set EASYGAS_PAGES_RUNTIME_FIXTURE to the pages_runtime JSON";

/** Enough of a runtime to see where the app puts each piece. */
export const FAKE_RUNTIME: PagesRuntime = {
  shim: "(function(){ var EXEC_URL = __EGS_EXEC_URL__; window.google = { script: { run: { exec: EXEC_URL } } }; })();",
  dispatcher: "function doPost(e) { return egsRemoteHandle_(e); }\nfunction egsRemoteHandle_(e) { return e; }\n",
};
