/**
 * "ให้ AI สร้างรูป" for the share page and social posts: the AI picked in the chat makes a picture from a PROMPT the user
 * reviewed in the chat (lib/share/picture-prompt.ts writes it from their picks; they may edit it before sending).
 *
 * Two ways, chosen by what the pick can do:
 * - a pick with an image model gets a real picture: ChatGPT (gpt-image-1, the Images API) or Gemini (the image model
 *   through generateContent) on the user's own key, and Codex through its own image tool on the user's plan
 *   (lib/engines/codex-cli codexImage);
 * - every other pick (Claude Code, Muse Code, Anthropic / DeepSeek / Z.ai / Meta keys — and a Codex without the tool)
 *   DRAWS the picture as an SVG, which the browser turns into a JPEG (lib/client/svg-raster.ts) after
 *   lib/share/svg-picture.ts checked it. An image model that fails (no access to the model, a refused prompt) falls back
 *   to the drawing.
 *
 * When the prompt says the app is to be understood from the code (no description yet), a small excerpt of the project's
 * files rides along as context: names, texts and the shape of the UI are what matter, so the budget is small.
 */
import OpenAI from "openai";
import { isCliEngine, sanitizeChoice, aiName } from "@/lib/ai-choice";
import { resolveChoice } from "@/lib/ai-options";
import { codexImage, CodexImageUnsupported } from "@/lib/engines/codex-cli";
import { getFiles } from "@/lib/files";
import { providerWithKey } from "@/lib/llm/provider";
import { getProject } from "@/lib/projects";
import { askPicked } from "./describe";
import { ShareRefusal } from "./payload";
import { cleanPrompt, PICTURE_SIZES, type PictureSize } from "./picture-prompt";
import { checkSvg } from "./svg-picture";

export type SharePicture =
  | { kind: "image"; dataUrl: string; by: string; how: "image-model" }
  | { kind: "svg"; svg: string; width: number; height: number; by: string; how: "drawing" };

const PER_FILE = 3000;
const TOTAL = 16_000;

const SVG_SYSTEM = (w: number, h: number) => `คุณเป็นนักออกแบบกราฟิก วาดรูปตามคำสั่งเป็น SVG หนึ่งรูป
- ตอบเป็นโค้ด SVG อย่างเดียว เริ่มด้วย <svg และจบด้วย </svg> ไม่มีคำอธิบาย ไม่มี code fence
- ขนาด viewBox="0 0 ${w} ${h}" วาดให้เต็มกรอบ
- วาดด้วย rect circle ellipse path polygon text และ linearGradient/radialGradient เท่านั้น ใช้ font-family="sans-serif" (ถ้าคำสั่งขอฟอนต์แบบอื่น ให้สื่อด้วยน้ำหนักและรูปทรง) ข้อความภาษาไทยต้องมี font-size ไม่ต่ำกว่า ${Math.round(Math.min(w, h) / 22)}
- ห้าม <script> <style> <image> <foreignObject> animation หรือลิงก์ไปที่ใด ๆ ห้ามอ้างอิง URL ภายนอก (href ต้องขึ้นต้นด้วย # เท่านั้น)
- ห้ามใส่ชื่อคน อีเมล เบอร์โทร ID หรือคีย์ที่เห็นในโค้ด
- โค้ดไม่เกิน 60,000 ตัวอักษร`;

function filesBlock(files: { path: string; content: string }[]): string {
  let budget = TOTAL;
  const parts: string[] = [];
  const html = (p: string) => (/\.html$/i.test(p) ? 0 : 1);
  for (const f of files.filter((f) => /\.(html|gs|js)$/i.test(f.path)).sort((a, b) => html(a.path) - html(b.path))) {
    if (budget <= 0) break;
    const body = f.content.slice(0, Math.min(PER_FILE, budget));
    budget -= body.length;
    parts.push(`--- ${f.path}\n${body}${body.length < f.content.length ? "\n…(ตัด)" : ""}`);
  }
  return parts.join("\n\n");
}

/** gpt-image-1 takes three boxes; the browser crops the result to the size asked for. */
const gptSize = (w: number, h: number): "1024x1024" | "1536x1024" | "1024x1536" => (w === h ? "1024x1024" : w > h ? "1536x1024" : "1024x1536");

async function withImageModel(provider: string, prompt: string, w: number, h: number): Promise<string | null> {
  if (provider === "chatgpt") {
    const cfg = await providerWithKey("chatgpt");
    if (!cfg.apiKey) return null;
    const res = await new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL }).images.generate({ model: "gpt-image-1", prompt, n: 1, size: gptSize(w, h), quality: "medium" });
    const b64 = res.data?.[0]?.b64_json;
    return b64 ? `data:image/png;base64,${b64}` : null;
  }
  if (provider === "gemini") {
    const cfg = await providerWithKey("gemini");
    if (!cfg.apiKey) return null;
    const r = await fetch("https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent", {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": cfg.apiKey },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }], generationConfig: { responseModalities: ["IMAGE"] } }),
    });
    if (!r.ok) {
      console.warn(`[share-picture] gemini image ${r.status}: ${(await r.text()).slice(0, 200)}`);
      return null;
    }
    const j = (await r.json()) as { candidates?: { content?: { parts?: { inlineData?: { mimeType?: string; data?: string } }[] } }[] };
    const part = j.candidates?.[0]?.content?.parts?.find((p) => p.inlineData?.data);
    return part?.inlineData?.data ? `data:${part.inlineData.mimeType || "image/png"};base64,${part.inlineData.data}` : null;
  }
  return null;
}

