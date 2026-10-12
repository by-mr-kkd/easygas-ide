import { spawn } from "node:child_process";
import { access } from "node:fs/promises";
import { join } from "node:path";
import { childEnv } from "@/lib/child-env";

/**
 * The owner's one-time "Allow" for a web app must happen in a browser signed in to ONE Google account (Google does
 * not support multi-login for web apps). This opens the /exec URL in a fresh private window — Chrome --incognito,
 * else Edge --inprivate — where the user signs in to just the publishing account. The URL is the project's own
 * deployment (checked against EXEC below), never one from the client. Windows only; elsewhere the caller falls back
 * to an ordinary link.
 */
const EXEC = /^https:\/\/script\.google\.com\/macros\/s\/[A-Za-z0-9_-]+\/exec$/;

function candidates(): { exe: string; flag: string }[] {
  const env = process.env;
  const roots = [env["ProgramFiles"], env["ProgramFiles(x86)"], env["LOCALAPPDATA"]].filter((r): r is string => !!r);
  return [
    ...roots.map((r) => ({ exe: join(r, "Google", "Chrome", "Application", "chrome.exe"), flag: "--incognito" })),
    ...roots.map((r) => ({ exe: join(r, "Microsoft", "Edge", "Application", "msedge.exe"), flag: "--inprivate" })),
  ];
}

/** true = a private window was asked to open; false = no supported browser here (use a normal link). */
export async function openPrivateWindow(url: string): Promise<boolean> {
  if (process.platform !== "win32" || !EXEC.test(url)) return false;
  for (const c of candidates()) {
    try {
      await access(c.exe);
    } catch {
      continue;
    }
    return new Promise<boolean>((resolve) => {
      const child = spawn(c.exe, [c.flag, url], { detached: true, stdio: "ignore", env: childEnv() });
      child.once("error", () => resolve(false));
      child.once("spawn", () => {
        child.unref();
        resolve(true);
      });
    });
  }
  return false;
}
