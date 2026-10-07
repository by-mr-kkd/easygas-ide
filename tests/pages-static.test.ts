import { strict as assert } from "node:assert";
import { test } from "node:test";
import vm from "node:vm";
import { DoPostConflictError, withDispatcher } from "../lib/pages/dispatcher.ts";
import { InvalidExecUrlError, buildRunShim } from "../lib/pages/run-shim.ts";
import { NoEntryPageError, StaticPageScriptletError, buildStaticPage, composeEntryPage } from "../lib/pages/static-page.ts";

const EXEC = "https://script.google.com/macros/s/AKfycbxyz_ABC-123/exec";

// ---------- run shim (browser source in node:vm) ----------

interface FakeFetchCall {
  url: string;
  init: { method: string; body: string; headers?: unknown };
}

/** Boot the shim in a bare "browser": `window` is the context global, `fetch` answers from `answer`. */
function bootShim(answer: (call: FakeFetchCall) => Promise<string>) {
  const calls: FakeFetchCall[] = [];
  const errors: unknown[] = [];
  const sandbox: Record<string, unknown> = {
    console: { error: (...a: unknown[]) => errors.push(a) },
    URLSearchParams,
    location: { search: "?a=1&a=2&b=x", hash: "#top", pathname: "/p/", origin: "https://u.github.io" },
    history: { pushState: (s: unknown, _t: string, u: string) => calls.push({ url: "push:" + u, init: { method: "", body: JSON.stringify(s) } }), replaceState() {} },
    addEventListener() {},
    fetch: (url: string, init: FakeFetchCall["init"]) => {
      const call = { url, init };
      calls.push(call);
      return answer(call).then((text) => ({ text: () => Promise.resolve(text) }));
    },
  };
  sandbox.window = sandbox;
  const ctx = vm.createContext(sandbox);
  vm.runInContext(buildRunShim(EXEC), ctx);
  const google = vm.runInContext("google", ctx);
  return { google, calls, errors };
}

const tick = () => new Promise((r) => setTimeout(r, 5));
// objects born inside the vm have the vm realm prototypes: compare by value, not by prototype
const plain = (v: unknown) => JSON.parse(JSON.stringify(v));
const isError = (e: unknown) => Object.prototype.toString.call(e) === "[object Error]";

test("shim: success handler gets value + user object; POST body is {fn,args} with no Content-Type", async () => {
  const { google, calls } = bootShim(async () => JSON.stringify({ ok: true, value: { rows: [1, 2] } }));
  const got: unknown[] = [];
  const ret = google.script.run.withUserObject({ tag: "u" }).withSuccessHandler((v: unknown, u: unknown) => got.push(v, u)).listRows("sheet1", 5);
  assert.equal(ret, undefined, "a server call returns nothing, like the real google.script.run");
  await tick();
  assert.deepEqual(plain(got), [{ rows: [1, 2] }, { tag: "u" }]);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, EXEC);
  assert.equal(calls[0].init.method, "POST");
  assert.equal(calls[0].init.headers, undefined, "no Content-Type: the browser sends text/plain without a preflight");
  assert.deepEqual(JSON.parse(calls[0].init.body), { fn: "listRows", args: ["sheet1", 5] });
});

test("shim: server error, non-JSON answer and network failure reach the failure handler as Errors", async () => {
  let mode = "server";
  const { google, errors } = bootShim(async () => {
    if (mode === "network") throw new TypeError("Failed to fetch");
    if (mode === "html") return "<html>login</html>";
    return JSON.stringify({ ok: false, error: { name: "SheetError", message: "ชีตไม่พบ" } });
  });
  const fails: Error[] = [];
  const run = google.script.run.withFailureHandler((e: Error, u: unknown) => fails.push(Object.assign(e, { u }))).withUserObject("U");
  run.save({ a: 1 });
  await tick();
  mode = "html";
  run.save();
  await tick();
  mode = "network";
  run.save();
  await tick();
  assert.equal(fails.length, 3);
  assert.ok(fails.every((e) => isError(e) && (e as Error & { u: string }).u === "U"));
  assert.equal(fails[0].name, "SheetError");
  assert.equal(fails[0].message, "ชีตไม่พบ");
  assert.match(fails[1].message, /ผิดรูปแบบ/);
  assert.match(fails[2].message, /เชื่อมต่อ/);
  assert.equal(fails[2].cause instanceof TypeError, true);
  // without a failure handler the error is only logged, never thrown into the page
  google.script.run.save();
  await tick();
  assert.equal(errors.length, 1);
});

