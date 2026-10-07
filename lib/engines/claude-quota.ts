import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { userDir } from "@/lib/local/paths";
import { parseClaudeRateLimitHeaders, type QuotaInfo } from "@/lib/quota";
import { getBoolSetting } from "@/lib/settings";

/** The Settings switch that allows this at all (off by default). */
export const CLAUDE_QUOTA_SETTING = "claude_quota";

const API_URL = "https://api.anthropic.com/v1/messages";
const TIMEOUT_MS = 12_000;

/**
 * Claude's quota, the way Claude Code's own usage screen gets it: one tiny request with Claude
 * Code's sign-in, and the `anthropic-ratelimit-unified-*` headers of the answer. This is the ONE
 * place the app reads Claude Code's credentials file, and only while the user has switched
 * "แสดงโควตา Claude" on in Settings. The token is used for this request and dropped: never stored,
 * logged, returned to the page, or given to a child process.
 */
export async function claudeQuota(): Promise<QuotaInfo | { error: string }> {
  if (!(await getBoolSetting(CLAUDE_QUOTA_SETTING, false))) return { error: "ปิดอยู่" };
  const token = await readClaudeCodeToken();
  if (!token) return { error: "ไม่พบการล็อกอินของ Claude Code" };
  let res: Response;
  try {
    res = await fetch(API_URL, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, "anthropic-version": "2023-06-01", "content-type": "application/json" },
      body: JSON.stringify({ model: "claude-haiku-4-5", max_tokens: 1, messages: [{ role: "user", content: "." }] }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch {
    return { error: "ติดต่อ Anthropic ไม่ได้" };
  }
  const headers: Record<string, string> = {};
  res.headers.forEach((v, k) => {
    if (k.startsWith("anthropic-ratelimit-unified-")) headers[k] = v;
  });
  // even a 4xx answer carries the headers; only an answer without them is a failure
  const info = parseClaudeRateLimitHeaders(headers);
  if (info) return info;
  if (res.status === 401) return { error: "การล็อกอินของ Claude Code หมดอายุ เปิด Claude Code แล้วล็อกอินใหม่" };
  return { error: `Anthropic ไม่ส่งข้อมูลโควตา (HTTP ${res.status})` };
}

/** The sign-in token in Claude Code's credentials file, or null when there is none. */
async function readClaudeCodeToken(): Promise<string | null> {
  const home = userDir("home");
  for (const path of [join(home, ".claude", ".credentials.json"), join(home, ".config", "claude", "credentials.json")]) {
    let raw: string;
    try {
      raw = await readFile(path, "utf8");
    } catch {
      continue;
    }
    try {
      const data = JSON.parse(raw) as { claudeAiOauth?: { accessToken?: unknown } };
      const token = data?.claudeAiOauth?.accessToken;
      if (typeof token === "string" && token.trim()) return token.trim();
    } catch {
      // not this file
    }
  }
  return null;
}