/** One picture by the picked AI from the reviewed prompt. Throws ShareRefusal with a Thai line when nothing usable came back. */
export async function makeSharePicture(projectId: string, requested: unknown, input: { prompt: unknown; size: unknown; useCode?: unknown }): Promise<SharePicture> {
  const project = await getProject(projectId);
  if (!project) throw new ShareRefusal("ไม่พบโปรเจกต์");
  const prompt = cleanPrompt(input.prompt);
  if (!prompt) throw new ShareRefusal("พร้อมท์ว่าง เขียนหรือสร้างจากตัวเลือกก่อน");
  const sizeKey: PictureSize = typeof input.size === "string" && input.size in PICTURE_SIZES ? (input.size as PictureSize) : "cover";
  const { w, h, shape } = PICTURE_SIZES[sizeKey];
  const choice = await resolveChoice(project, sanitizeChoice(requested));
  const by = aiName(choice) ?? "AI";

  // the code as context only when the prompt asks for it (no description yet)
  let context = "";
  if (input.useCode === true) {
    const files = await getFiles(projectId);
    if (!files.length) throw new ShareRefusal("โปรเจกต์ยังไม่มีโค้ด ให้ AI สร้างก่อน");
    context = `\n\nโค้ดบางส่วนของระบบ (ดูว่าระบบทำอะไร หน้าตาเป็นอย่างไร):\n${filesBlock(files.map((f) => ({ path: f.path, content: f.content })))}`;
  }
  const modelPrompt = `${prompt}${context ? `\n\n(สรุปจากโค้ดต่อไปนี้ว่าระบบทำอะไร แล้ววาดตามนั้น)${context.slice(0, 6000)}` : ""}`;

  // a real image model when the pick has one; any failure there falls through to the drawing
  if (choice.engine === "codex-cli") {
    try {
      return { kind: "image", dataUrl: await codexImage(projectId, modelPrompt, choice.model), by, how: "image-model" };
    } catch (e) {
      if (e instanceof CodexImageUnsupported) console.warn("[share-picture] this Codex has no image tool, drawing instead");
      else console.warn("[share-picture] codex image failed, drawing instead:", e instanceof Error ? e.message : e);
    }
  }
  if (!isCliEngine(choice.engine) && (choice.provider === "chatgpt" || choice.provider === "gemini")) {
    try {
      const dataUrl = await withImageModel(choice.provider, `${modelPrompt}\n\nAspect ratio: ${shape}.`, w, h);
      if (dataUrl) return { kind: "image", dataUrl, by, how: "image-model" };
    } catch (e) {
      console.warn("[share-picture] image model failed, drawing instead:", e instanceof Error ? e.message : e);
    }
  }

  const user = `${prompt}${context}\n\nวาดรูปตามคำสั่งข้างบนเป็น SVG`;
  let text = await askPicked(project, SVG_SYSTEM(w, h), user, choice);
  let checked = checkSvg(text, { w, h });
  if (!checked.ok && checked.reason !== "no_svg") {
    // one more try naming what was wrong (a model that put in a <style> or an outside link usually fixes it)
    const why: Record<string, string> = {
      too_big: "โค้ดยาวเกินไป ลดรายละเอียดลงให้ไม่เกิน 60,000 ตัวอักษร",
      banned_tag: "ห้ามใช้ <script> <style> <image> <foreignObject> หรือ animation ใช้ rect circle path text linearGradient เท่านั้น",
      event_attr: "ห้ามมี attribute ที่ขึ้นต้นด้วย on",
      outside_ref: "ห้ามอ้างอิง URL ภายนอก href และ url() ต้องชี้ไปที่ # ในรูปเท่านั้น",
      entity: "ห้ามมี DOCTYPE หรือ ENTITY",
    };
    text = await askPicked(project, SVG_SYSTEM(w, h), `${user}\n\nรอบก่อนใช้ไม่ได้: ${why[checked.reason] ?? checked.reason} วาดใหม่ทั้งรูป`, choice);
    checked = checkSvg(text, { w, h });
  }
  if (!checked.ok) throw new ShareRefusal(checked.reason === "no_svg" ? "AI ไม่ได้ส่งรูปกลับมา ลองใหม่อีกครั้ง หรือถ่ายรูปหน้าจอแทน" : "รูปที่ AI วาดใช้ไม่ได้ ลองใหม่อีกครั้ง");
  return { kind: "svg", svg: checked.svg, width: w, height: h, by, how: "drawing" };
}
