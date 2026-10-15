import { NextResponse, type NextRequest } from "next/server";
import { acquireProjectRun, noteRunStatus, releaseProjectRun } from "@/lib/agent-lock";
import { runAgentLoop, type AgentEvent, type AgentRunResult, type Emit } from "@/lib/anthropic-agent";
import { sanitizeChoice, type AiChoice } from "@/lib/ai-choice";
import { apiProviderLock, resolveChoice } from "@/lib/ai-options";
import { parseAttachedImages, storeChatImages, type AttachedImage } from "@/lib/chat-images";
import { runClaudeCliTurn } from "@/lib/engines/claude-cli";
import { runCodexCliTurn } from "@/lib/engines/codex-cli";
import { runMuseCliTurn } from "@/lib/engines/muse-cli";
import { buildAllowed, setPlanOnly } from "@/lib/build-gate";
import { getFiles } from "@/lib/files";
import { finishTurnLessons, noteWrittenFile } from "@/lib/lessons-store";
import { getDefaultProvider, providerConfig, resolveProvider } from "@/lib/llm/provider";
import { runOpenAiAgentLoop } from "@/lib/openai-agent";
import { cameraGateFor, stripCameraClaims, type CameraGateResult } from "@/lib/premium/camera-gate";
import { getProject, updateProject } from "@/lib/projects";
import { turnNotice } from "@/lib/remote/notice";
import { notifyTurnEnd, remoteDeviceOf } from "@/lib/remote/turn-notify";
import { getSettings } from "@/lib/settings";
import { snapshotProject } from "@/lib/versions";
import { describeImages } from "@/lib/vision-proxy";
import type { EgsProject } from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 900;

/**
 * Turn a thrown agent/provider error into a short, user-facing reason so the chat shows WHY a turn
 * failed. Strips anything secret-looking and bounds the length; the full error is in the server log.
 */
function agentErrorMessage(e: unknown, secrets: string[]): string {
  const status = (e as { status?: number } | null)?.status;
  let detail = e instanceof Error ? e.message : String(e);
  for (const s of secrets) if (s.length >= 8) detail = detail.split(s).join("[redacted]");
  detail = detail
    .replace(/sk-[A-Za-z0-9_-]{8,}/g, "[redacted]")
    .replace(/AIza[\w-]{20,}/g, "[redacted]")
    .replace(/([?&](?:key|api_key|token)=)[^&\s]+/gi, "$1[redacted]")
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/\s+/g, " ")
    .trim();
  if (detail.length > 240) detail = detail.slice(0, 240) + "…";
  // a 404 from an API provider is nearly always a model id this key may not use (retired, renamed, not
  // offered to new keys) — say what to do instead of a bare "404 status code"
  // Google answers errors as a JSON array the OpenAI SDK cannot read, so its message is a bare "429 status
  // code (no body)": the status alone has to say what happened
  if (status === 429) {
    return "ระบบขัดข้อง: ใช้ API key นี้ถี่เกินหรือโควตาหมดแล้ว (429) ถ้าเป็นแบบฟรี บางเจ้าจำกัดจำนวนครั้งต่อวัน และการสร้างระบบหนึ่งครั้งเรียกหลายรอบ รอให้โควตาคืน เลือกโมเดลอื่นที่ปุ่มเลือก AI หรือเปิดการจ่ายเงินในบัญชีผู้ให้บริการ";
  }
  if (status === 503 || status === 529) {
    return "ระบบขัดข้อง: ผู้ให้บริการ AI มีคนใช้เยอะในตอนนี้ ลองส่งใหม่อีกสักครู่ หรือเลือกโมเดลอื่น";
  }
  if (status === 401 || status === 403) {
    return "ระบบขัดข้อง: ผู้ให้บริการไม่รับ API key นี้ (key ผิด ถูกลบ หรือยังไม่ได้เปิดสิทธิ์) ตรวจ key ที่ ตั้งค่า → AI";
  }
  if (status === 404) {
    return "ระบบขัดข้อง: ผู้ให้บริการไม่พบโมเดลที่เลือก (404) โมเดลนี้อาจเลิกให้บริการแล้ว หรือ API key นี้ใช้ไม่ได้ กดปุ่มเลือก AI ในช่องพิมพ์ แล้วเลือกโมเดลที่มีป้าย “แนะนำ” หรือ “ค่าเริ่มต้น”";
  }
  const head = typeof status === "number" ? `[${status}] ` : "";
  return detail ? `ระบบขัดข้อง: ${head}${detail}` : "ระบบขัดข้อง ลองใหม่อีกครั้ง";
}

type PreparedRun = (emit: Emit) => Promise<AgentRunResult>;

