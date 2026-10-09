import { strict as assert } from "node:assert";
import { test } from "node:test";
import vm from "node:vm";
import { DISPATCHER_PATH, DoPostConflictError, definesDoPost, withDispatcher } from "../lib/pages/dispatcher.ts";
import { FAKE_RUNTIME, SKIP_REAL, realRuntime } from "./_pages-runtime.ts";

// the dispatcher text is Pro content on the licence server; behaviour tests need a local copy
const REAL = realRuntime();
const DISPATCHER_SOURCE = REAL?.dispatcher ?? FAKE_RUNTIME.dispatcher;
const needsReal = { skip: REAL ? false : SKIP_REAL };

/** Run the dispatcher next to fake project functions and call doPost like GAS would. */
function makeApp(projectCode: string) {
  const ctx = vm.createContext({
    ContentService: {
      MimeType: { JSON: "application/json" },
      createTextOutput: (text: string) => ({ text, mime: "", setMimeType(m: string) { this.mime = m; return this; } }),
    },
  });
  vm.runInContext(projectCode + "\n" + DISPATCHER_SOURCE, ctx);
  return (body: unknown) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    const out = vm.runInContext("doPost", ctx)({ postData: { contents: raw, type: "text/plain" } });
    assert.equal(out.mime, "application/json");
    return JSON.parse(out.text);
  };
}

const PROJECT = `
function add(a, b) { return a + b; }
function nothing() {}
function secret_() { return 'nope'; }
function boom() { var e = new Error('ชีตไม่พบ'); e.name = 'SheetError'; throw e; }
function echo() { return Array.prototype.slice.call(arguments); }
var marker = 42;
`;

test("calls a project function with args and answers {ok,value}", needsReal, () => {
  const call = makeApp(PROJECT);
  assert.deepEqual(call({ fn: "add", args: [2, 3] }), { ok: true, value: 5 });
  assert.deepEqual(call({ fn: "nothing" }), { ok: true });
  assert.deepEqual(call({ fn: "echo", args: [1, "x", null] }), { ok: true, value: [1, "x", null] });
});

test("refuses private, reserved, unknown and non-function names as JSON errors", needsReal, () => {
  const call = makeApp(PROJECT);
  for (const fn of ["secret_", "doGet", "doPost", "missing", "marker", "egsRemoteHandle_"]) {
    const r = call({ fn, args: [] });
    assert.equal(r.ok, false, fn);
    assert.equal(r.error.name, "EgsRemoteError", fn);
    assert.equal(typeof r.error.message, "string");
  }
});

test("refuses natives reachable through globalThis (eval, Function, Object.prototype members)", needsReal, () => {
  const call = makeApp(PROJECT);
  for (const fn of ["eval", "Function", "parseInt", "constructor", "toString", "hasOwnProperty", "__defineGetter__"]) {
    const r = call({ fn, args: ["marker = 1"] });
    assert.equal(r.ok, false, fn);
  }
  assert.deepEqual(call({ fn: "echo", args: [] }), { ok: true, value: [] });
});

test("refuses malformed requests: bad JSON, fn not a string, args not an array", needsReal, () => {
  const call = makeApp(PROJECT);
  assert.equal(call("{ nope").ok, false);
  assert.equal(call({ fn: 42 }).ok, false);
  assert.equal(call({ fn: ["add"] }).ok, false);
  assert.equal(call({ fn: "add", args: { a: 1 } }).ok, false);
  assert.equal(call({ fn: "add", args: "1,2" }).ok, false);
});

test("a thrown error is reported with name + message and no stack", needsReal, () => {
  const call = makeApp(PROJECT);
  const r = call({ fn: "boom", args: [] });
  assert.deepEqual(r, { ok: false, error: { name: "SheetError", message: "ชีตไม่พบ" } });
  assert.equal(JSON.stringify(r).includes("at "), false);
});

test("withDispatcher appends EgsRemote.gs once and keeps the project files", () => {
  const files = [
    { path: "Code.gs", content: "function doGet(e) { return HtmlService.createHtmlOutputFromFile('Index'); }" },
    { path: "Index.html", content: "<p>hi</p>" },
  ];
  const out = withDispatcher(files, DISPATCHER_SOURCE);
  assert.equal(out.length, 3);
  assert.equal(out[2].path, DISPATCHER_PATH);
  assert.equal(out[2].content, DISPATCHER_SOURCE);
  assert.deepEqual(files.length, 2, "input not mutated");
  const again = withDispatcher([...out, { path: "egsremote.gs", content: "stale copy" }], DISPATCHER_SOURCE);
  assert.equal(again.filter((f) => f.path.toLowerCase() === DISPATCHER_PATH.toLowerCase()).length, 1);
  assert.equal(again.find((f) => f.path === DISPATCHER_PATH)?.content, DISPATCHER_SOURCE);
});

test("withDispatcher throws a typed error when a .gs file defines doPost", () => {
  const files = [
    { path: "Code.gs", content: "function doGet(e) {}" },
    { path: "Api.gs", content: "function doPost(e) { return ContentService.createTextOutput('x'); }" },
  ];
  assert.throws(() => withDispatcher(files, DISPATCHER_SOURCE), (e: unknown) => e instanceof DoPostConflictError && e.file === "Api.gs" && e.code === "DOPOST_CONFLICT");
  assert.equal(definesDoPost("// function doPost(e) {}\n/* doPost = 1 */ function doGet() {}"), false);
  assert.equal(definesDoPost("var doPost = function (e) {};"), true);
  assert.equal(definesDoPost("if (doPost == 1) {}"), false);
  assert.equal(definesDoPost("<form onsubmit='doPost()'>"), false, "html files are not checked anyway, and a call is not a definition");
});
