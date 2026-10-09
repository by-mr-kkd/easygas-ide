"use server";

import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { revalidatePath } from "next/cache";
import { MODEL_ID, sanitizeChoice } from "@/lib/ai-choice";
import { LLM_PROVIDERS } from "@/lib/llm/catalog";
import { resolveProvider } from "@/lib/llm/provider";
import { detectCapabilityNeeds, routeTarget } from "@/lib/deployment-targets/router";
import { briefToMessage, isEmptyBrief, sanitizeBrief } from "@/lib/brief";
import { sanitizePrefs, type StylePrefs } from "@/lib/preferences";
import { isProjectBusy } from "@/lib/agent-lock";
import { latestAnnouncement, type Announcement } from "@/lib/announcement";
import { createProject, getProject, mutateProject, softDeleteProject } from "@/lib/projects";

function buildSpec(name: string): Record<string, unknown> {
  // Capability router: record what the project seems to need + whether it wants a target we don't
  // build, so the IDE can warn honestly. Always created as GAS.
  const needs = detectCapabilityNeeds(name);
  const route = routeTarget(needs);
  return {
    description: name.trim() || null,
    capabilityNeeds: needs,
    recommendedTarget: route.target,
    webOnlyReasons: route.notImplemented ? route.reasons : [],
  };
}

/**
 * Create a project and RETURN its id (no redirect) — the projects home and the style picker stash
 * their kickoff prompt in sessionStorage before navigating into the IDE.
 */
export async function newProjectReturnId(name: string): Promise<{ id: string } | { error: string }> {
  return { id: await createProject(name, "webapp", buildSpec(name)) };
}

/**
 * Delete a project from the app (its folder stays on disk, recoverable). The Apps Script project on
 * Google is NOT touched: clasp's Google sign-in has no Drive write access to the scripts it creates,
 * so the UI links the user to script.google.com to remove it themselves.
 */
export async function deleteProjectAction(id: string) {
  if (!(await getProject(id))) throw new Error("not_found");
  await softDeleteProject(id);
  revalidatePath("/projects");
}

/** Look & feel for one project; only the keys present override the user's defaults from Settings. */
export async function saveProjectPrefsAction(id: string, input: unknown): Promise<{ ok: boolean; error?: string }> {
  if (!(await getProject(id))) return { ok: false, error: "ไม่พบโปรเจกต์" };
  // the AI may be saving a choice of its own right now (save_preference) — don't overwrite it blind
  if (await isProjectBusy(id)) return { ok: false, error: "AI กำลังทำงานกับโปรเจกต์นี้อยู่ รอให้เสร็จก่อนแล้วบันทึกอีกครั้ง" };
  await mutateProject(id, () => ({ prefs: sanitizePrefs(input) }));
  return { ok: true };
}

/**
 * Finish the new-project wizard: store the brief (the app picks rule cards from it) and any look & feel
 * the user changed, and return the first chat message for the client to send.
 */
export async function startFromBriefAction(
  id: string,
  briefInput: unknown,
  prefsInput: unknown,
): Promise<{ message: string } | { error: string }> {
  const project = await getProject(id);
  if (!project) return { error: "ไม่พบโปรเจกต์" };
  const brief = sanitizeBrief(briefInput);
  if (isEmptyBrief(brief)) return { error: "ยังไม่ได้เลือกอะไรเลย เลือกอย่างน้อยหนึ่งข้อ หรือกด พิมพ์เอง" };
  await mutateProject(id, (current) => ({
    brief,
    prefs: { ...sanitizePrefs(current.prefs), ...sanitizePrefs(prefsInput) },
  }));
  return { message: briefToMessage(brief) };
}

/** This project's own look & feel choices as stored now (the AI may have saved one during the chat). */
/** The home screen's news banner (lib/announcement.ts); asked from a client effect, never at render time. */
export async function appAnnouncementAction(): Promise<Announcement | null> {
  return latestAnnouncement();
}

/** Whether an AI turn (or deploy / verify) is running on the project — the chat polls it after a reload. */
export async function projectRunningAction(id: string): Promise<boolean> {
  return (await getProject(id)) ? isProjectBusy(id) : false;
}

export async function getProjectPrefsAction(id: string): Promise<Partial<StylePrefs>> {
  return sanitizePrefs((await getProject(id))?.prefs);
}

/** Remember the AI picked in this project's chat (the re-check and the after-publish repair follow it). */
export async function saveProjectAiAction(id: string, input: unknown): Promise<{ ok: boolean }> {
  const choice = sanitizeChoice(input);
  if (!choice || !(await getProject(id))) return { ok: false };
  await mutateProject(id, () => ({ ai: choice }));
  return { ok: true };
}

/** Model ids that are plainly not chat models — kept out of the picker's list. */
const NOT_A_CHAT_MODEL = /embed|whisper|tts|audio|transcri|moderation|dall-e|image|realtime|rerank|sam-|speech|video/i;
const MAX_LISTED_MODELS = 200;

/**
 * The models the user's own key can use, asked from the provider (the chat picker's "ดึงรายชื่อ").
 * Returns ids only; the key stays on the server.
 */
export async function listModelsAction(provider: unknown): Promise<{ models: string[] } | { error: string }> {
  const p = LLM_PROVIDERS.find((x) => x === provider);
  if (!p) return { error: "ผู้ให้บริการไม่ถูกต้อง" };
  const cfg = await resolveProvider(p);
  if (!cfg.apiKey) return { error: `ยังไม่ได้ใส่ API key ของ ${cfg.label}` };
  try {
    const ids: string[] = [];
    if (cfg.family === "anthropic") {
      for await (const m of new Anthropic({ apiKey: cfg.apiKey }).models.list()) {
        ids.push(m.id);
        if (ids.length >= MAX_LISTED_MODELS) break;
      }
    } else {
      for await (const m of new OpenAI({ apiKey: cfg.apiKey, baseURL: cfg.baseURL }).models.list()) {
        ids.push(m.id);
        if (ids.length >= MAX_LISTED_MODELS * 3) break;
      }
    }
    // Gemini's OpenAI-compatible list prefixes ids with "models/"
    const models = [...new Set(ids.map((id) => id.replace(/^models\//, "")))]
      .filter((id) => MODEL_ID.test(id) && !NOT_A_CHAT_MODEL.test(id))
      .sort((a, b) => a.localeCompare(b, "en", { numeric: true }))
      .slice(0, MAX_LISTED_MODELS);
    return models.length > 0 ? { models } : { error: "ผู้ให้บริการไม่ได้ส่งรายชื่อโมเดลกลับมา พิมพ์ชื่อโมเดลเองได้" };
  } catch (e) {
    console.error("[models] list failed:", (e as Error).message);
    return { error: "ดึงรายชื่อโมเดลไม่สำเร็จ พิมพ์ชื่อโมเดลเองได้" };
  }
}