/** API engine: the user's own key for the picked provider and model. An error + reason when unusable. */
async function prepareApiRun(
  project: EgsProject,
  choice: AiChoice,
  message: string,
  images: AttachedImage[],
): Promise<PreparedRun | { error: string }> {
  const provider = choice.provider ?? (await getDefaultProvider());
  // tool traffic in the history can only be replayed in the wire format that wrote it
  const lock = await apiProviderLock(project);
  if (lock && lock !== provider) {
    return {
      error:
        `โปรเจกต์นี้มีประวัติแชตในรูปแบบของ ${providerConfig(lock).label} จึงต่อด้วย API ของ ${providerConfig(provider).label} ไม่ได้ ` +
        `เลือก ${providerConfig(lock).label} หรือ AI แบบสมาชิกรายเดือนแทน`,
    };
  }
  const cfg = await resolveProvider(provider, { wanted: choice.model });
  const apiKey = cfg.apiKey;
  if (!apiKey) return { error: `ยังไม่ได้ใส่ API key ของ ${cfg.label} ไปที่หน้า ตั้งค่า แล้วใส่คีย์ของคุณ` };
  if (project.llm_provider !== provider) await updateProject(project.id, { llm_provider: provider });

  // Vision proxy: describe attached images as text and keep it in the message, so later turns (and
  // text-only providers) can still refer to "รูปด้านบน" without re-attaching.
  let userMessage = message;
  if (images.length > 0) {
    const described = await describeImages(images, message);
    if (described) {
      userMessage += `\n\n[คำบรรยายรูปที่ผู้ใช้แนบ เก็บเป็นข้อความไว้ให้อ้างอิง "รูปด้านบน" ในเทิร์นถัดไปได้ด้วย]\n${described}`;
    } else if (!cfg.vision) {
      userMessage += "\n\n(ผู้ใช้แนบรูปมา แต่ระบบอ่านรูปไม่ได้ตอนนี้ ตอบผู้ใช้อย่างสุภาพให้พิมพ์อธิบายรูปเป็นข้อความ)";
    }
  }

  return (emit) => {
    // the app's default model is gone for this key: say which one answers instead (lib/llm/model-pick)
    if (cfg.replacedModel) emit({ type: "status", text: `${cfg.label} เลิกให้ใช้ ${cfg.replacedModel} แล้ว ใช้ ${cfg.model} แทน` });
    // Claude keeps its own codegen/plan routing unless the model was picked or had to be replaced
    const claudeModel = choice.model || (cfg.replacedModel ? cfg.model : undefined);
    return provider === "claude"
      ? runAgentLoop({ projectId: project.id, project, userMessage, images, apiKey, model: claudeModel, emit })
      : runOpenAiAgentLoop({ projectId: project.id, project, userMessage, images, emit }, { ...cfg, apiKey });
  };
}

function prepareRun(
  choice: AiChoice,
  project: EgsProject,
  message: string,
  images: AttachedImage[],
): Promise<PreparedRun | { error: string }> | PreparedRun | { error: string } {
  const turn = { projectId: project.id, project, userMessage: message, images, model: choice.model };
  switch (choice.engine) {
    case "claude-cli":
      return (emit) => runClaudeCliTurn({ ...turn, emit });
    case "codex-cli":
      return (emit) => runCodexCliTurn({ ...turn, emit });
    case "muse-cli":
      return (emit) => runMuseCliTurn({ ...turn, emit });
    default:
      return prepareApiRun(project, choice, message, images);
  }
}

/** One line for the status bar from a tool call, the same words the chat shows (ChatPanel TOOL_LABEL). */
function toolStatus(name: string, input: unknown): string {
  const path = input && typeof input === "object" ? (input as { path?: unknown }).path : undefined;
  const label = TOOL_STATUS[name] ?? name;
  return typeof path === "string" && path ? `${label} ${path}…` : `${label}…`;
}
const TOOL_STATUS: Record<string, string> = {
  write_file: "กำลังเขียนไฟล์",
  edit_file: "กำลังแก้ไฟล์",
  delete_file: "กำลังลบไฟล์",
  read_project: "กำลังอ่านโปรเจกต์",
  read_rule: "กำลังอ่านกฎ",
  save_preference: "กำลังบันทึกสิ่งที่คุณเลือก",
  propose_lesson: "กำลังเสนอบทเรียน",
};

