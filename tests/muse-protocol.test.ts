import { strict as assert } from "node:assert";
import { test } from "node:test";
import {
  MUSE_LOCKDOWN,
  MUSE_REQUIRED_FLAGS,
  locateMuse,
  missingMuseFlags,
  museVersionLine,
  readMuseEvent,
} from "../lib/engines/muse-protocol.ts";

// Windows-style paths; path.join on another OS would produce different separators.
const onWindows = process.platform === "win32";
const DIR = "C:\\Users\\somchai\\AppData\\Local\\Programs\\muse";
const ENV = { LOCALAPPDATA: "C:\\Users\\somchai\\AppData\\Local" };

const locate = (o: { files?: string[]; version?: string | null; env?: Record<string, string>; platform?: NodeJS.Platform; override?: string }) => {
  const files = (o.files ?? []).map((f) => f.toLowerCase());
  return locateMuse({
    env: o.env ?? ENV,
    platform: o.platform ?? "win32",
    exists: (p) => files.includes(p.toLowerCase()),
    readText: (p) => (p.toLowerCase() === `${DIR}\\.muse-version`.toLowerCase() ? (o.version ?? null) : null),
    listDir: (d) => (d.toLowerCase() === DIR.toLowerCase() ? files.filter((f) => f.startsWith(DIR.toLowerCase())).map((f) => f.slice(DIR.length + 1)) : []),
    override: o.override,
  });
};

test("finds the binary the installer's version marker points at", { skip: !onWindows }, () => {
  const exe = `${DIR}\\muse-bin-1.4.2-R4684.1.exe`;
  assert.equal(locate({ files: [exe, `${DIR}\\muse-bin-1.3.0-R1.exe`], version: "1.4.2-R4684.1\n" }), exe);
});

test("never returns the .cmd launcher: it cannot be started without a shell", { skip: !onWindows }, () => {
  assert.equal(locate({ files: [`${DIR}\\muse.cmd`], version: "1.4.2" }), null);
});

test("without a usable version marker, takes the newest binary in the folder", { skip: !onWindows }, () => {
  const files = [`${DIR}\\muse-bin-1.9.0.exe`, `${DIR}\\muse-bin-1.10.0.exe`, `${DIR}\\muse-bin-1.2.0.exe`];
  assert.equal(locate({ files, version: null })?.toLowerCase(), `${DIR}\\muse-bin-1.10.0.exe`.toLowerCase());
  // a marker naming a binary that is gone (mid-update) falls back the same way
  assert.equal(locate({ files, version: "2.0.0" })?.toLowerCase(), `${DIR}\\muse-bin-1.10.0.exe`.toLowerCase());
});

test("a version marker cannot point outside the install folder", { skip: !onWindows }, () => {
  const planted = "C:\\Users\\somchai\\AppData\\Local\\evil.exe";
  for (const version of ["..\\..\\evil", "x\\..\\..\\evil", "1.0 & calc", ""]) {
    assert.equal(locate({ files: [planted, `${DIR}\\muse-bin-..\\..\\evil.exe`], version }), null, JSON.stringify(version));
  }
});

test("an explicit path wins, but only an absolute one that exists", { skip: !onWindows }, () => {
  const exe = `${DIR}\\muse-bin-1.4.2.exe`;
  assert.equal(locate({ files: ["D:\\tools\\muse.exe", exe], version: "1.4.2", override: "D:\\tools\\muse.exe" }), "D:\\tools\\muse.exe");
  assert.equal(locate({ files: [exe], version: "1.4.2", override: "muse.exe" }), exe);
  assert.equal(locate({ files: ["D:\\m.exe"], env: { ...ENV, EASYGAS_MUSE_PATH: "D:\\m.exe" } }), "D:\\m.exe");
});

test("not found off Windows or without the install folder", () => {
  assert.equal(locate({ files: ["/home/a/.local/bin/muse"], platform: "linux", env: { HOME: "/home/a" } }), null);
  assert.equal(locate({ files: [], version: null }), null);
  assert.equal(locate({ files: [`${DIR}\\muse-bin-1.0.0.exe`], version: "1.0.0", env: {} }), null);
});