test("shim: with* builders return new runners and never mutate the one they were called on", async () => {
  const { google } = bootShim(async () => JSON.stringify({ ok: true, value: 1 }));
  const seen: string[] = [];
  const base = google.script.run.withSuccessHandler(() => seen.push("base"));
  const other = base.withSuccessHandler(() => seen.push("other"));
  assert.notEqual(base, other);
  base.ping();
  other.ping();
  google.script.run.ping(); // no handler at all: nothing happens
  await tick();
  assert.deepEqual(seen.sort(), ["base", "other"]);
  assert.equal(google.script.run.then, undefined, "not thenable, so a runner can sit in a Promise chain");
});

test("shim: a single <form> argument is sent as a field object; a chosen file is refused in Thai", async () => {
  const { google, calls } = bootShim(async () => JSON.stringify({ ok: true }));
  const form = {
    tagName: "FORM",
    elements: [
      { name: "title", type: "text", value: "hello" },
      { name: "tags", type: "checkbox", value: "a", checked: true },
      { name: "tags", type: "checkbox", value: "b", checked: true },
      { name: "tags", type: "checkbox", value: "c", checked: false },
      { name: "", type: "text", value: "unnamed" },
      { name: "off", type: "text", value: "x", disabled: true },
      { name: "go", type: "submit", value: "Send" },
      { name: "photo", type: "file", files: [] },
    ],
  };
  google.script.run.submit(form);
  await tick();
  assert.deepEqual(JSON.parse(calls[0].init.body), { fn: "submit", args: [{ title: "hello", tags: ["a", "b"] }] });

  const fails: Error[] = [];
  google.script.run.withFailureHandler((e: Error) => fails.push(e)).submit({ ...form, elements: [{ name: "photo", type: "file", files: [{}] }] });
  await tick();
  assert.equal(calls.length, 1, "nothing was sent");
  assert.match(fails[0].message, /ไฟล์/);
});

test("shim: url.getLocation and history mirror window.location / history", () => {
  const { google, calls } = bootShim(async () => "");
  let loc: Record<string, unknown> = {};
  google.script.url.getLocation((l: Record<string, unknown>) => (loc = l));
  assert.deepEqual(plain(loc), { hash: "top", parameter: { a: "1", b: "x" }, parameters: { a: ["1", "2"], b: ["x"] } });
  google.script.history.push({ s: 1 }, { q: "ซื้อ", n: [1, 2] }, "h");
  assert.equal(calls[0].url, "push:/p/?q=%E0%B8%8B%E0%B8%B7%E0%B9%89%E0%B8%AD&n=1&n=2#h");
  assert.equal(typeof google.script.host.close, "function");
  assert.equal(typeof google.script.host.editor.focus, "function");
});

test("shim source is plain ASCII, carries the URL safely and refuses a bad URL", () => {
  const src = buildRunShim(EXEC);
  assert.equal(/^[\x00-\x7f]*$/.test(src), true);
  assert.equal(src.includes("</"), false);
  assert.ok(src.includes(JSON.stringify(EXEC)));
  for (const bad of ["http://script.google.com/macros/s/x/exec", "https://script.google.com/macros/s/x/dev", "https://evil.com/macros/s/x/exec", "https://script.google.com/macros/s/x</script>/exec"]) {
    assert.throws(() => buildRunShim(bad), InvalidExecUrlError);
  }
});

// ---------- static page composition ----------

const PROJECT = [
  { path: "Code.gs", content: "function doGet(){ return HtmlService.createTemplateFromFile('Index').evaluate().setTitle('ร้าน <KKD>'); }\nfunction include(f){ return HtmlService.createHtmlOutputFromFile(f).getContent(); }" },
  { path: "Index.html", content: "<!DOCTYPE html>\n<html>\n<head>\n<base target=\"_top\">\n<?!= include('Styles'); ?>\n</head>\n<body>\n<div id=app></div>\n<?!= include(\"Script\") ?>\n</body>\n</html>" },
  { path: "Styles.html", content: "<style>body{margin:0}</style>" },
  { path: "Script.html", content: "<script>\n<?!= HtmlService.createHtmlOutputFromFile('Lib').getContent(); ?>\ngoogle.script.run.load();\n</script>" },
  { path: "Lib.html", content: "function lib(){}" },
];

