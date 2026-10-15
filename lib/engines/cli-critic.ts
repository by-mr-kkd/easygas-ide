import type { CliEngine } from "@/lib/ai-choice";
import type { Emit } from "@/lib/anthropic-agent";
import { reviewProjectWithCli } from "@/lib/engines/cli-review";
import { getAppSetting } from "@/lib/settings";
import { appendMessages } from "@/lib/messages";
import type { EgsProject } from "@/types/db";

/**
 * Gate 1 for the CLI engines — the rulebook critic + one bounded auto-repair, the same gate the API loops run
 * inside every build turn (lib/anthropic-agent runCriticGate). A big build makes the AI forget some of the rule
 * cards it was given, like any coding session; so after a turn that CHANGED files the app asks the same CLI to
 * read the project again against the rulebook (one request of the user's plan), feeds what it found back into the
 * session as a repair turn, and reviews once more to say what really got fixed. The outcome lines are streamed
 * and kept in the chat history (a phone or a reloaded page sees them too).
 *
 * Settings → AI "ตรวจซ้ำตามกฎอัตโนมัติ" (settings.app[AUTO_CRITIC_KEY] = "off") switches it off; the manual
 * "ตรวจหาบั๊ก" / "ให้ AI ตรวจซ้ำ" buttons stay either way.
 */

export const AUTO_CRITIC_KEY = "auto_critic";

export const autoCriticEnabled = async (): Promise<boolean> => (await getAppSetting(AUTO_CRITIC_KEY)) !== "off";

export type CliCriticOutcome = { criticIssues: number; criticStatus: string | null };

export async function runCliCriticGate(opts: {
  projectId: string;
  project: EgsProject;
  engine: CliEngine;
  model?: string;
  emit: Emit;
  /** the turn (and its lint repair) changed files — a pure answer never gets reviewed */
  mutated: boolean;
  /** one repair turn in the engine's own session; resolves when its edits have landed */
  repair: (request: string) => Promise<void>;
}): Promise<CliCriticOutcome> {
  const { projectId, emit } = opts;
  if (!opts.mutated || !(await autoCriticEnabled())) return { criticIssues: 0, criticStatus: null };
  const said: string[] = [];
  const say = (text: string) => {
    said.push(text);
    emit({ type: "text", delta: `\n\n${text}` });
  };
  const keep = async () => {
    if (said.length) await appendMessages(projectId, [{ role: "assistant", content: said.join("\n\n") }]).catch(() => {});
  };
  try {
    say("เขียนโค้ดเสร็จแล้ว · ส่งตรวจซ้ำตามกฎ GAS best practices ก่อนใช้งานจริง…");
    emit({ type: "status", text: "กำลังตรวจซ้ำตามกฎ GAS best practices…" });
    const review = await reviewProjectWithCli(opts.project, opts.engine, opts.model, "check");
    if (review.degraded) {
      say("⚠️ ตรวจคุณภาพอัตโนมัติไม่สมบูรณ์รอบนี้ (อ่านผลตรวจไม่ได้) — กดปุ่ม “ตรวจหาบั๊ก” ได้ ไม่กระทบโค้ด");
      await keep();
      return { criticIssues: 0, criticStatus: "degraded" };
    }
    if (review.issues.length === 0) {
      say("✓ ตรวจซ้ำตามกฎ GAS best practices — ผ่าน");
      await keep();
      return { criticIssues: 0, criticStatus: "clean" };
    }
    say(`🔍 ตรวจซ้ำตามกฎพบ ${review.issues.length} จุด:\n${review.issues.map((i) => `- [${i.severity}] ${i.file}: ${i.problem} → ${i.fix}`).join("\n")}`);
    const actionable = review.issues.filter((i) => i.severity !== "low");
    if (actionable.length === 0) {
      await keep();
      return { criticIssues: review.issues.length, criticStatus: "issues" };
    }

    emit({ type: "status", text: "กำลังแก้ตามผลตรวจ…" });
    const request =
      "ตรวจซ้ำตามกฎ GAS best practices แล้วพบปัญหาต่อไปนี้ แก้ไฟล์ที่เกี่ยวข้องให้เรียบร้อย:\n" +
      actionable.map((i) => `- ${i.file}: ${i.problem} — แนวทาง: ${i.fix}`).join("\n");
    await opts.repair(request);

    // review once more to report what really got fixed — never just assert "แก้แล้ว"; what is left is LISTED, so the
    // user sees it and the next turn's recap carries it to the session ("แก้ต่อ" then means something)
    let left: { file: string; problem: string; fix: string }[] | null = null;
    try {
      const after = await reviewProjectWithCli(opts.project, opts.engine, opts.model, "check");
      if (!after.degraded) left = after.issues.filter((i) => i.severity !== "low");
    } catch (e) {
      console.error(`[${opts.engine}] post-repair re-review failed (non-fatal):`, e);
    }
    if (left === null) say(`✓ แก้ตามผลตรวจแล้ว ${actionable.length} จุด (ตรวจซ้ำรอบสุดท้ายไม่สำเร็จ กด “ตรวจหาบั๊ก” ยืนยันได้)`);
    else if (left.length === 0) say("✓ แก้ตามผลตรวจแล้ว (ครบทุกจุด)");
    else {
      const fixed = Math.max(0, actionable.length - left.length);
      say(`✓ แก้แล้ว ${fixed}/${actionable.length} จุด — ยังเหลือ ${left.length} จุด:\n${left.map((i) => `- ${i.file}: ${i.problem} → ${i.fix}`).join("\n")}\nพิมพ์ “แก้ต่อ” ให้แก้ข้อที่เหลือได้ครับ`);
    }
    await keep();
    return { criticIssues: review.issues.length, criticStatus: "issues" };
  } catch (e) {
    // a skipped review is NOT a clean pass: say so, no ✓
    console.error(`[${opts.engine}] critic gate failed (non-fatal):`, e);
    say("⚠️ ข้ามการตรวจซ้ำอัตโนมัติรอบนี้ (ระบบตรวจไม่พร้อม) — กดปุ่ม “ตรวจหาบั๊ก” ได้ ไม่กระทบโค้ด");
    await keep();
    return { criticIssues: 0, criticStatus: "skipped" };
  }
}
