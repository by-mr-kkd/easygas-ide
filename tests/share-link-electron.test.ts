import { strict as assert } from "node:assert";
import { readFileSync } from "node:fs";
import { test } from "node:test";

/**
 * electron/main.js is plain CommonJS that requires "electron"; the protocol-link functions are pure, so they
 * are lifted out of the source here and run on their own.
 */
function lifted(): { appPathForLink: (raw: unknown) => string | null; linkFromArgv: (argv: string[]) => string | null } {
  const src = readFileSync(new URL("../electron/main.js", import.meta.url), "utf8");
  const pick = (name: string): string => {
    const m = src.match(new RegExp(`function ${name}\\([^)]*\\) \\{[\\s\\S]*?\\n\\}`));
    if (!m) throw new Error(`${name} not found in main.js`);
    return m[0];
  };
  const body = `${pick("appPathForLink")}\n${pick("linkFromArgv")}\nreturn { appPathForLink, linkFromArgv };`;
  return new Function(body)() as ReturnType<typeof lifted>;
}

test("easygas://clone/<slug> opens the clone screen with the slug; anything else is ignored", () => {
  const { appPathForLink, linkFromArgv } = lifted();
  assert.equal(appPathForLink("easygas://clone/k7m2pq9xz3"), "/projects?mode=clone&clone=k7m2pq9xz3");
  assert.equal(appPathForLink("easygas://clone/K7M2PQ9XZ3/"), "/projects?mode=clone&clone=k7m2pq9xz3");
  assert.equal(appPathForLink("easygas://clone/k7m2pq9xz3?x=1"), "/projects?mode=clone&clone=k7m2pq9xz3");
  assert.equal(appPathForLink("easygas://settings/anything"), null);
  assert.equal(appPathForLink("easygas://clone/../../etc"), null);
  assert.equal(appPathForLink("https://easygaside.tech/s/k7m2pq9xz3"), null);
  assert.equal(appPathForLink(42), null);
  assert.equal(linkFromArgv(["EasyGAS IDE.exe", "--flag", "easygas://clone/k7m2pq9xz3"]), "/projects?mode=clone&clone=k7m2pq9xz3");
  assert.equal(linkFromArgv(["EasyGAS IDE.exe"]), null);
});
