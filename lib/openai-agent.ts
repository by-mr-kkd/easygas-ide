import OpenAI from "openai";
import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { validateGasFiles } from "@/lib/gas-codegen";
import { reviewProject } from "@/lib/critic";
import { getFiles } from "@/lib/files";
import { appendRawMessages, getRawHistory, trimIncompleteOpenAiTail } from "@/lib/messages";
import {
  EGS_TOOLS,
  executeEgsTool,
  turnContextFor,
  type AgentRunResult,
  type Emit,
  type RunAgentArgs,
  type TurnUsage,
} from "@/lib/anthropic-agent";
import { noteLintIssues } from "@/lib/lessons-store";
import type { ProviderConfig } from "@/lib/llm/provider";
import { buildSystemPromptParts } from "@/lib/rulebook/context";

/**
 * OpenAI-wire-format agent loop for the A/B (ChatGPT native + DeepSeek via baseURL). Mirrors the
 * Anthropic loop but in OpenAI's messages/tool_calls shape. Reuses executeEgsTool (file ops) and,
 * for the critic, the SAME Claude reviewer as every arm — so "critic issues" is a consistent
 * yardstick across providers. The auto-repair runs on the project's own provider (keeps history
 * format consistent).
 */

const MAX_ITERATIONS = 8;
const REPAIR_MAX_ITERATIONS = 6;
const MAX_TOKENS_FALLBACK = 16000; // used when an arm has no explicit maxOutputTokens (≈ gpt-4o ceiling)
const AUTO_CONTINUE_MAX = 2; // auto-fire "ทำต่อ" this many times when a build caps mid-way

type Msg = OpenAI.Chat.Completions.ChatCompletionMessageParam;

/**
 * DeepSeek thinking models (V4 Pro) stream a separate `reasoning_content` channel and REQUIRE it
 * preserved on assistant messages in multi-turn tool histories (else a 400). Attach it for those
 * arms; a no-op everywhere else.
 */
function withReasoning(msg: Msg, reasoning: string, isReasoning?: boolean): Msg {
  if (isReasoning && reasoning) (msg as { reasoning_content?: string }).reasoning_content = reasoning;
  return msg;
}

const OPENAI_TOOLS: OpenAI.Chat.Completions.ChatCompletionTool[] = EGS_TOOLS.map((t) => ({
  type: "function",
  function: { name: t.name, description: t.description, parameters: t.input_schema as Record<string, unknown> },
}));

/**
 * Drop reasoning_content from a message before persisting a CROSS-ARM repair (e.g. GLM fixing a
 * deepseek project): the project's home arm would otherwise re-read a foreign model's chain-of-thought
 * on its next turn. The field is only needed within the repairer's own tool cycle (kept in memory),
 * never downstream.
 */
function stripReasoningField(m: Msg): Msg {
  const obj = m as unknown as Record<string, unknown>;
  if (obj && typeof obj === "object" && "reasoning_content" in obj) {
    const rest = { ...obj };
    delete rest.reasoning_content;
    return rest as unknown as Msg;
  }
  return m;
}

interface TurnResult {
  mutated: boolean;
  capped: boolean;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}

