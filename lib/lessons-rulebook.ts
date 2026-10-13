/**
 * A lesson the AI proposes may only restate a rule the rulebook already has (the AI was given the card and
 * still slipped). Then the rule is what matters, not a second copy of it: the AI names the rule it missed
 * (`ruleOf: "data-integrity#1"`), and as a backstop the app notices a close match and says so on the offer.
 * Pure, tested. The match never hides a proposal by itself: only the AI's own `ruleOf` replaces one.
 */

export type KnownRule = { card: string; cardTitle: string; n: number; text: string };

/** every "## Rule #N: …" heading of the pack's cards */
export function rulesOfPack(pack: { rules: { id: string; title: string; content: string }[] }): KnownRule[] {
  const out: KnownRule[] = [];
  for (const c of pack.rules) {
    for (const m of c.content.matchAll(/^## Rule #(\d{1,2}):\s*(.+)$/gm)) {
      out.push({ card: c.id, cardTitle: c.title, n: Number(m[1]), text: m[2].trim() });
    }
  }
  return out;
}

const REF = /^([a-z0-9][a-z0-9-]{1,40})#(\d{1,2})$/;

/** "data-integrity#1" → that rule, or null when it does not exist in this pack */
export function findRuleRef(ref: unknown, rules: KnownRule[]): KnownRule | null {
  if (typeof ref !== "string") return null;
  const m = REF.exec(ref.trim().toLowerCase());
  if (!m) return null;
  return rules.find((r) => r.card === m[1] && r.n === Number(m[2])) ?? null;
}

export function isRuleRef(ref: unknown): ref is string {
  return typeof ref === "string" && REF.test(ref.trim().toLowerCase());
}

const norm = (s: string) =>
  s
    .toLowerCase()
    .replace(/[`"'().,:;!?\-—–=/\\[\]{}<>*_#|]+/g, "")
    .replace(/\s+/g, "");

function trigrams(s: string): Set<string> {
  const n = norm(s);
  const out = new Set<string>();
  for (let i = 0; i + 3 <= n.length; i++) out.add(n.slice(i, i + 3));
  return out;
}

function dice(a: Set<string>, b: Set<string>): number {
  let k = 0;
  for (const x of a) if (b.has(x)) k++;
  return (2 * k) / (a.size + b.size || 1);
}

/** code words (rev, LockService, getRange…): the strongest sign two Thai sentences speak of the same thing */
const codeWords = (s: string) => new Set(s.toLowerCase().match(/[a-z_][a-z0-9_.]{2,}/g) ?? []);

// Measured on the real rulebook: the rev proposal scores 0.27 against data-integrity #1 (sharing "rev"); a related
// but different lesson ("every include('X') needs X.html") scores 0.21 against its card's include rule.
const WITH_CODE_WORD = 0.25;
const TEXT_ONLY = 0.4;

/** the rule of the proposal's card (any card for "general") this lesson most likely restates, or null */
export function similarRule(rule: string, card: string, rules: KnownRule[]): KnownRule | null {
  const mine = trigrams(rule);
  const words = codeWords(rule);
  let best: { r: KnownRule; d: number } | null = null;
  for (const r of rules) {
    if (card !== "general" && r.card !== card) continue;
    const d = dice(mine, trigrams(r.text));
    const shared = [...codeWords(r.text)].some((w) => words.has(w));
    if (d >= TEXT_ONLY || (shared && d >= WITH_CODE_WORD)) if (!best || d > best.d) best = { r, d };
  }
  return best?.r ?? null;
}
