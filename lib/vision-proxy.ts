import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import type { LlmProvider, ProviderConfig } from "@/lib/llm/catalog";
import { resolveProvider } from "@/lib/llm/provider";
import { getAppSetting } from "@/lib/settings";
import type { AttachedImage } from "@/lib/chat-images";

/**
 * Vision proxy. Text-only codegen arms (DeepSeek V4 — no native vision via API) can't read an
 * attached reference image, so a VISION arm describes it in Thai and we feed that text to the
 * codegen model. The describing arm is selectable (settings.app.vision_provider; default
 * Gemini — cheap + multimodal) and falls back to whichever vision arm actually has an API key.
 *
 * Server-only, best-effort: any failure returns null and the caller nudges the user to type a
 * description — a vision hiccup must never block the turn.
 */

const MAX_TOKENS = 1200;
// Cheap multimodal model for the Anthropic fallback (describing a mockup is a light one-shot call).
const ANTHROPIC_DESCRIBE_MODEL = "claude-haiku-4-5-20251001";
// vision-capable arms (must match catalog `vision: true`), in default-preference order.
const VISION_ARMS: LlmProvider[] = ["gemini", "chatgpt", "claude"];

type AnthropicMedia = "image/jpeg" | "image/png" | "image/gif" | "image/webp";

function describePrompt(n: number, userMessage: string): string {
  return (
    `ผู้ใช้แนบรูปอ้างอิง ${n} รูปเพื่อให้สร้างเครื่องมือ (มักเป็น mockup หน้าจอ/ฟอร์ม/ใบเอกสาร). ` +
    (userMessage ? `บริบทจากผู้ใช้: "${userMessage}". ` : "") +
    "บรรยายรูปแต่ละรูปอย่างละเอียดเชิงปฏิบัติเป็นภาษาไทย เพื่อให้ AI อีกตัวเอาไปสร้าง UI ได้ใกล้เคียง — " +
    "ระบุ: โครงหน้า/เลย์เอาต์, ฟิลด์และปุ่มทั้งหมด (พร้อมข้อความบนปุ่ม/ป้ายกำกับ), ตาราง+ชื่อคอลัมน์, " +
    "เมนู/แท็บ, โทนสีหลัก, และองค์ประกอบสำคัญอื่น ๆ. อย่าเดาเกินจากที่เห็นในรูป."
  );
}

/** Pick the describing arm: admin-set (vision_provider) first, else the first vision arm with a key. */
async function resolveVisionArm(): Promise<ProviderConfig | null> {
  const stored = (await getAppSetting("vision_provider")) as LlmProvider | null;
  const order = [...(stored && VISION_ARMS.includes(stored) ? [stored] : []), ...VISION_ARMS];
  for (const arm of order) {
    const cfg = await resolveProvider(arm);
    if (cfg.apiKey) return cfg;
  }
  return null;
}

/** Gemini / GPT-4o path (OpenAI wire format — image_url with a base64 data URL). */
async function describeWithOpenAI(
  cfg: ProviderConfig,
  images: AttachedImage[],
  userMessage: string,
): Promise<string | null> {
  const client = new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL });
  const res = await client.chat.completions.create({
    model: cfg.model,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: describePrompt(images.length, userMessage) },
          ...images.map((img) => ({
            type: "image_url" as const,
            image_url: { url: `data:${img.mediaType};base64,${img.dataBase64}` },
          })),
        ],
      },
    ],
  });
  return res.choices[0]?.message?.content?.trim() || null;
}

/** Claude fallback (Anthropic image blocks); uses cheap Haiku regardless of the arm's codegen model. */
async function describeWithAnthropic(
  cfg: ProviderConfig,
  images: AttachedImage[],
  userMessage: string,
): Promise<string | null> {
  const client = new Anthropic({ apiKey: cfg.apiKey });
  const msg = await client.messages.create({
    model: ANTHROPIC_DESCRIBE_MODEL,
    max_tokens: MAX_TOKENS,
    messages: [
      {
        role: "user",
        content: [
          { type: "text", text: describePrompt(images.length, userMessage) },
          ...images.map((img) => ({
            type: "image" as const,
            source: { type: "base64" as const, media_type: img.mediaType as AnthropicMedia, data: img.dataBase64 },
          })),
        ],
      },
    ],
  });
  return (
    msg.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("")
      .trim() || null
  );
}

/** Describe attached reference images as build-oriented Thai text, or null if it can't run. */
export async function describeImages(
  images: AttachedImage[],
  userMessage: string,
): Promise<string | null> {
  if (images.length === 0) return null;
  const cfg = await resolveVisionArm();
  if (!cfg) return null;
  try {
    return cfg.family === "anthropic"
      ? await describeWithAnthropic(cfg, images, userMessage)
      : await describeWithOpenAI(cfg, images, userMessage);
  } catch (e) {
    console.error("[vision-proxy] describe failed:", cfg.provider, e);
    return null;
  }
}