async function runOpenAiTurn(
  client: OpenAI,
  cfg: ProviderConfig,
  {
    projectId,
    project,
    userMessage,
    images = [],
    internal = false,
    stripHistoryReasoning = false,
    turnContext = "",
    emit,
  }: RunAgentArgs,
): Promise<TurnResult> {
  // The rulebook goes in the FIRST system message. OpenAI, DeepSeek and Gemini all auto-cache a stable
  // prompt PREFIX, so the shared part (core + rule-card index) comes first and the project's look &
  // feel block last — do NOT prepend dynamic content to `system` (it would bust the cache; per-turn
  // context rides on the user message instead, like the Claude arm).
  const parts = await buildSystemPromptParts(project, { via: "tool" }, { via: "tool" }, { via: "tool" });
  const system = parts.core + parts.prefs;
  // Drop blank assistant turns (a prior empty completion with no text and no tool_calls) — some
  // providers choke when replaying them and just return empty again, snowballing the silence.
  const history = ((await getRawHistory(projectId, { stripReasoning: stripHistoryReasoning })) as Msg[]).filter(
    (m) =>
      !(
        m.role === "assistant" &&
        (m.content == null || m.content === "") &&
        !(m as { tool_calls?: unknown[] }).tool_calls?.length
      ),
  );

  // live user turn — attach image parts ONLY to vision-capable arms. Text-only arms (DeepSeek/GLM)
  // get a Claude-generated text description instead (the vision proxy runs in the route).
  const liveText = turnContext ? `${turnContext}\n\n---\n${userMessage}` : userMessage;
  const userContent: OpenAI.Chat.Completions.ChatCompletionContentPart[] | string =
    images.length && cfg.vision
      ? [
          { type: "text", text: liveText },
          ...images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` },
          })),
        ]
      : liveText;

  const base: Msg[] = [{ role: "system", content: system }, ...history];
  const messages: Msg[] = [...base, { role: "user", content: userContent }];

  let mutated = false;
  let capped = false;
  let emittedText = false;
  let forcedToolRetry = false;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0; // OpenAI-format providers (DeepSeek/z.ai/…) auto-cache; capture the split

  let flushed = false;
  // Persist this turn EXACTLY ONCE — from the normal exit AND from a mid-loop throw — so files
  // written this turn keep matching history (P0-3). getRawHistory() trims any orphan tool round as
  // a backstop for a container restart that skips this.
  const flushTurn = async (isError: boolean): Promise<void> => {
    if (flushed) return;
    flushed = true;

    // Guard: a provider (notably Gemini's OpenAI-compat) can return an EMPTY completion. Never leave
    // the chat dead-silent — but skip this on an error path (the route surfaces the real error).
    if (!isError && !emittedText && !mutated) {
      const fallback =
        "ขออภัย รอบนี้ AI ตอบกลับมาว่าง ๆ (อาจมีจังหวะสะดุด) — ลองพิมพ์สั่งอีกครั้ง ถ้าเพิ่งสรุปสเปคไว้ พิมพ์ “สร้างเลย” เพื่อให้เริ่มเขียนโค้ดได้เลยครับ";
      emit({ type: "text", delta: fallback });
      const lastMsg = messages[messages.length - 1] as { role: string; content: unknown };
      if (lastMsg?.role === "assistant" && (lastMsg.content == null || lastMsg.content === "")) {
        lastMsg.content = fallback;
      }
    }

    // persist this turn's messages (everything after system+history); store the user turn TEXT-only.
    // trimIncompleteOpenAiTail drops a trailing assistant whose tool_calls weren't all answered (a
    // throw between emitting tool_calls and writing every tool result) — persisting it 400s next turn.
    const added = trimIncompleteOpenAiTail(messages.slice(base.length)) as Msg[];
    if (added[0]?.role === "user") {
      const note = images.length ? `\n\n(แนบรูปอ้างอิง ${images.length} รูป)` : "";
      added[0] = { role: "user", content: userMessage + note };
    }
    // skip a turn with no assistant reply (provider threw on the first call) — a lone user turn would
    // create consecutive user messages next turn.
    if (added.length === 0 || !added.some((m) => m.role === "assistant")) return;
    try {
      await appendRawMessages(
        projectId,
        added.map((m) => ({
          role: m.role,
          // cross-arm repair (GLM into a deepseek project) → don't persist the repairer's CoT.
          content: stripHistoryReasoning ? stripReasoningField(m) : m,
        })),
      );
    } catch (pe) {
      console.error("[openai-agent] persist failed:", pe);
      if (!isError) throw pe;
    }
  };

  try {
  for (let iter = 0; iter < (internal ? REPAIR_MAX_ITERATIONS : MAX_ITERATIONS); iter++) {
    const params: OpenAI.Chat.Completions.ChatCompletionCreateParamsStreaming = {
      model: cfg.model,
      max_tokens: cfg.maxOutputTokens ?? MAX_TOKENS_FALLBACK,
      messages,
      tools: OPENAI_TOOLS,
      stream: true,
      stream_options: { include_usage: true },
    };
    // DeepSeek thinking models (V4 Pro) return a 400 if tool_choice is sent — let the model decide.
    // Other arms keep the explicit choice (auto, or "required" on the forced-tool retry).
    if (!cfg.reasoning) params.tool_choice = forcedToolRetry ? "required" : "auto";
    const stream = await client.chat.completions.create(params);

    let text = "";
    let reasoning = ""; // DeepSeek thinking-model chain-of-thought (separate channel); preserved in history
    const toolAcc = new Map<string | number, { id: string; name: string; args: string }>();
    let lastToolKey: string | number | null = null;
    let toolSeq = 0;
    let finish: string | null = null;

    let lastUsage: OpenAI.Completions.CompletionUsage | undefined; // capture ONCE per request
    for await (const chunk of stream) {
      // Some OpenAI-compat providers (DeepSeek notably) emit a `usage` object on MORE than one chunk
      // (the finish chunk AND the trailing empty chunk), each carrying the SAME cumulative request
      // total — so OVERWRITE here and apply exactly once after the stream. Accumulating per-chunk
      // double-counts (~2× on DeepSeek) and inflated the COGS view.
      if (chunk.usage) lastUsage = chunk.usage;
      const choice = chunk.choices[0];
      if (!choice) continue;
      if (choice.finish_reason) finish = choice.finish_reason;
      const delta = choice.delta;
      if (delta?.content) {
        text += delta.content;
        emittedText = true;
        emit({ type: "text", delta: delta.content });
      }
      const rc = (delta as { reasoning_content?: string } | undefined)?.reasoning_content;
      if (rc) reasoning += rc;
      for (const tc of delta?.tool_calls ?? []) {
        // OpenAI always sends a numeric `index`; Gemini's OpenAI-compat layer often OMITS it (and may
        // deliver a whole call in one delta). Key by index when present; otherwise start a new entry
        // on each `id`, and treat an index-less + id-less delta as a continuation of the last call.
        let key: string | number;
        if (typeof tc.index === "number") key = tc.index;
        else if (tc.id) key = `k${toolSeq++}`;
        else key = lastToolKey ?? `k${toolSeq++}`;
        lastToolKey = key;
        let entry = toolAcc.get(key);
        if (!entry) {
          entry = { id: "", name: "", args: "" };
          toolAcc.set(key, entry);
        }
        if (tc.id) entry.id = tc.id;
        if (tc.function?.name) entry.name = tc.function.name;
        if (tc.function?.arguments) entry.args += tc.function.arguments;
      }
    }

    // bill this request's usage exactly once (per create() call; summed across loop iterations).
    if (lastUsage) {
      const usage = lastUsage;
      // cache hit lives in different fields per provider: DeepSeek = prompt_cache_hit_tokens,
      // OpenAI/z.ai = prompt_tokens_details.cached_tokens. prompt_tokens INCLUDES the cached part,
      // so the full-price input is (prompt_tokens − hit). These providers don't bill cache writes.
      const cacheHit =
        (usage as { prompt_cache_hit_tokens?: number }).prompt_cache_hit_tokens ??
        usage.prompt_tokens_details?.cached_tokens ??
        0;
      inputTokens += Math.max(0, (usage.prompt_tokens ?? 0) - cacheHit);
      cacheReadTokens += cacheHit;
      outputTokens += usage.completion_tokens ?? 0;
    }

    // preserve arrival order; synthesize an id when the provider omits one (Gemini sometimes does) —
    // the assistant tool_calls AND the matching tool results both need a stable, non-empty id.
    const calls = Array.from(toolAcc.values()).map((c, i) => ({
      ...c,
      id: c.id || `call_${i}`,
    }));

    if (calls.length === 0) {
      // Force ONE retry to coax a tool call ONLY when the model returned NOTHING (no text, no tools)
      // on the first step of a fresh build — a weak tool-user (Gemini) sometimes stalls. P1-11: do NOT
      // retry when there IS text (a legit Q&A answer) and NOT on reasoning arms — there tool_choice is
      // never sent, so the retry is a byte-identical DUPLICATE of a ~110s reasoning call (the biggest
      // single contributor to deepseek-pro's 112s average).
      if (iter === 0 && !forcedToolRetry && !internal && !cfg.reasoning && !text.trim()) {
        forcedToolRetry = true;
        continue; // re-run this step
      }
      messages.push(withReasoning({ role: "assistant", content: text }, reasoning, cfg.reasoning));
      break;
    }
    forcedToolRetry = false; // got tool calls → relax back to auto for subsequent steps

    // assistant turn that requested tools
    messages.push(
      withReasoning(
        {
          role: "assistant",
          content: text || null,
          tool_calls: calls.map((c) => ({
            id: c.id,
            type: "function",
            function: { name: c.name, arguments: c.args || "{}" },
          })),
        },
        reasoning,
        cfg.reasoning,
      ),
    );

    for (const c of calls) {
      let input: Record<string, unknown> = {};
      try {
        input = c.args ? (JSON.parse(c.args) as Record<string, unknown>) : {};
      } catch {
        /* truncated/invalid args → executeEgsTool returns a usable error */
      }
      emit({ type: "tool_call", name: c.name, input });
      const outcome = await executeEgsTool(projectId, c.name, input, emit);
      if (c.name === "write_file" || c.name === "delete_file") mutated = true;
      else if (c.name === "edit_file" && !outcome.isError) mutated = true;
      messages.push({ role: "tool", tool_call_id: c.id, content: outcome.content });
    }

    // project-level lint fed back (parity with the Anthropic loop)
    const all = await getFiles(projectId);
    const plint = validateGasFiles(
      all.map((f) => ({ name: f.path, content: f.content })),
      { isWebApp: project.kind !== "bound", allowCamera: cameraAllowedFor(project) },
    );
    noteLintIssues(projectId, [...plint.errors, ...plint.warnings], { midBuild: true });
    const issues = [...plint.errors, ...plint.warnings].map((i) => i.message);
    if (issues.length > 0) {
      const last = messages[messages.length - 1] as { content: string };
      // OpenAI tool messages have no is_error flag, so mark blocking errors inline so weak
      // tool-users (deepseek/GLM) don't end the turn on a hidden project-wide error (P1-9).
      const header =
        plint.errors.length > 0
          ? "[❌ ตรวจทั้งโปรเจกต์ — ต้องแก้ก่อนจบงาน]"
          : "[ตรวจทั้งโปรเจกต์]";
      last.content = `${last.content}\n\n${header}\n${issues.map((m) => "- " + m).join("\n")}`;
    }

    if (finish !== "tool_calls") {
      capped = finish === "length";
      break;
    }
    if (iter === (internal ? REPAIR_MAX_ITERATIONS : MAX_ITERATIONS) - 1) capped = true;
  }

  await flushTurn(false);
  } catch (e) {
    // A mid-loop throw still flushes what was produced so history matches the files already written,
    // then stashes partial usage so the route can meter it instead of logging 0.
    await flushTurn(true).catch((fe) => console.error("[openai-agent] flush-on-error failed:", fe));
    (e as { __egsUsage?: TurnUsage }).__egsUsage = {
      inputTokens,
      outputTokens,
      cacheReadTokens,
      cacheCreationTokens: 0,
    };
    throw e;
  }

  return { mutated, capped, inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens: 0 };
}

async function runOpenAiCriticGate(
  client: OpenAI,
  cfg: ProviderConfig,
  args: RunAgentArgs,
): Promise<{
  issues: number;
  criticStatus: string;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheCreationTokens: number;
}> {
  const { projectId, project, emit } = args;
  let inputTokens = 0;
  let outputTokens = 0;
  let cacheReadTokens = 0;
  let cacheCreationTokens = 0;
  const acc = (t: {
    inputTokens: number;
    outputTokens: number;
    cacheReadTokens?: number;
    cacheCreationTokens?: number;
  }) => {
    inputTokens += t.inputTokens;
    outputTokens += t.outputTokens;
    cacheReadTokens += t.cacheReadTokens ?? 0;
    cacheCreationTokens += t.cacheCreationTokens ?? 0;
  };
  const totals = (issues: number, criticStatus: string) => ({
    issues,
    criticStatus,
    inputTokens,
    outputTokens,
    cacheReadTokens,
    cacheCreationTokens,
  });
  try {
    // Working state in the status bar (not chat) — same as the Claude arm.
    emit({ type: "status", text: "กำลังตรวจสอบความถูกต้องของโค้ด…" });
    // consistent yardstick: the SAME shared rulebook critic for every arm (lib/critic CRITIC_PROVIDER)
    const review = await reviewProject(project, projectId);
    acc(review); // count the review's tokens (was dropped to 0 on this arm — P2-10)
    // P1-1: an unparseable/truncated verdict is NOT a clean pass — say so, never emit ✓.
    if (review.degraded) {
      emit({
        type: "text",
        delta: "\n\n⚠️ ตรวจคุณภาพอัตโนมัติไม่สมบูรณ์รอบนี้ (อ่านผลตรวจไม่ได้) — กดปุ่ม “ตรวจซ้ำ” ได้ ไม่กระทบโค้ด",
      });
      return totals(0, "degraded");
    }
    if (review.issues.length === 0) {
      emit({ type: "text", delta: "\n\n✓ ตรวจคุณภาพ (rulebook critic) — ผ่าน" });
      return totals(0, "clean");
    }
    const lines = review.issues.map((i) => `- [${i.severity}] ${i.file}: ${i.problem} → ${i.fix}`);
    emit({ type: "text", delta: `\n\n🔍 ตรวจคุณภาพพบ ${review.issues.length} จุด:\n${lines.join("\n")}` });

    const actionable = review.issues.filter((i) => i.severity !== "low");
    if (actionable.length === 0) return totals(review.issues.length, "issues");

    emit({ type: "status", text: "กำลังแก้ตามผลตรวจคุณภาพ…" });
    const repairMsg =
      "ตรวจคุณภาพ (rulebook critic) พบปัญหาต่อไปนี้ แก้ไฟล์ที่เกี่ยวข้องให้เรียบร้อยด้วย edit_file/write_file:\n" +
      actionable.map((i) => `- ${i.file}: ${i.problem} — แนวทาง: ${i.fix}`).join("\n");
    const repair = await runOpenAiTurn(client, cfg, { ...args, images: [], userMessage: repairMsg, internal: true });
    acc(repair);

    // P1-2: re-run the critic ONCE to report what actually got fixed — don't just assert "✓ แก้แล้ว".
    let remaining = actionable.length;
    try {
      const after = await reviewProject(project, projectId);
      acc(after);
      if (!after.degraded) remaining = after.issues.filter((i) => i.severity !== "low").length;
    } catch (e) {
      console.error("[openai-agent] post-repair re-review failed (non-fatal):", e);
    }
    const fixed = Math.max(0, actionable.length - remaining);
    if (remaining === 0) {
      emit({ type: "text", delta: "\n\n✓ แก้ตามผลตรวจคุณภาพแล้ว (ครบทุกจุด)" });
    } else {
      emit({
        type: "text",
        delta: `\n\n✓ แก้แล้ว ${fixed}/${actionable.length} จุด — เหลืออีก ${remaining} จุด พิมพ์ “แก้ต่อ” ได้ครับ`,
      });
    }
    return totals(review.issues.length, "issues");
  } catch (e) {
    // P1-3: a SKIPPED review is NOT a clean pass — neutral warning, no ✓, no "กด Deploy ได้เลย".
    console.error("[openai-agent] critic gate failed (non-fatal):", e);
    emit({
      type: "text",
      delta: "\n\n⚠️ ข้ามการตรวจคุณภาพอัตโนมัติรอบนี้ (ระบบตรวจไม่พร้อม) — กดปุ่ม “ตรวจซ้ำ” ได้ ไม่กระทบโค้ด",
    });
    return totals(0, "skipped");
  }
}

export async function runOpenAiAgentLoop(
  args: RunAgentArgs,
  cfg: ProviderConfig,
): Promise<AgentRunResult> {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  const turnContext = await turnContextFor(args);
  const main = await runOpenAiTurn(client, cfg, { ...args, turnContext });
  let inputTokens = main.inputTokens;
  let outputTokens = main.outputTokens;
  let cacheReadTokens = main.cacheReadTokens;
  let cacheCreationTokens = main.cacheCreationTokens;
  let criticIssues = 0;
  let criticStatus: string | null = null;
  const isCodegen = (args.turn ?? "codegen") === "codegen";

  // Auto-continue a build that capped mid-way (parity with the Claude loop): fire "ทำต่อ" ourselves a
  // couple of times so big apps finish without the user re-prompting. Each round streams live status.
  let mutated = main.mutated;
  let capped = main.capped;
  for (let round = 1; isCodegen && capped && mutated && round <= AUTO_CONTINUE_MAX; round++) {
    args.emit({ type: "status", text: `เนื้อหายาว — กำลังเขียนต่อให้อัตโนมัติ (${round}/${AUTO_CONTINUE_MAX})…` });
    // images:[] — already fed on the first round; re-sending re-bills vision tokens each round.
    const cont = await runOpenAiTurn(client, cfg, { ...args, images: [], userMessage: "ทำต่อ", turnContext });
    inputTokens += cont.inputTokens;
    outputTokens += cont.outputTokens;
    cacheReadTokens += cont.cacheReadTokens;
    cacheCreationTokens += cont.cacheCreationTokens;
    mutated = mutated || cont.mutated;
    capped = cont.capped;
  }

  // Skip the critic when the build is still incomplete (changed nothing, or still capped after auto-
  // continue) — reviewing it would emit a misleading "✓ ผ่าน". The user already saw the "ทำต่อ" nudge.
  if (isCodegen && mutated && !capped && !args.skipCritic) {
    const c = await runOpenAiCriticGate(client, cfg, args);
    criticIssues = c.issues;
    criticStatus = c.criticStatus;
    inputTokens += c.inputTokens;
    outputTokens += c.outputTokens;
    cacheReadTokens += c.cacheReadTokens;
    cacheCreationTokens += c.cacheCreationTokens;
  }
  return { inputTokens, outputTokens, cacheReadTokens, cacheCreationTokens, criticIssues, criticStatus };
}
