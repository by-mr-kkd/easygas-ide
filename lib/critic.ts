import { sanitizeChoice } from "@/lib/ai-choice";
import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { getFiles } from "@/lib/files";
import { LLM_PROVIDERS, type LlmProvider } from "@/lib/llm/catalog";
import { resolveProvider } from "@/lib/llm/provider";
import { renderPrefsForReview } from "@/lib/preferences";
import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { projectPrefs } from "@/lib/rulebook/context";
import { getAppSetting, getSettings } from "@/lib/settings";
import type { EgsProject } from "@/types/db";

/**
 * Gate 1 — rulebook critic (QUALITY-MOAT §2): a single cheap LLM-as-judge pass that catches
 * semantic best-practice violations the regex lint (gate 0, lib/gas-codegen.validateGasFiles)
 * structurally cannot. It is a pre-filter, NOT a "does it run" verdict — that is gate 2
 * (dynamic run-and-repair, deferred). The agent loop runs ONE bounded auto-repair from its output.
 */

// The critic runs on the USER'S OWN account, with the SAME AI and model they picked for the chat
// (project.ai) — they pay for it, so they decide; there is no hidden cheaper judge.
// settings.app.critic_provider / critic_model still override it for someone who wants a separate one.
// This file covers the API providers; when the pick is a CLI engine the review goes through that CLI
// (lib/engines/cli-review.ts). No key for any provider → the API critic is skipped (best-effort).

interface CriticConfig {
  provider: LlmProvider;
  family: "anthropic" | "openai";
  model: string;
  apiKey: string;
  baseURL?: string;
}

/** Pick the critic backend: explicit setting → the AI picked in the chat → the project's / app's provider. */
async function resolveCritic(project?: EgsProject | null): Promise<CriticConfig | null> {
  const stored = (await getAppSetting("critic_provider")) as LlmProvider | null;
  const picked = sanitizeChoice(project?.ai);
  const pickedProvider = picked?.engine === "api" ? (picked.provider ?? null) : null;
  const order = [
    stored,
    pickedProvider,
    (project?.llm_provider as LlmProvider | null) ?? null,
    (await getSettings()).provider,
  ].filter((p): p is LlmProvider => !!p && LLM_PROVIDERS.includes(p));
  for (const provider of order) {
    const cfg = await resolveProvider(provider);
    if (!cfg.apiKey) continue;
    const explicitModel = provider === stored ? (await getAppSetting("critic_model"))?.trim() : "";
    const pickedModel = provider === pickedProvider ? picked?.model : "";
    return {
      provider,
      family: cfg.family,
      model: explicitModel || pickedModel || cfg.model,
      apiKey: cfg.apiKey,
      baseURL: cfg.baseURL,
    };
  }
  return null;
}
const AUDIT_MAX_TOKENS = 8000; // the audit writes four Thai fields per finding
const AUDIT_RETRY_MAX_TOKENS = 16000;
const CRITIC_MAX_TOKENS = 4000; // headroom for issue-rich replies (was 1500 → truncated → silent "✓ ผ่าน")
const CRITIC_RETRY_MAX_TOKENS = 10000; // one retry with big headroom when the first verdict was unparseable
const MAX_ISSUES = 12; // bound the repair prompt

export type CriticSeverity = "high" | "medium" | "low";

/** "check" = the gate the app runs on its own builds; "audit" = "วิเคราะห์โค้ด" of a script the user brought in. */
export type ReviewMode = "check" | "audit";

export interface CriticIssue {
  file: string;
  /** 1-based line in `file` where the problem is (for editor highlighting); undefined if unknown. */
  line?: number;
  severity: CriticSeverity;
  problem: string;
  fix: string;
  /** audit only: a short Thai headline, and what gets better once it is fixed */
  title?: string;
  benefit?: string;
}