/**
 * POST /api/agent/[id]  body: { message: string, images?: [...], ai?: { engine, provider?, model? }, build?: true }
 * `build` = the user pressed an app button that starts the build (lib/build-gate): a project with no code
 * stays talk-only (no file writes) until that, or a typed "สร้างเลย".
 * `ai` is the pick from the chat's AI switcher for this message; without it the project's last pick
 * (then Settings) is used. The pick is remembered on the project.
 * Streams the agent turn as SSE (text deltas, tool_call, file_mutation, lint, done).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  let project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  let message = "";
  let images: AttachedImage[] = [];
  let requested: AiChoice | null = null;
  let go = false;
  try {
    const body = (await req.json()) as { message?: string; images?: unknown; ai?: unknown; build?: unknown };
    go = body.build === true;
    // only the app may add the camera override heading (lib/premium/camera-gate)
    message = stripCameraClaims((body.message ?? "").trim());
    images = parseAttachedImages(body.images);
    requested = sanitizeChoice(body.ai);
  } catch {
    /* empty body */
  }
  if (!message && images.length === 0) return NextResponse.json({ error: "empty_message" }, { status: 400 });
  if (!message && images.length > 0) message = "ดูรูปอ้างอิงที่แนบมา แล้วออกแบบ/ปรับหน้าตาให้ใกล้เคียงรูป";

  // one agent run per project at a time (prevents interleaved file writes)
  const lock = await acquireProjectRun(id);
  if (!lock)
    return NextResponse.json(
      { error: "already_running", message: "โปรเจกต์นี้กำลังประมวลผลอยู่ รอให้เสร็จก่อนสักครู่นะครับ" },
      { status: 409 },
    );

  let run: PreparedRun;
  let cameraGate: CameraGateResult = { gate: "off", intent: false };
  let cameraGateFirst = false;
  try {
    const choice = await resolveChoice(project, requested);
    // premium camera gate (lib/premium/camera-gate): decided once here so the chat card and the hosting
    // flag agree; the engines recompute the same result inside buildTurnContext for the turn message.
    // A project that may build camera features is marked for GitHub Pages hosting before the AI runs.
    cameraGate = await cameraGateFor(project, message);
    const switchHosting = cameraGate.gate === "allowed" && project.hosting !== "github";
    // remembered for the next message, the re-check and the after-publish repair (which all follow it)
    project = await updateProject(id, switchHosting ? { ai: choice, hosting: "github" } : { ai: choice });
    cameraGateFirst = switchHosting;
    const prepared = await prepareRun(choice, project, message, images);
    if ("error" in prepared) {
      await releaseProjectRun(id, lock);
      return NextResponse.json({ error: "engine_not_configured", message: prepared.error }, { status: 400 });
    }
    run = prepared;
  } catch (e) {
    await releaseProjectRun(id, lock);
    throw e;
  }
  if (images.length > 0) await storeChatImages(id, images);
  // no code yet and no approval → this turn may talk but not write (every engine checks isPlanOnly)
  const planOnly = !buildAllowed({ hasCode: (await getFiles(id).catch(() => [])).length > 0, go, message });
  setPlanOnly(id, planOnly);

  const encoder = new TextEncoder();
  let closed = false; // flipped by cancel() on client disconnect, and in finally
  // Pro: the phone that sent this message hears how it ended (lib/remote/turn-notify)
  const phone = remoteDeviceOf(req.headers);
  let said = "";
  let failed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (ev: AgentEvent) => {
        // which files the AI touched this turn — lint is only "the AI's mistake" in those (lib/lessons)
        if (ev.type === "file_mutation" && ev.op !== "delete") noteWrittenFile(id, ev.path);
        if (phone && ev.type === "text" && said.length < 20_000) said += ev.delta;
        // the same line for a page that did not start this turn (a phone, another tab — /api/run-status)
        if (ev.type === "status") noteRunStatus(id, ev.text);
        else if (ev.type === "tool_call") noteRunStatus(id, toolStatus(ev.name, ev.input));
        else if (ev.type === "file_mutation") noteRunStatus(id, `${ev.op === "delete" ? "ลบไฟล์" : "บันทึกไฟล์"} ${ev.path}`);
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          // client went away mid-stream — let the turn RUN TO COMPLETION so files + history persist
          closed = true;
        }
      };
      try {
        if (cameraGate.gate !== "off") emit({ type: "camera_gate", gate: cameraGate.gate, first: cameraGateFirst });
        const r = await run(emit);
        await snapshotProject(id, "ai"); // version the AI's output (dedupes when nothing changed)
        // lessons to OFFER the user: nothing is in use until they press "เก็บไว้"
        for (const l of await finishTurnLessons(id, project)) {
          emit({ type: "lesson", lesson: l });
        }
        emit({ type: "done", tokens: r.inputTokens + r.outputTokens });
      } catch (e) {
        console.error("[agent] turn error:", e);
        // a failed turn may still have written files — version them so the user can roll back
        await snapshotProject(id, "ai");
        await finishTurnLessons(id, project); // close the bookkeeping (nothing is offered after a failure)
        const secrets = Object.values((await getSettings()).keys).filter((k): k is string => !!k);
        failed = true;
        emit({ type: "error", message: agentErrorMessage(e, secrets) });
        emit({ type: "done" });
      } finally {
        setPlanOnly(id, false);
        await releaseProjectRun(id, lock);
        notifyTurnEnd(phone, id, turnNotice(project.name, said, failed));
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed by the client's cancel() */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
    },
  });
}
