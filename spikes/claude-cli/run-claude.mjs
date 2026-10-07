// Spike A: drive the user's own `claude.exe` headless inside a project folder and summarize the
// stream-json events the IDE would have to map onto its SSE protocol.
// Usage: node run-claude.mjs <projDir> <rules.md> <outPrefix> <model> <prompt> [resumeSessionId]
import { spawn } from "node:child_process";
import { createWriteStream } from "node:fs";
import { join } from "node:path";
import { realpathSync } from "node:fs";

const [projDirArg, rules, outPrefix, model, prompt, resumeId] = process.argv.slice(2);
const projDir = realpathSync.native(projDirArg); // long path: 8.3 names (ADMINI~1) break cwd-scoped permission checks
const exe = join(process.env.APPDATA, "npm", "node_modules", "@anthropic-ai", "claude-code", "bin", "claude.exe");

const TOOLS = "Read,Edit,Write,Glob,Grep";
const args = [
  "-p", prompt,
  "--output-format", "stream-json", "--verbose", "--include-partial-messages",
  "--append-system-prompt-file", rules,
  "--tools", TOOLS,
  // no --allowedTools: a bare "Read" rule approves ANY path; the default auto-allows reads only inside cwd
  "--permission-mode", "acceptEdits", // edits auto-allowed ONLY inside cwd; anything else is denied in -p
  "--setting-sources", "project",
  "--strict-mcp-config",
  "--model", model,
];
if (resumeId) args.push("--resume", resumeId);

const raw = createWriteStream(`${outPrefix}.jsonl`);
const t0 = Date.now();
const child = spawn(exe, args, { cwd: projDir, stdio: ["ignore", "pipe", "pipe"], windowsHide: true,
  env: { ...process.env, CLAUDE_CODE_DISABLE_CLAUDE_MDS: "1", CLAUDE_CODE_DISABLE_AUTO_MEMORY: "1" } });

const counts = {};
const toolCalls = [];
const denials = [];
let init = null;
let result = null;
let firstTextMs = null;
let buf = "";

function onEvent(ev) {
  const key = ev.type === "stream_event" ? `stream_event:${ev.event?.type}` : `${ev.type}${ev.subtype ? ":" + ev.subtype : ""}`;
  counts[key] = (counts[key] ?? 0) + 1;
  if (ev.type === "system" && ev.subtype === "init") init = ev;
  if (ev.type === "stream_event" && ev.event?.delta?.type === "text_delta" && firstTextMs === null) firstTextMs = Date.now() - t0;
  if (ev.type === "assistant") {
    for (const c of ev.message?.content ?? []) {
      if (c.type === "tool_use") toolCalls.push({ name: c.name, path: c.input?.file_path ?? c.input?.pattern ?? c.input?.path ?? null });
    }
  }
  if (ev.type === "user") {
    for (const c of ev.message?.content ?? []) {
      if (c.type === "tool_result" && c.is_error) denials.push(String(typeof c.content === "string" ? c.content : JSON.stringify(c.content)).slice(0, 200));
    }
  }
  if (ev.type === "result") result = ev;
}

child.stdout.on("data", (d) => {
  raw.write(d);
  buf += d.toString("utf8");
  let i;
  while ((i = buf.indexOf("\n")) >= 0) {
    const line = buf.slice(0, i).trim();
    buf = buf.slice(i + 1);
    if (!line) continue;
    try { onEvent(JSON.parse(line)); } catch { counts["unparsed"] = (counts["unparsed"] ?? 0) + 1; }
  }
});
let stderr = "";
child.stderr.on("data", (d) => { stderr += d.toString("utf8"); });

child.on("close", (code) => {
  raw.end();
  console.log(JSON.stringify({
    exitCode: code,
    wallMs: Date.now() - t0,
    firstTextMs,
    init: init && {
      session_id: init.session_id, model: init.model, permissionMode: init.permissionMode,
      tools: init.tools, mcp_servers: init.mcp_servers, plugins: init.plugins,
      slash_commands_count: init.slash_commands?.length, apiKeySource: init.apiKeySource,
      memory_paths: init.memory_paths ?? init.memoryPaths ?? undefined,
    },
    counts,
    toolCalls,
    denials,
    result: result && {
      subtype: result.subtype, is_error: result.is_error, num_turns: result.num_turns,
      duration_ms: result.duration_ms, total_cost_usd: result.total_cost_usd, usage: result.usage,
      session_id: result.session_id, text: String(result.result ?? "").slice(0, 600),
      permission_denials: result.permission_denials,
    },
    stderr: stderr.slice(0, 800),
  }, null, 2));
});