const HELP_142 = `muse exec — run one prompt non-interactively (headless)
      --json
      --prompt-file <PATH>
      --output-schema <FILE>
      --max-model-steps <N>
      --session-id <UUID>
      --disable-web-tools
      --no-foreign-personal-context
      --approval-mode <MODE>
      --approval-judge <off|on>
      --sandbox-network <MODE>
      --disable-write
      --disable-shell`;

test("a version with every safety switch is usable; one that lacks any is refused by name", () => {
  assert.deepEqual(missingMuseFlags(HELP_142), []);
  assert.deepEqual(missingMuseFlags(HELP_142.replace("      --disable-shell", "")), ["--disable-shell"]);
  // a longer flag that merely starts the same does not count
  assert.deepEqual(missingMuseFlags(HELP_142.replace("--disable-write", "--disable-write-cache")), ["--disable-write"]);
  assert.deepEqual(missingMuseFlags(""), MUSE_REQUIRED_FLAGS);
});

test("every lockdown switch the app passes is one it also requires the version to have", () => {
  for (const flag of MUSE_LOCKDOWN.filter((a) => a.startsWith("--"))) assert.ok(MUSE_REQUIRED_FLAGS.includes(flag), flag);
  for (const flag of ["--disable-shell", "--disable-write", "--disable-web-tools"]) assert.ok(MUSE_LOCKDOWN.includes(flag), flag);
  assert.equal(MUSE_LOCKDOWN[MUSE_LOCKDOWN.indexOf("--sandbox-network") + 1], "restricted");
  assert.equal(MUSE_LOCKDOWN[MUSE_LOCKDOWN.indexOf("--approval-mode") + 1], "untrusted");
  for (const never of ["--yolo", "--disable-sandbox", "--disable-approval", "--trust-workspace"]) assert.ok(!MUSE_LOCKDOWN.includes(never), never);
});

test("reads the version line", () => {
  assert.equal(museVersionLine("Muse Code 1.4.2 (1.4.2-R4684.1)\r\n"), "Muse Code 1.4.2 (1.4.2-R4684.1)");
  assert.equal(museVersionLine("error: something\n"), null);
});

const event = (payload_type: string, payload: Record<string, unknown>) =>
  JSON.stringify({ schema_version: 1, stream: { kind: "session", id: "s" }, sequence: 1, payload_type, payload });

test("the final answer is the text of the terminal record (shape recorded from Muse Code 1.4.2)", () => {
  assert.deepEqual(readMuseEvent(event("run.terminal.completed", { kind: "run_terminal", terminal: "completed", text: '{"n": 7}', reason: null })), {
    kind: "completed",
    text: '{"n": 7}',
  });
  assert.deepEqual(readMuseEvent(event("run.lifecycle.started", { kind: "run_started" })), { kind: "started" });
  assert.deepEqual(readMuseEvent(event("run.output.delta", { kind: "run_output_delta", text: '{"n' })), { kind: "thinking" });
  assert.deepEqual(readMuseEvent(event("run.model.configured", { model_id: "muse-spark-1.3" })), { kind: "model", model: "muse-spark-1.3" });
});

test("a run that ends any other way is a failure with its reason", () => {
  assert.deepEqual(readMuseEvent(event("run.terminal.failed", { terminal: "failed", text: "", reason: "model step limit reached" })), {
    kind: "failed",
    reason: "model step limit reached",
  });
  assert.deepEqual(readMuseEvent(event("run.terminal.cancelled", { terminal: "cancelled", text: "", reason: null })), { kind: "failed", reason: "cancelled" });
  // "completed" in the record type alone is not enough — the payload decides
  assert.equal(readMuseEvent(event("run.terminal.completed", { terminal: "failed", text: "x" })).kind, "failed");
});

test("noise and unrelated records are ignored", () => {
  for (const line of ["", "muse: Skills: 76 loaded", "{not json", "null", "42", event("task.lifecycle.started", {})]) {
    assert.deepEqual(readMuseEvent(line), { kind: "other" }, line);
  }
});
