import type { RuleCard, RuleKind, RulebookPack } from "./format.ts";

/**
 * Picking rule cards for a task, and rendering the index the AI sees (pure — unit-tested).
 *
 * The AI never gets the whole rulebook: the system prompt carries only the index (id + when to read),
 * and the app names the cards a turn needs so the choice does not rest on the model alone.
 */

export const MAX_ROUTED = 4;
const FEATURE_SCORE = 5;
const BASELINE_SCORE = 3;

export interface RouteInput {
  /** The user's message plus whatever is known about the project (confirmed spec, wizard brief). */
  text: string;
  kind: RuleKind;
  /** Feature ids chosen in the new-project wizard. */
  features: string[];
  /** Nothing built yet — baseline cards apply. */
  newBuild: boolean;
}

export function rulesForKind(pack: RulebookPack, kind: RuleKind): RuleCard[] {
  return pack.rules.filter((r) => r.kinds.includes(kind));
}

/**
 * Latin keywords match on word boundaries ("log" must not fire on "login" or "catalog"); Thai has no
 * word spacing, so Thai keywords match as substrings.
 */
function hasKeyword(haystack: string, keyword: string): boolean {
  const kw = keyword.toLowerCase();
  if (!/^[\x20-\x7e]+$/.test(kw)) return haystack.includes(kw);
  const escaped = kw.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  return new RegExp(`(?<![a-z0-9])${escaped}(?![a-z0-9])`).test(haystack);
}

/** The cards most relevant to this turn, best first (at most `max`). Deterministic. */
export function routeRules(pack: RulebookPack, input: RouteInput, max = MAX_ROUTED): RuleCard[] {
  const haystack = input.text.toLowerCase();
  return rulesForKind(pack, input.kind)
    .map((rule, order) => {
      const featureHits = rule.features.filter((f) => input.features.includes(f)).length;
      const keywordHits = rule.keywords.filter((k) => hasKeyword(haystack, k)).length;
      const score =
        featureHits * FEATURE_SCORE + (input.newBuild && rule.baseline ? BASELINE_SCORE : 0) + keywordHits;
      return { rule, order, score };
    })
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.order - b.order)
    .slice(0, max)
    .map((x) => x.rule);
}

/** How the AI opens a card: a tool call (API engines) or a file in a folder (CLI engines). */
/**
 * How the AI gets a card's text: a tool call (API engines), files in a folder (Claude Code), or
 * "inline" — the app puts the matched cards' text into the turn itself (Codex, which runs with no file
 * or shell access at all).
 */
export type CardAccess = { via: "tool" } | { via: "files"; dir: string } | { via: "inline" };

/** The index block appended to the system prompt. Stable for a given pack + kind (cache-friendly). */
export function renderIndex(pack: RulebookPack, kind: RuleKind, access: CardAccess): string {
  const rows = rulesForKind(pack, kind)
    .map((r) => `| ${r.id} | ${r.when} | ${Math.max(1, Math.round(r.bytes / 1024))} KB |`)
    .join("\n");
  if (access.via === "inline") {
    return `

## Rule cards — detailed GAS best practices (rulebook v${pack.version})
Detailed rules with ✗ Bad / ✓ Good code distilled from real production bugs. You cannot open cards yourself: the app puts the text of the cards that match a request into that turn's message, under "rule card:" headers. Follow them silently — never mention them to the user. The rules written in THIS prompt win over a card, and the user's look & feel choices win over any styling shown in a card's example.
Cards that exist (for reference): ${rulesForKind(pack, kind).map((r) => r.id).join(", ")}`;
  }
  const how =
    access.via === "tool"
      ? "call the read_rule tool with its id (several ids in one call are fine)"
      : `open the file <id>.md in this folder with the Read tool: ${access.dir}`;
  // API engines trim old tool results from history; a CLI session keeps what it read.
  const reread =
    access.via === "tool"
      ? "Card text is not kept between turns — read a card again when a later turn needs it"
      : "Do not re-read a card you already read in this conversation";
  return `

## Rule cards — detailed GAS best practices (rulebook v${pack.version}) — read ONLY what the task needs
Each card below holds detailed rules with ✗ Bad / ✓ Good code distilled from real production bugs. They are NOT loaded yet. Before you write or change code in an area a card covers, ${how}. ${reread}, and skip cards the task does not touch. Read cards silently — they are internal reference, so never mention them or the act of reading them to the user.
Precedence when a card disagrees with this prompt: the rules written in THIS prompt win (file layout, how files are written, the manifest, EasyGAS deploying for the user — never manual script.google.com / clasp steps). The user's look & feel choices win over any styling shown in a card's example.

| id | read when | size |
|---|---|---|
${rows}`;
}

