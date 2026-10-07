import { apiProviderLock, resolveChoice } from "@/lib/ai-options";
import { NextResponse, type NextRequest } from "next/server";
import { acquireProjectRun, releaseProjectRun } from "@/lib/agent-lock";
import { runAgentLoop, type AgentEvent, type AgentRunResult, type RunAgentArgs } from "@/lib/anthropic-agent";
import { deployProject } from "@/lib/deploy";
import { runClaudeCliTurn } from "@/lib/engines/claude-cli";
import { runCodexCliTurn } from "@/lib/engines/codex-cli";
import { runMuseCliTurn } from "@/lib/engines/muse-cli";
import { NotConnectedError, UserSettingsDisabledError } from "@/lib/errors";
import { probeExec } from "@/lib/gas-verify";
import { finishTurnLessons, noteWrittenFile } from "@/lib/lessons-store";
import { resolveProjectProvider, resolveProvider, resolveRepairProvider } from "@/lib/llm/provider";
import { runOpenAiAgentLoop } from "@/lib/openai-agent";
import { getCurrentUser, getProject } from "@/lib/projects";
import { snapshotProject } from "@/lib/versions";
import type { EgsProject } from "@/types/db";

export const runtime = "nodejs";
export const maxDuration = 900;

const MAX_REPAIRS = 2; // bound the run-and-repair loop (unbounded loops "fix" by deleting)

const repairPrompt = (error: string) =>
  `ตอนเปิดใช้งานจริง (deploy แล้ว) แอปขึ้นปัญหานี้:\n${error}\n\n` +
  `ช่วยหาสาเหตุแล้วแก้ไฟล์ที่เกี่ยวข้องให้รันได้จริง (อ่านโปรเจกต์ก่อนถ้าจำเป็น) แก้ให้เลย ไม่ต้องอธิบายยาว`;

type Repair = (base: Omit<RunAgentArgs, "apiKey">) => Promise<AgentRunResult>;

/** Build the repair runner for the AI picked in this project's chat, or an error message when it can't run. */
async function prepareRepair(project: EgsProject, userId: string): Promise<Repair | { error: string }> {
  const choice = await resolveChoice(project, null);
  if (choice.engine === "claude-cli") {
    return async (base) =>
      runClaudeCliTurn({
        projectId: base.projectId,
        project: (await getProject(base.projectId)) ?? project,
        userMessage: base.userMessage,
        images: [],
        model: choice.model,
        emit: base.emit,
      });
  }
  if (choice.engine === "codex-cli") {
    return async (base) =>
      runCodexCliTurn({
        projectId: base.projectId,
        project: (await getProject(base.projectId)) ?? project,
        userMessage: base.userMessage,
        images: [],
        model: choice.model,
        emit: base.emit,
      });
  }

  if (choice.engine === "muse-cli") {
    return async (base) =>
      runMuseCliTurn({
        projectId: base.projectId,
        project: (await getProject(base.projectId)) ?? project,
        userMessage: base.userMessage,
        images: [],
        model: choice.model,
        emit: base.emit,
      });
  }

  const projectProvider = (await apiProviderLock(project)) ?? choice.provider ?? (await resolveProjectProvider(project.id, userId));
  const ownCfg = await resolveProvider(projectProvider);
  const ownKey = ownCfg.apiKey;
  if (!ownKey) return { error: `ยังไม่ได้ใส่ API key ของ ${ownCfg.label} ไปที่หน้า ตั้งค่า แล้วใส่คีย์ของคุณ` };

  const runOwn = (base: Omit<RunAgentArgs, "apiKey">) =>
    projectProvider === "claude"
      ? runAgentLoop({ ...base, apiKey: ownKey })
      : runOpenAiAgentLoop(base, { ...ownCfg, apiKey: ownKey });

  // Optional escalation (settings.app.repair_provider) for OpenAI-family projects; falls back to the
  // project's own provider at run time so a failing escalated call never dead-ends the repair.
  const repairProvider = await resolveRepairProvider(projectProvider);
  if (repairProvider === projectProvider) return runOwn;
  const base = await resolveProvider(repairProvider);
  const repairCfg = { ...base, reasoning: base.reasoning || /glm-5|v4-pro|reasoner/i.test(base.model) };
  return (args) =>
    runOpenAiAgentLoop({ ...args, stripHistoryReasoning: true }, { ...repairCfg, apiKey: base.apiKey }).catch((e) => {
      console.error("[verify] escalated repair failed — falling back to the project provider:", e);
      args.emit({ type: "status", text: "สลับไปซ่อมด้วยโมเดลเดิม…" });
      return runOwn(args);
    });
}

/**
 * POST /api/verify/[id] — Gate 2 (run-and-repair), the "ทดสอบรันจริง / ซ่อมให้" button. Probes the
 * live /exec; on a runtime failure it repairs with the active engine and re-deploys (same URL), up to
 * MAX_REPAIRS times. Streams SSE like /api/agent.
 */