test("composes Index.html with nested includes the way the preview does", () => {
  const html = composeEntryPage(PROJECT);
  assert.ok(html.includes("<style>body{margin:0}</style>"));
  assert.ok(html.includes("function lib(){}\ngoogle.script.run.load();"));
  assert.equal(html.includes("<?"), false);
  // case-insensitive fallback for the entry page
  assert.ok(composeEntryPage([{ path: "index.html", content: "<p>x</p>" }]).includes("<p>x</p>"));
  assert.throws(() => composeEntryPage([{ path: "Code.gs", content: "" }]), NoEntryPageError);
});

test("buildStaticPage: shim before any script, GAS-supplied head tags added, .nojekyll present", () => {
  const out = buildStaticPage(PROJECT, { execUrl: EXEC });
  assert.deepEqual(out.map((f) => f.path), ["index.html", ".nojekyll"]);
  assert.equal(out[1].content, "");
  const html = out[0].content;
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  const shimAt = html.indexOf("<script data-egs-run-shim>");
  assert.ok(shimAt > 0);
  assert.ok(shimAt < html.indexOf("<script>\nfunction lib"), "shim precedes the page's own scripts");
  assert.ok(shimAt > html.indexOf("<head>") && shimAt < html.indexOf("</head>"));
  assert.ok(html.indexOf('<meta charset="utf-8">') < shimAt);
  assert.ok(html.includes('<meta name="viewport"'));
  assert.ok(html.includes("<title>ร้าน &lt;KKD&gt;</title>"), "title taken from doGet's setTitle, escaped");
  assert.ok(html.includes(JSON.stringify(EXEC)));
});

test("buildStaticPage: a bare fragment without head/doctype still gets a valid document with the shim first", () => {
  const [page] = buildStaticPage([{ path: "Index.html", content: "<script>go()</script><p>hi</p>" }], { execUrl: EXEC });
  const html = page.content;
  assert.ok(html.startsWith("<!DOCTYPE html>"));
  assert.ok(html.indexOf("data-egs-run-shim") < html.indexOf("<script>go()"));
  assert.ok(html.endsWith("<p>hi</p>"));
});

test("buildStaticPage: keeps the page's own charset/viewport/title and rejects a bad execUrl", () => {
  const own = "<!doctype html><html><head><meta charset=\"UTF-8\"><meta name='viewport' content='width=320'><title>Mine</title></head><body></body></html>";
  const [page] = buildStaticPage([...PROJECT.slice(0, 1), { path: "Index.html", content: own }], { execUrl: EXEC });
  assert.equal((page.content.match(/<meta[^>]*charset/gi) ?? []).length, 1);
  assert.equal((page.content.match(/viewport/g) ?? []).length, 1);
  assert.equal((page.content.match(/<title/g) ?? []).length, 1);
  assert.throws(() => buildStaticPage(PROJECT, { execUrl: "https://script.google.com/macros/s/x/dev" }), InvalidExecUrlError);
});

test("buildStaticPage: data scriptlets, missing includes and include loops are reported per file", () => {
  const files = [
    { path: "Index.html", content: "<p><?= user.name ?></p>\n<? if (x) { ?>a<? } ?>\n<?!= include('Part') ?>\n<?!= include('Nope') ?>" },
    { path: "Part.html", content: "<?!= include('Part') ?>" },
  ];
  assert.throws(
    () => buildStaticPage(files, { execUrl: EXEC }),
    (e: unknown) => {
      assert.ok(e instanceof StaticPageScriptletError);
      assert.equal(e.code, "STATIC_PAGE_SCRIPTLET");
      assert.deepEqual(e.issues.slice(0, 3), [
        { file: "Index.html", scriptlet: "<?= user.name ?>", reason: "scriptlet" },
        { file: "Index.html", scriptlet: "<? if (x) { ?>", reason: "scriptlet" },
        { file: "Index.html", scriptlet: "<? } ?>", reason: "scriptlet" },
      ]);
      assert.deepEqual(e.issues.find((i) => i.reason === "include-too-deep"), { file: "Part.html", scriptlet: "<?!= include('Part') ?>", reason: "include-too-deep" });
      assert.deepEqual(e.issues.find((i) => i.reason === "missing-include"), { file: "Index.html", scriptlet: "<?!= include('Nope') ?>", reason: "missing-include" });
      assert.match(e.message, /Index\.html/);
      return true;
    },
  );
});

test("publishing flow: dispatcher conflict surfaces before the static page is built", () => {
  const files = [...PROJECT, { path: "Hooks.gs", content: "function doPost(e) { return 1; }" }];
  assert.throws(() => withDispatcher(files), DoPostConflictError);
  assert.equal(withDispatcher(PROJECT).some((f) => f.path === "EgsRemote.gs"), true);
});
