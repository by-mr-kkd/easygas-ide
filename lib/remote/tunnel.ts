/**
 * The "use from outside" link (server-only): a Cloudflare quick tunnel run by cloudflared, pointed at the
 * gateway on loopback. No account and no router setup — cloudflared dials out and Cloudflare hands back
 * an https://<words>.trycloudflare.com address, a new one each time it starts.
 *
 * cloudflared is not shipped with the app: it is downloaded the first time from Cloudflare's own GitHub
 * release, a pinned version, checked against the SHA-256 below before it is ever run, and kept in
 * <dataRoot>/tools. It runs with childEnv() as a child of the app's server, so quitting the app ends it.
 *
 * Tested limits (docs/REMOTE-PLAN.md): POST responses stream, GET responses are held until they end,
 * ~100 s without a byte cuts a response, 200 requests in flight, no uptime promise.
 */
import { spawn, type ChildProcess } from "node:child_process";
import { createHash } from "node:crypto";
import { createReadStream, createWriteStream } from "node:fs";
import { mkdir, rename, rm, stat } from "node:fs/promises";
import { join } from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import { childEnv } from "../child-env.ts";
import { dataRoot } from "../local/paths.ts";

export const CLOUDFLARED = {
  version: "2026.10.0",
  url: "https://github.com/cloudflare/cloudflared/releases/download/2026.10.0/cloudflared-windows-amd64.exe",
  sha256: "86aee4017b26625cee8484c113558f48effa4cd47f7aa05fcf425604e5d2b23c",
  bytes: 55_365_048,
} as const;

const URL_RE = /https:\/\/[a-z0-9-]+\.trycloudflare\.com/i;
const RESTART_DELAYS_MS = [2_000, 5_000, 15_000, 30_000, 60_000];

export const cloudflaredPath = (): string => join(dataRoot(), "tools", `cloudflared-${CLOUDFLARED.version}.exe`);

/** The trycloudflare address in a line of cloudflared's log, if any. */
export const tunnelUrlIn = (line: string): string | null => URL_RE.exec(line)?.[0].toLowerCase() ?? null;

async function sha256Of(file: string): Promise<string> {
  const hash = createHash("sha256");
  await pipeline(createReadStream(file), hash);
  return hash.digest("hex");
}

/** Download cloudflared once (verified); later calls return the file already there. */
export async function ensureCloudflared(onProgress?: (fraction: number) => void): Promise<string> {
  const file = cloudflaredPath();
  try {
    if ((await stat(file)).size === CLOUDFLARED.bytes && (await sha256Of(file)) === CLOUDFLARED.sha256) return file;
  } catch {
    /* not downloaded yet */
  }
  if (process.platform !== "win32") throw new Error("ลิงก์นอกบ้านใช้ได้บน Windows เท่านั้นตอนนี้");
  await mkdir(join(dataRoot(), "tools"), { recursive: true });
  const tmp = `${file}.${process.pid}.download`;
  const res = await fetch(CLOUDFLARED.url, { redirect: "follow", signal: AbortSignal.timeout(10 * 60_000) });
  if (!res.ok || !res.body) throw new Error(`ดาวน์โหลดตัวเชื่อมต่อไม่สำเร็จ (${res.status})`);
  const hash = createHash("sha256");
  let got = 0;
  const body = Readable.fromWeb(res.body as import("node:stream/web").ReadableStream);
  body.on("data", (c: Buffer) => {
    hash.update(c);
    got += c.length;
    onProgress?.(Math.min(1, got / CLOUDFLARED.bytes));
  });
  try {
    await pipeline(body, createWriteStream(tmp));
    if (hash.digest("hex") !== CLOUDFLARED.sha256) throw new Error("ไฟล์ตัวเชื่อมต่อที่ได้ไม่ตรงกับของจริง ไม่ได้ใช้งาน ลองใหม่อีกครั้ง");
    await rename(tmp, file);
  } finally {
    await rm(tmp, { force: true }).catch(() => {});
  }
  return file;
}

export interface TunnelHandle {
  stop(): void;
}

/**
 * Run cloudflared towards http://127.0.0.1:<port>. `onUrl` gets every new address (also after a
 * restart); `onDown` when it exits (it is started again after a pause until stop()).
 */
export function runTunnel(exe: string, port: number, onUrl: (url: string) => void, onDown: (why: string) => void): TunnelHandle {
  let child: ChildProcess | null = null;
  let stopped = false;
  let failures = 0;
  let timer: NodeJS.Timeout | null = null;

  const start = () => {
    if (stopped) return;
    let announced = false;
    const startedAt = Date.now();
    child = spawn(exe, ["tunnel", "--no-autoupdate", "--url", `http://127.0.0.1:${port}`], {
      env: childEnv(),
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let buf = "";
    const read = (d: Buffer) => {
      buf += d.toString("utf8");
      const lines = buf.split(/\r?\n/);
      buf = lines.pop() ?? "";
      for (const line of lines) {
        const url = !announced ? tunnelUrlIn(line) : null;
        if (url) {
          announced = true;
          failures = 0;
          onUrl(url);
        }
      }
      if (buf.length > 64_000) buf = "";
    };
    child.stdout?.on("data", read);
    child.stderr?.on("data", read);
    child.on("error", (e) => onDown(e.message));
    child.on("exit", (code) => {
      child = null;
      if (stopped) return;
      if (Date.now() - startedAt > 5 * 60_000) failures = 0; // it ran fine for a while: a fresh start
      onDown(`cloudflared exited (${code})`);
      const delay = RESTART_DELAYS_MS[Math.min(failures, RESTART_DELAYS_MS.length - 1)];
      failures += 1;
      timer = setTimeout(start, delay);
    });
  };
  start();
  return {
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      if (child && child.exitCode === null) child.kill();
    },
  };
}
