/**
 * What Settings shows from `claude auth status --json`: signed in or not, and the account's email and
 * plan. The exit code is ignored: the CLI exits 1 when logged out but still prints the JSON. Pure, so
 * it is unit-tested without a CLI (tests/claude-auth-status.test.ts).
 */
export function parseClaudeAuthStatus(out: string): { loggedIn: boolean | null; account: string | null } {
  const start = out.indexOf("{");
  if (start < 0) return { loggedIn: null, account: null };
  let data: unknown;
  try {
    data = JSON.parse(out.slice(start, out.lastIndexOf("}") + 1));
  } catch {
    return { loggedIn: null, account: null };
  }
  const d = (data && typeof data === "object" ? data : {}) as Record<string, unknown>;
  if (typeof d.loggedIn !== "boolean") return { loggedIn: null, account: null };
  if (!d.loggedIn) return { loggedIn: false, account: null };
  const str = (k: string, max: number) => (typeof d[k] === "string" ? (d[k] as string).trim().slice(0, max) : "");
  const email = str("email", 60);
  const plan = str("subscriptionType", 20);
  const account = email ? (plan ? `${email} · ${plan}` : email) : plan || str("authMethod", 20) || null;
  return { loggedIn: true, account };
}