export interface CriticResult {
  ok: boolean;
  issues: CriticIssue[];
  /** true = the verdict could NOT be trusted (reply unparseable/truncated even after retry) — this is
   *  NOT a clean pass. Callers must show "ตรวจไม่สำเร็จ", never "✓ ผ่าน", and log critic_status=degraded. */
  degraded: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

interface CriticUsage {
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

const EMPTY: CriticResult = {
  ok: true,
  issues: [],
  degraded: false,
  inputTokens: 0,
  outputTokens: 0,
  cacheReadTokens: 0,
  cacheCreationTokens: 0,
};

const CRITIC_RUBRIC = `You are a senior Google Apps Script (GAS) reviewer. Review the project files for
correctness / best-practice problems that a regex linter CANNOT catch. Look specifically for:
- web app missing doGet(e), or doGet not returning HtmlOutput, or missing setXFrameOptionsMode(ALLOWALL)
- a web app whose doGet renders HtmlOutput WITHOUT .addMetaTag('viewport', 'width=device-width, initial-scale=1') — without it the page is zoomed-out and unusable on a phone (most Thai users are mobile) = high
- a doGet that runs provisioning/setup (creating sheets or Drive folders, ScriptApp trigger setup, openById) inside ONE try whose catch hides the UI, so any failure (e.g. a missing trigger scope) blocks the WHOLE page including login — the UI/login MUST render even if provisioning fails: render first, OR wrap each best-effort setup step in its own try/catch, and NEVER let ScriptApp.* trigger setup throw out of doGet = high
- a web app that declares a sensitive scope which may be granted incrementally (ScriptApp triggers especially, or MailApp/DocumentApp added later) but whose doGet has NO ScriptApp.getAuthorizationInfo(ScriptApp.AuthMode.FULL) guard that renders getAuthorizationUrl() when getAuthorizationStatus() is REQUIRED — without it, the day the owner adds that capability the deployed app throws 'insufficient permissions' instead of letting them re-authorize. Add the guard at the top of doGet so the app self-heals = medium
- appsscript.json oauthScopes that DON'T match the services actually used (missing scope = high; over-broad scope = medium — matters for OAuth verification)
- a manifest that declares dependencies.enabledAdvancedServices (an Advanced Google Service like Drive/Sheets/Calendar) or dependencies.libraries (an Apps Script library by id), OR server code that calls a bare Advanced Service object (Drive.Files.*, Sheets.Spreadsheets.*, Calendar.Events.*) instead of the built-in service (DriveApp/SpreadsheetApp/CalendarApp) — these need the end user to enable an API in Cloud Console or add a library by hand, which a non-coder cannot do and which breaks the auto-deploy. Use built-in services only = high
- webapp.access that isn't ANYONE_ANONYMOUS for a public no-login web app (plain "ANYONE" still forces a Google sign-in = high for a public tool)
- client↔server calls using fetch() to a URL instead of google.script.run.withSuccessHandler/withFailureHandler
- hardcoded spreadsheet/doc IDs via openById/openByUrl instead of getActiveSpreadsheet/getActiveDocument
- dates formatted with toISOString()/moment/dayjs instead of Utilities.formatDate(date,'Asia/Bangkok',fmt)
- a phone/tel/idcard value written to a Sheet via appendRow([...]) or setValue() when that target column is NOT set to text with setNumberFormat('@') ANYWHERE in the script — the leading 0 is silently dropped (08x → 8x). Trace the appendRow/setValue column order to find the phone field; also flag reading such a column with getValue() instead of getDisplayValue() = high
- user-supplied text written to a Sheet WITHOUT neutralizing a leading = + - @ (formula/CSV injection): such values must be prefixed (e.g. "'" + value) before setValue/appendRow — high when admin views the sheet
- a server entry point (doPost, or a google.script.run target like submitX/save/create) that writes client input to a Sheet WITHOUT validating it server-side (required fields present + basic format, e.g. phone/date) — client-side checks are bypassable, so the server MUST re-validate = high
- a server entry point reachable via google.script.run/doPost that RETURNS or MUTATES admin/privileged data (settings, a full-records dump, trigger management) WITHOUT a server-side authorization check (PIN/role/owner) — in a public ANYONE_ANONYMOUS web app every such function is callable by anyone, so it MUST re-verify the caller's permission server-side; also flag any function that hands a secret/PIN/token back to the client (e.g. getAdminPin) = high
- missing try/catch on server entry points, or google.script.run without a .withFailureHandler
- concurrent writes to a Sheet without LockService
- a re-entrant / nested LockService deadlock: a function takes a lock (getScriptLock/getDocumentLock().waitLock) then calls a helper that takes the SAME lock again — the inner wait blocks until timeout (a hang / multi-second stall). A given lock must be acquired in ONE place per call chain; don't re-take a lock a caller already holds = high
- container-bound script missing onOpen() menu, or automation implied but no installTriggers() setup function
- a multi-step write that touches more than one sheet/range (e.g. mark a transaction "returned" AND add the stock back) that can leave a HALF-DONE state on partial failure: step 1 commits, step 2 fails, no rollback. Order the writes so the riskier one runs first, and/or wrap the whole read-modify-write in ONE LockService section so it's atomic = high
- a state-changing entry point (approve/cancel/return/complete) that sets the new status WITHOUT first reading the CURRENT status and verifying the transition is legal — e.g. approveX writes 'approved' without checking the row is currently 'pending', or cancelX cancels a row that is already completed/rejected. Read the current state and reject an illegal transition = medium
- a google.script.run call whose .withFailureHandler is EMPTY or a no-op (swallows the error) — it MUST surface the failure to the user (toast/inline message), not fail silently = medium
- client-side validation of a date/number that is too loose (e.g. only isNaN() after split('/'), so spaces or partial input pass) — validate the real format + range; and the SERVER entry point must re-validate too (client checks are bypassable) = medium
- a free-text field written to a Sheet with NO length bound (no maxlength on the <input>/<textarea> and no server-side length cap) — cap it so one row can't store runaway/abusive data = low
When judging appsscript.json oauthScopes use this GAS service→scope map and do NOT invent scopes: SpreadsheetApp on its own bound sheet = auth/spreadsheets; SpreadsheetApp.create = auth/drive.file; DriveApp (any method, even on files the app itself created) = auth/drive, because DriveApp does not accept drive.file: do NOT flag auth/drive as over-broad when the code uses DriveApp, and DO flag drive.file declared for DriveApp (it fails at run time); reading an EXTERNAL file by id/url (e.g. DriveApp.getFileById on a user template) = auth/drive.readonly (prefer over full auth/drive); DocumentApp = auth/documents; SlidesApp = auth/presentations; FormApp = auth/forms; MailApp.sendEmail = auth/script.send_mail; GmailApp.sendEmail = auth/gmail.send (these are DIFFERENT — do NOT accept auth/script.send_mail for GmailApp, and never the restricted full mail.google.com just to send; prefer MailApp for simple notifications); ScriptApp triggers (newTrigger/getProjectTriggers/deleteTrigger) = auth/script.scriptapp; UrlFetchApp = auth/script.external_request; Session.getActiveUser().getEmail() = auth/userinfo.email (returns '' for anonymous users in an ANYONE_ANONYMOUS web app, so it is usually pointless there). PropertiesService, LockService, CacheService, Utilities, HtmlService and ContentService require NO oauth scope — do NOT flag a missing scope for them, and note there is NO 'auth/script.storage' scope (it does not exist — never tell the user to add it).`;

const CHECK_OUTPUT = `Only report REAL problems — do not invent issues or nitpick style. If the code is sound, return an empty list.
Each file's content is shown with a "N: " line-number prefix. For every issue include "line": the 1-based
line number (the N) where the problem is — pick the single most relevant line; omit only if truly file-wide.
Reply with ONLY a json object, no prose, no markdown fences (output must be valid json):
{"issues":[{"file":"Code.gs","line":42,"severity":"high|medium|low","problem":"<short>","fix":"<short actionable fix>"}]}`;

const CRITIC_SYSTEM = `${CRITIC_RUBRIC}\n${CHECK_OUTPUT}`;

const AUDIT_OUTPUT = `This is an AUDIT of an EXISTING script the user already runs: it was imported from their Google
account, not written by this app. The user is not a programmer; they will read each finding and pick which ones
to have fixed, so each one must stand on its own.
- Judge the code against the checklist above, plus plain bugs (code that will throw or give wrong results) and
  security holes. Only REAL problems, at most 12, the most important first. No style nitpicks, no rewrites for taste.
- Some choices may be deliberate in an existing script: webapp.access other than ANYONE_ANONYMOUS (report it as low
  at most, explaining the trade-off), a script with no doGet and no onOpen (it may run from triggers or the editor:
  not a defect), openById on a fixed file in a standalone script (low at most).
- Write every text field in plain Thai that a non-programmer understands. Avoid jargon; when a code name is needed,
  put it in backticks.
Each file's content is shown with a "N: " line-number prefix. For every issue include "line": the 1-based line number
(the N) where the problem is; omit it only when the problem is file-wide.
Reply with ONLY a json object, no prose, no markdown fences (output must be valid json):
{"issues":[{"file":"Code.gs","line":42,"severity":"high|medium|low","title":"<Thai, under 60 characters: what is wrong>","problem":"<Thai, 1-3 sentences: what is wrong and what can go wrong for the people using it>","fix":"<Thai, 1-3 sentences: how the code would be changed>","benefit":"<Thai, one sentence: what gets better once it is fixed>"}]}`;

const AUDIT_SYSTEM = `${CRITIC_RUBRIC}\n${AUDIT_OUTPUT}`;
const systemFor = (mode: ReviewMode): string => (mode === "audit" ? AUDIT_SYSTEM : CRITIC_SYSTEM);

function normalizeSeverity(s: unknown): CriticSeverity {
  return s === "high" || s === "low" ? s : "medium";
}

function parseIssues(text: string): CriticIssue[] | null {
  try {
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return null; // no JSON object at all → not a verdict (truncated / refused / prose)
    const obj = JSON.parse(match[0]) as { issues?: unknown };
    if (!Array.isArray(obj.issues)) return null; // malformed shape → not a verdict
    return obj.issues
      .filter((i): i is Record<string, unknown> => !!i && typeof i === "object")
      .map((i) => {
        const n = Math.trunc(Number(i.line));
        return {
          file: String(i.file ?? "").trim() || "(unknown)",
          line: Number.isFinite(n) && n > 0 ? n : undefined,
          severity: normalizeSeverity(i.severity),
          problem: String(i.problem ?? "").trim(),
          fix: String(i.fix ?? "").trim(),
          ...(typeof i.title === "string" && i.title.trim() ? { title: i.title.trim() } : {}),
          ...(typeof i.benefit === "string" && i.benefit.trim() ? { benefit: i.benefit.trim() } : {}),
        };
      })
      .filter((i) => i.problem.length > 0)
      .slice(0, MAX_ISSUES);
  } catch {
    return null; // JSON.parse threw (usually truncation) → not a verdict
  }
}

function toResult(issues: CriticIssue[] | null, usage: CriticUsage): CriticResult {
  // issues === null → the reply wasn't a parseable verdict → DEGRADED (not a clean pass).
  if (issues === null) return { ok: false, degraded: true, issues: [], ...usage };
  return { ok: issues.length === 0, degraded: false, issues, ...usage };
}

/**
 * Format the confirmed spec (egs_projects.spec) into a CONFORMANCE rubric (P1-5): the critic must
 * check the code actually implements what the user was promised — a whole class of "tidy but
 * incomplete" builds that pass every other gate. Empty/absent spec → "" (review code-quality only).
 */
function buildSpecBlock(spec: Record<string, unknown> | null): string {
  if (!spec) return "";
  const list = (v: unknown): string[] => (Array.isArray(v) ? v.map(String).filter(Boolean) : []);
  const features = list(spec.features);
  const dataModel = list(spec.dataModel);
  const outputs = list(spec.outputs);
  const lines: string[] = [];
  if (spec.summary) lines.push(`สรุประบบ: ${String(spec.summary)}`);
  if (features.length) lines.push(`ฟีเจอร์ที่ต้องมี: ${features.join("; ")}`);
  if (dataModel.length) lines.push(`ข้อมูล/คอลัมน์ที่ต้องเก็บ: ${dataModel.join("; ")}`);
  if (outputs.length) lines.push(`ผลลัพธ์/การกระทำที่ต้องทำได้: ${outputs.join("; ")}`);
  if (spec.storage) lines.push(`ที่เก็บข้อมูล: ${String(spec.storage)}`);
  if (lines.length === 0) return "";
  return (
    `=== SPEC ที่ผู้ใช้ยืนยันไว้ — ต้องตรวจว่าโค้ด "ทำครบ" ===\n${lines.join("\n")}\n\n` +
    `CONFORMANCE CHECK: for EACH feature / data field / output listed above, verify the code ACTUALLY ` +
    `implements it, and flag any PROMISED item with no corresponding implementation as an issue (severity ` +
    `"high"). Examples: spec says "ส่งอีเมลยืนยัน" but there is no MailApp/GmailApp.sendEmail call; a data ` +
    `field (เบอร์โทร/วันที่/ชื่อ) with no matching Sheet header/column write; an output/action with no handler ` +
    `function. Put "file"/"line" at the entry point where it SHOULD be wired. Do NOT flag extra functionality ` +
    `the spec didn't mention, and do NOT invent missing items you can't confirm from the code.\n\n`
  );
}

/** Number every line so the model can cite a 1-based `line` we map to an editor marker. */
function buildReviewPrompt(files: { path: string; content: string }[], project: EgsProject, look: string): string {
  const body = files
    .map((f) => {
      const numbered = f.content
        .split("\n")
        .map((ln, i) => `${i + 1}: ${ln}`)
        .join("\n");
      return `=== ${f.path} ===\n${numbered}`;
    })
    .join("\n\n");
  const kind =
    project.origin === "imported"
      ? `existing script imported from the user's Google account (${project.kind === "webapp" ? "has a web app section: doGet entry point" : "no web app section: it may be bound to a Sheet/Doc or run from triggers"})`
      : project.kind === "bound"
      ? "container-bound script (bound to a Google Sheet, uses onOpen menu)"
      : "standalone web app (doGet entry point)";
  // premium: the front page is published to GitHub Pages where the camera works — the fixed rubric
  // still calls camera use broken for GAS, so the fact travels in the request (not the cached system)
  const hosting = cameraAllowedFor(project)
    ? "\nHosting: the front page (HTML) is published to the user's GitHub Pages and calls the GAS web app as backend. Camera use (getUserMedia, <input capture>, QR/barcode scanning) WORKS there and is intended: do not report it as a defect. Still expect feature detection with a fallback, and no secrets in the client."
    : "";
  // `look` = the user's look & feel choices: deliberate, so the judge must not report them as defects
  return `Project kind: ${kind}${hosting}\n${look}\n\n${buildSpecBlock(project.spec)}${body}`;
}

/** A reply from any backend (API or CLI) → a verdict. Unparseable text is DEGRADED, never a pass. */
export function criticResultFromText(text: string): CriticResult {
  return toResult(parseIssues(text), { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheCreationTokens: 0 });
}

/** The rubric and the numbered files to review, for a backend this file does not call itself. */
export async function buildReviewRequest(
  project: EgsProject,
  projectId: string,
  mode: ReviewMode = "check",
): Promise<{ system: string; user: string } | null> {
  const files = await getFiles(projectId);
  if (files.length === 0) return null;
  return { system: systemFor(mode), user: buildReviewPrompt(files, project, renderPrefsForReview(await projectPrefs(project))) };
}

/** Critic backend: Anthropic — caches the constant rubric (identical on every call). */
async function reviewWithAnthropic(
  system: string,
  userPrompt: string,
  model: string,
  apiKey: string,
  maxTokens: number,
): Promise<CriticResult> {
  const client = new Anthropic({ apiKey });
  const msg = await client.messages.create({
    model,
    max_tokens: maxTokens,
    system: [{ type: "text", text: system, cache_control: { type: "ephemeral" } }],
    messages: [{ role: "user", content: userPrompt }],
  });
  const text = msg.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("");
  return toResult(parseIssues(text), {
    inputTokens: msg.usage?.input_tokens ?? 0,
    outputTokens: msg.usage?.output_tokens ?? 0,
    cacheReadTokens: msg.usage?.cache_read_input_tokens ?? 0,
    cacheCreationTokens: msg.usage?.cache_creation_input_tokens ?? 0,
  });
}

/**
 * Critic backend: OpenAI wire format (DeepSeek OR z.ai-GLM — both speak it). Auto-caches the stable
 * system prefix; json_object mode keeps the reply parseable. Reasoning models (DeepSeek V4-Pro/reasoner,
 * GLM-5.x) reject response_format(json_object) and spend output on the chain-of-thought first, so we
 * give them headroom and parse the JSON out of the text (parseIssues extracts the {...}; reasoning_content
 * is a fallback when the final answer lands there). Non-streaming — a short one-shot JSON verdict.
 */
async function reviewWithOpenAi(
  system: string,
  userPrompt: string,
  model: string,
  apiKey: string | undefined,
  baseURL: string | undefined,
  maxTokens: number,
): Promise<CriticResult> {
  const client = new OpenAI({ apiKey, baseURL });
  const reasoning = /v4-pro|reasoner|glm-5/i.test(model);
  const res = await client.chat.completions.create({
    model,
    max_tokens: reasoning ? Math.max(8000, maxTokens) : maxTokens,
    messages: [
      { role: "system", content: system },
      { role: "user", content: userPrompt },
    ],
    ...(reasoning ? {} : { response_format: { type: "json_object" as const } }),
  });
  const m = res.choices[0]?.message as { content?: string | null; reasoning_content?: string } | undefined;
  const text = m?.content?.trim() || m?.reasoning_content || "";
  const u = res.usage;
  const cacheHit =
    (u as { prompt_cache_hit_tokens?: number } | undefined)?.prompt_cache_hit_tokens ??
    u?.prompt_tokens_details?.cached_tokens ??
    0;
  return toResult(parseIssues(text), {
    inputTokens: Math.max(0, (u?.prompt_tokens ?? 0) - cacheHit),
    outputTokens: u?.completion_tokens ?? 0,
    cacheReadTokens: cacheHit,
    cacheCreationTokens: 0,
  });
}

export interface CriticInfo {
  provider: LlmProvider | null;
  model: string;
  /** Is a key available for some critic provider? (recheck shows "couldn't run" when not.) */
  configured: boolean;
}

/** What the critic is currently wired to — for availability checks at call sites. */
export async function getCriticInfo(project?: EgsProject | null): Promise<CriticInfo> {
  const cfg = await resolveCritic(project);
  return { provider: cfg?.provider ?? null, model: cfg?.model ?? "", configured: cfg !== null };
}

/**
 * Review every file in a project with the rulebook critic. A malformed model reply degrades to
 * ok:true / empty issues (parseIssues never throws); a backend / network error — or no key at all —
 * DOES throw. Every caller wraps this in try/catch and treats the critic as best-effort.
 */
export async function reviewProject(project: EgsProject, projectId: string, mode: ReviewMode = "check"): Promise<CriticResult> {
  const files = await getFiles(projectId);
  if (files.length === 0) return EMPTY;
  // projectPrefs reads the project fresh: a choice the AI saved earlier in this request counts
  const userPrompt = buildReviewPrompt(files, project, renderPrefsForReview(await projectPrefs(project)));
  const critic = await resolveCritic(project);
  if (!critic) throw new Error("critic_not_configured");
  const system = systemFor(mode);
  const run = (maxTokens: number): Promise<CriticResult> =>
    critic.family === "anthropic"
      ? reviewWithAnthropic(system, userPrompt, critic.model, critic.apiKey, maxTokens)
      : reviewWithOpenAi(system, userPrompt, critic.model, critic.apiKey, critic.baseURL, maxTokens);

  let r = await run(mode === "audit" ? AUDIT_MAX_TOKENS : CRITIC_MAX_TOKENS);
  // P1-1: an unparseable/truncated verdict is DEGRADED — retry ONCE with big headroom before giving
  // up (else the WORST code, whose issue list is longest, is the MOST likely to silently "pass").
  if (r.degraded) {
    const r2 = await run(mode === "audit" ? AUDIT_RETRY_MAX_TOKENS : CRITIC_RETRY_MAX_TOKENS);
    r = {
      ...r2,
      inputTokens: r.inputTokens + r2.inputTokens,
      outputTokens: r.outputTokens + r2.outputTokens,
      cacheReadTokens: r.cacheReadTokens + r2.cacheReadTokens,
      cacheCreationTokens: r.cacheCreationTokens + r2.cacheCreationTokens,
    };
  }
  return r;
}