export async function POST(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const user = await getCurrentUser();
  const project = await getProject(id);
  if (!project) return NextResponse.json({ error: "not_found" }, { status: 404 });

  const lock = await acquireProjectRun(id);
  if (!lock)
    return NextResponse.json(
      { error: "already_running", message: "โปรเจกต์นี้กำลังประมวลผลอยู่ รอให้เสร็จก่อนนะครับ" },
      { status: 409 },
    );

  let repair: Repair;
  try {
    const prepared = await prepareRepair(project, user.id);
    if ("error" in prepared) {
      await releaseProjectRun(id, lock);
      return NextResponse.json({ error: "engine_not_configured", message: prepared.error }, { status: 400 });
    }
    repair = prepared;
  } catch (e) {
    await releaseProjectRun(id, lock);
    throw e;
  }

  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream({
    async start(controller) {
      const emit = (ev: AgentEvent) => {
        if (ev.type === "file_mutation" && ev.op !== "delete") noteWrittenFile(id, ev.path);
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(ev)}\n\n`));
        } catch {
          closed = true; // client left — let the repair loop finish
        }
      };

      let tokens = 0;
      try {
        let url = (await getProject(id))?.deployment?.exec_url ?? null;
        if (!url) {
          emit({
            type: "text",
            delta: '\n\nยังไม่ได้เผยแพร่โปรเจกต์นี้ กดปุ่ม "เผยแพร่" มุมขวาบนก่อน แล้วค่อยกดทดสอบรันจริงอีกครั้ง',
          });
          emit({ type: "done" });
          return;
        }

        for (let i = 0; i <= MAX_REPAIRS; i++) {
          emit({ type: "status", text: "กำลังเปิดแอปเพื่อทดสอบการรันจริง…" });
          const probe = await probeExec(url);
          if (probe.ok) {
            emit({
              type: "verdict",
              ok: true,
              text: "หน้าแอปเปิดได้ ✓ (ทดสอบเฉพาะการเปิดหน้า ปุ่ม/การบันทึกข้อมูลยังไม่ได้ทดสอบ) ลองกดใช้งานจริงดูอีกที",
            });
            break;
          }
          // infra failure (timeout / network / deleted deployment) is NOT a code bug — never repair it
          if (probe.infraError) {
            emit({ type: "text", delta: `\n\n⏳ ${probe.error}` });
            emit({
              type: "text",
              delta: '\n\nไม่ใช่ปัญหาโค้ด แอปอาจเพิ่งเย็นเครื่องหรือช้า รอสักครู่แล้วกด "ทดสอบรันจริง" อีกครั้งครับ',
            });
            break;
          }
          if (probe.authRequired) {
            emit({ type: "text", delta: `\n\n🔐 ${probe.error}` });
            emit({
              type: "text",
              delta: '\n\nเปิดแอปของคุณ 1 ครั้ง กด Review permissions → Advanced → Allow (อนุญาตครั้งเดียว) แล้วค่อยกด "ทดสอบรันจริง" อีกที',
            });
            break;
          }
          emit({ type: "text", delta: `\n\n🔧 พบปัญหาตอนรันจริง:\n${probe.error ?? "(ไม่ทราบสาเหตุ)"}` });
          if (i === MAX_REPAIRS) {
            emit({
              type: "text",
              delta: '\n\nยังแก้ไม่หมดในรอบนี้ กด "ทดสอบรันจริง" อีกครั้ง หรือพิมพ์บอกรายละเอียดเพิ่มได้ครับ',
            });
            break;
          }
          emit({ type: "status", text: "กำลังแก้แล้วเผยแพร่ใหม่ (ลิงก์เดิม)…" });
          const r = await repair({
            projectId: id,
            project,
            userMessage: repairPrompt(probe.error ?? "เปิดแอปแล้วไม่ทำงาน"),
            turn: "codegen",
            internal: true,
            skipCritic: true, // the live run is the stronger oracle
            emit,
          });
          tokens += r.inputTokens + r.outputTokens;
          const fresh = (await getProject(id)) ?? project;
          const dep = await deployProject(user.id, fresh); // same deployment → same /exec URL
          url = dep.execUrl ?? url;
          if (!dep.unchanged) await snapshotProject(id, "deploy", { label: "auto-repair" });
        }
        emit({ type: "done", tokens });
      } catch (e) {
        console.error("[verify] loop error:", e);
        const msg =
          e instanceof NotConnectedError
            ? "ยังไม่ได้เชื่อมบัญชี Google ไปที่หน้า ตั้งค่า แล้วกด เชื่อมต่อ Google แล้วลองอีกครั้ง"
            : e instanceof UserSettingsDisabledError
              ? "ยังไม่ได้เปิด Apps Script API ให้บัญชีนี้ เปิดที่ https://script.google.com/home/usersettings แล้วลองอีกครั้ง"
              : "ทดสอบ/ซ่อมไม่สำเร็จ ลองใหม่อีกครั้งครับ";
        emit({ type: "text", delta: `\n\n⚠️ ${msg}` });
        emit({ type: "done" });
      } finally {
        // the repair loop is an agent turn too: close its lesson bookkeeping and offer what it proposed
        for (const l of await finishTurnLessons(id)) {
          emit({ type: "lesson", lesson: { id: l.id, rule: l.rule, symptom: l.symptom, card: l.card, hits: l.hits } });
        }
        await releaseProjectRun(id, lock);
        closed = true;
        try {
          controller.close();
        } catch {
          /* already closed */
        }
      }
    },
    cancel() {
      closed = true;
    },
  });

  return new Response(stream, {
    headers: { "Content-Type": "text/event-stream", "Cache-Control": "no-cache, no-transform", Connection: "keep-alive" },
  });
}
