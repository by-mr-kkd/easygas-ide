import { spawn } from "node:child_process";
import { childEnv } from "@/lib/child-env";
import { findCodexExecutable } from "@/lib/engines/codex-cli";
import { parseCodexRateLimits, type QuotaInfo } from "@/lib/quota";

const TIMEOUT_MS = 15_000;

/**
 * Codex's quota, read through its own app-server: one JSON-RPC conversation over stdio
 * (initialize → initialized → account/rateLimits/read), then the process is stopped. No file
 * under ~/.codex is touched; Codex answers from its own sign-in.
 */
export function codexQuota(): Promise<QuotaInfo | { error: string }> {
  const exe = findCodexExecutable();
  if (!exe) return Promise.resolve({ error: "ยังไม่ได้ติดตั้ง Codex" });
  return new Promise((resolve) => {
    let settled = false;
    let buf = "";
    let stderr = "";
    const child = spawn(exe, ["app-server", "--listen", "stdio://"], { env: childEnv({}), windowsHide: true, stdio: ["pipe", "pipe", "pipe"] });
    const done = (v: QuotaInfo | { error: string }) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try {
        child.kill();
      } catch {
        // already gone
      }
      resolve(v);
    };
    const timer = setTimeout(() => done({ error: "Codex ไม่ตอบ" }), TIMEOUT_MS);
    const send = (m: object) => child.stdin.write(JSON.stringify(m) + "\n");

    child.on("error", (e) => done({ error: `เปิด Codex ไม่ได้: ${e.message}` }));
    child.on("close", () => done({ error: stderr.trim().split(/\r?\n/).pop()?.slice(0, 200) || "Codex ปิดการเชื่อมต่อ" }));
    child.stderr.on("data", (d: Buffer) => {
      if (stderr.length < 4000) stderr += d.toString("utf8");
    });
    child.stdout.on("data", (d: Buffer) => {
      buf += d.toString("utf8");
      let nl: number;
      while ((nl = buf.indexOf("\n")) >= 0) {
        const line = buf.slice(0, nl).trim();
        buf = buf.slice(nl + 1);
        if (!line) continue;
        let msg: { id?: unknown; result?: unknown; error?: { message?: unknown } };
        try {
          msg = JSON.parse(line);
        } catch {
          continue;
        }
        if (msg.id === 1) {
          send({ method: "initialized" });
          send({ id: 2, method: "account/rateLimits/read" });
        } else if (msg.id === 2) {
          if (msg.error) {
            const text = String(msg.error.message ?? "Codex ตอบกลับผิดพลาด");
            done({ error: /login|auth/i.test(text) ? "ยังไม่ได้ล็อกอิน Codex" : text.slice(0, 200) });
          } else done(parseCodexRateLimits(msg.result));
        }
      }
    });
    send({
      id: 1,
      method: "initialize",
      params: { clientInfo: { name: "easygas-ide", title: "EasyGAS IDE", version: "1.0.0" }, capabilities: { experimentalApi: true } },
    });
  });
}