/** Short per-turn nudge naming the cards the app matched to this request. Empty when none matched. */
export function renderDirective(cards: RuleCard[], access: CardAccess): string {
  if (cards.length === 0) return "";
  const ids = cards.map((c) => c.id).join(", ");
  if (access.via === "inline") return `[EasyGAS: also relevant but left out of this turn to keep it short: ${ids}]`;
  const how =
    access.via === "tool"
      ? "read them with read_rule"
      : `Read <id>.md for each one in ${access.dir} (skip any you already read in this conversation)`;
  return `[EasyGAS: rule cards matched to this request — ${how} before writing the related code: ${ids}]`;
}

/** Full text of cards for inlining into a turn, capped so one turn never carries the whole rulebook. */
export function renderCards(cards: RuleCard[], maxBytes: number): { text: string; ids: string[] } {
  const ids: string[] = [];
  const parts: string[] = [];
  let used = 0;
  for (const c of cards) {
    if (used + c.bytes > maxBytes && ids.length > 0) break;
    used += c.bytes;
    ids.push(c.id);
    parts.push(`=== rule card: ${c.id} ===\n${c.content.trim()}`);
  }
  return { text: parts.join("\n\n"), ids };
}

export interface TurnPlanInput {
  pack: RulebookPack;
  kind: RuleKind;
  userMessage: string;
  /** What is known about the project before anything is built: confirmed spec + wizard detail. */
  projectText: string;
  /** Feature ids from the wizard brief. */
  features: string[];
  hasFiles: boolean;
  /** The user confirmed a spec, so the next turn writes the first build. */
  specConfirmed: boolean;
  /** Engine can take card text in the turn (API engines). CLI engines open the files themselves. */
  allowInline: boolean;
  access: CardAccess;
  inlineBudgetBytes: number;
}

export interface TurnPlan {
  /** Text placed ahead of the user's message for THIS turn only (never stored in history). */
  text: string;
  /** Card ids involved (inlined or named). */
  sources: string[];
}

/**
 * Decide which cards a turn gets and how.
 *  - Nothing built yet: route on the message + everything known about the project. Once a spec is
 *    confirmed (the build turn) and the engine allows it, the cards' full text goes into the turn, so
 *    even a model with weak tool discipline starts from the right rules.
 *  - A build exists: only the new request decides (the old spec would re-match on every turn), and
 *    the cards are only named — the AI opens them on demand.
 */
export function planTurnContext(input: TurnPlanInput): TurnPlan {
  const cards = routeRules(input.pack, {
    text: input.hasFiles ? input.userMessage : `${input.userMessage} ${input.projectText}`,
    kind: input.kind,
    features: input.hasFiles ? [] : input.features,
    newBuild: !input.hasFiles,
  });
  if (cards.length === 0) return { text: "", sources: [] };
  const sources = cards.map((c) => c.id);
  // "inline" access has no other way to see a card, so matched cards always come with the turn
  const inlineNow = input.access.via === "inline" || (input.allowInline && !input.hasFiles && input.specConfirmed);
  if (!inlineNow) {
    return { text: renderDirective(cards, input.access), sources };
  }
  const inlined = renderCards(cards, input.inlineBudgetBytes);
  const rest = cards.filter((c) => !inlined.ids.includes(c.id));
  const text =
    `[EasyGAS: rule cards for this build — follow them (the rules in the system prompt and the user's look & feel choices still win)]\n` +
    `${inlined.text}${rest.length ? `\n\n${renderDirective(rest, input.access)}` : ""}`;
  return { text, sources };
}
