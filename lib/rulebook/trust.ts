/**
 * Who may publish rulebook updates, and where the app looks for them.
 *
 * A downloaded rulebook becomes part of the instructions the AI follows on every user's machine, so it
 * is installed ONLY when signed by a key listed here (lib/rulebook/format.verifyAndParsePack). The
 * matching private key never lives in this repository — see docs/RULEBOOK.md. To rotate: add the new
 * public key, release the app, then remove the old one in a later release.
 */
export const RULEBOOK_PUBLIC_KEYS: string[] = [
  `-----BEGIN PUBLIC KEY-----
MCowBQYDK2VwAyEANiyYX3no5sPD+2QZR5DyfM7aTlPnBqUcp1AHCbLfwEM=
-----END PUBLIC KEY-----`,
];

/** GitHub repository that holds the rule cards and publishes the signed pack as a release asset. */
export const RULEBOOK_REPO = "kpcrmv4/gas-best-practices";
export const RULEBOOK_ASSET = "easygas-rulebook.json";

const LOOPBACK = /^http:\/\/(127\.0\.0\.1|localhost)(:\d+)?\//;

/**
 * Download locations for the pack and its signature. EASYGAS_RULEBOOK_URL overrides the pack URL (for
 * testing a release before publishing it); the signature check applies either way. Plain http is
 * allowed only for this machine.
 */
export function rulebookUrls(): { pack: string; signature: string } | null {
  const pack =
    process.env.EASYGAS_RULEBOOK_URL?.trim() ||
    `https://github.com/${RULEBOOK_REPO}/releases/latest/download/${RULEBOOK_ASSET}`;
  if (!pack.startsWith("https://") && !LOOPBACK.test(pack)) return null;
  let signature: URL;
  try {
    signature = new URL(pack);
  } catch {
    return null;
  }
  signature.pathname += ".sig"; // keeps any query string where it belongs
  return { pack, signature: signature.toString() };
}

/** Where a shared lesson goes: a new issue on the rulebook repository (the user fills in and submits it). */
export const lessonIssueBaseUrl = (): string => `https://github.com/${RULEBOOK_REPO}/issues/new`;

/** Pre-filled GitHub issue so a user can PROPOSE a rule; nothing is sent until they press submit there. */
export function suggestRuleUrl(): string {
  const body = [
    "## สถานการณ์ที่เจอ",
    "(โค้ดที่ AI เขียนพลาดตรงไหน หรืออยากให้ทำแบบไหนเสมอ)",
    "",
    "## ✗ โค้ดที่เป็นปัญหา",
    "```javascript",
    "",
    "```",
    "",
    "## ✓ โค้ดที่ถูก",
    "```javascript",
    "",
    "```",
  ].join("\n");
  const q = new URLSearchParams({ title: "เสนอกฎ: ", body });
  return `https://github.com/${RULEBOOK_REPO}/issues/new?${q.toString()}`;
}
