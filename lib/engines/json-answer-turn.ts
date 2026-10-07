import { createHash } from "node:crypto";
import { cameraAllowedFor } from "@/lib/premium/camera-gate";
import { mkdir, writeFile as fsWriteFile } from "node:fs/promises";
import { join } from "node:path";
import { executeEgsTool, type Emit } from "@/lib/anthropic-agent";
import type { AttachedImage } from "@/lib/chat-images";
import { getFiles } from "@/lib/files";
import { validateGasFiles } from "@/lib/gas-codegen";
import { answerToToolCalls, parseCodexAnswer, renderProjectFiles } from "@/lib/engines/codex-answer";
import { imagesDir } from "@/lib/local/paths";
import { buildSystemPromptParts, buildTurnContext } from "@/lib/rulebook/context";
import { lintScope } from "@/lib/import";
import type { EgsProject } from "@/types/db";

/**
 * What the "pure model" subscription engines share (Codex, Muse Code): the CLI is given no tool at
 * all, the app sends the project's files and the matching rule cards in the message, the CLI answers
 * with ONE JSON object (lib/engines/codex-answer.ts), and the app applies the changes itself through
 * the same path checks and lint as the API engines (executeEgsTool).
 */

const MAX_PROJECT_BYTES = 600_000;

/** Tells the model how to answer in this mode. `name` is the CLI's product name. */
export const jsonAnswerAdapter = (name: string): string => `

## Engine adapter (${name}) — overrides the tool instructions above
You have NO tools in this mode: no file access, no shell, no web. Everything you need is in the user's message: the project's current files under "=== <path> ===" headers (that is the only copy you can see) and the rule cards that apply.
Answer with ONE JSON object — the schema is enforced:
- reply: a short Thai message to the user (what you did, what is next). Never paste code into reply.
- ops: the file changes. write_file → {"op":"write","path":"Code.gs","content":"<the complete file>"}; edit_file → {"op":"edit","path":"Index.html","old":"<exact text that occurs once>","new":"<replacement>"}; delete_file → {"op":"delete","path":"Old.gs"}. Fields an op does not use are "". Paths are plain file names such as Code.gs, Index.html, appsscript.json.
- For a new build, write every file completely. For small changes to existing files, prefer edit; old must match the file in the message exactly.
- spec: propose_spec → fill spec and leave ops EMPTY in that turn. When not proposing a spec: title "" and empty lists.
- preference: save_preference → see "Look & feel". lesson: propose_lesson → see "Lessons". Leave them as empty strings when unused.
- read_project and read_rule are not needed: the files and the cards are already in the message.`;

export const fingerprint = (text: string): string => createHash("sha256").update(text, "utf8").digest("hex").slice(0, 16);

/** The instructions in two parts, as for Claude Code: fixed (core + adapter) and settings. */
export async function instructionsFor(project: EgsProject, adapter: string) {
  const parts = await buildSystemPromptParts(project, { via: "inline" }, { via: "json" }, { via: "json" });
  const fixed = parts.core + adapter;
  return { fixed, settings: parts.prefs, told: { core: fingerprint(fixed), prefs: fingerprint(parts.prefs) } };
}

/** Folder for the images attached to the turn in flight; `engine` keeps two engines' files apart. */
export const turnImagesDir = (projectId: string, engine: string): string => join(imagesDir(projectId), `${engine}-turn`);

export async function stageImages(projectId: string, engine: string, images: AttachedImage[]): Promise<string[]> {
  if (images.length === 0) return [];
  const dir = turnImagesDir(projectId, engine);
  await mkdir(dir, { recursive: true });
  const stamp = Date.now();
  return Promise.all(
    images.map(async (img, i) => {
      const ext = img.mediaType.split("/")[1] ?? "png";
      const file = join(dir, `${stamp}-${i}.${ext === "jpeg" ? "jpg" : ext}`);
      await fsWriteFile(file, Buffer.from(img.dataBase64, "base64"));
      return file;
    }),
  );
}

/** Apply an answer through the app's own tools. Returns the problems to send back for a repair. */
export async function applyAnswer(projectId: string, answerText: string, emit: Emit): Promise<{ reply: string; problems: string[] }> {
  const answer = parseCodexAnswer(answerText);
  const problems: string[] = [];
  for (const call of answerToToolCalls(answer)) {
    emit({ type: "tool_call", name: call.name, input: call.name.endsWith("_file") ? { path: call.input.path } : {} });
    const outcome = await executeEgsTool(projectId, call.name, call.input, emit);
    // spec / preference / lesson results are for the model, not problems to repair
    if (outcome.isError && call.name.endsWith("_file")) problems.push(`${String(call.input.path)}: ${outcome.content}`);
  }
  return { reply: answer.reply, problems };
}

export async function projectLintErrors(project: EgsProject): Promise<string[]> {
  const files = await getFiles(project.id);
  if (files.length === 0) return [];
  const lint = validateGasFiles(files.map((f) => ({ name: f.path, content: f.content })), { isWebApp: project.kind !== "bound", allowCamera: cameraAllowedFor(project) });
  const inScope = await lintScope(project);
  return lint.errors.filter((i) => inScope(i.file)).map((i) => `${i.file}: ${i.message}`);
}

/** The message for one turn: settings notice, rule cards + lessons, the files, then the request. */
export async function buildTurnPrompt(
  project: EgsProject,
  request: string,
  notice: string,
  images: string[],
  engineName: string,
): Promise<string> {
  const files = await getFiles(project.id);
  const size = files.reduce((n, f) => n + Buffer.byteLength(f.content, "utf8"), 0);
  if (size > MAX_PROJECT_BYTES) {
    throw new Error(`โปรเจกต์ใหญ่เกินกว่าที่โหมด ${engineName} ส่งให้ AI ได้ในหนึ่งรอบ ใช้โหมด Claude Code หรือ API key แทน`);
  }
  const context = await buildTurnContext({ project, userMessage: request, hasFiles: files.length > 0, access: { via: "inline" }, inline: true })
    .then((c) => c.text)
    .catch((e) => {
      console.error(`[${engineName}] rule-card context failed (non-fatal):`, e);
      return "";
    });
  const imageNote = images.length ? `\n\n(ผู้ใช้แนบรูปอ้างอิง ${images.length} รูป มาพร้อมข้อความนี้)` : "";
  return [notice, context, renderProjectFiles(files.map((f) => ({ path: f.path, content: f.content }))), `---\n${request}${imageNote}`]
    .filter(Boolean)
    .join("\n\n");
}
