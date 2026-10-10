/**
 * Record types for the local store (lib/local). Shapes are kept from the hosted version so the agent
 * loops and IDE components port over unchanged; there is a single local user (LOCAL_USER_ID).
 */

import type { AiChoice } from "@/lib/ai-choice";
import type { ProjectBrief } from "@/lib/brief";
import type { EngineSessions } from "@/lib/engines/engine-session";
import type { StylePrefs } from "@/lib/preferences";

export type ProjectKind = "webapp" | "bound";
export type ProjectStatus = "draft" | "previewing" | "deployed" | "archived";
/** Deployment runtime. Only 'gas' is implemented; the router flags requests that need a web target. */
export type TargetId = "gas" | "web-supabase" | "static-web";

export const LOCAL_USER_ID = "local";

export interface EgsProject {
  id: string;
  owner_id: string;
  name: string;
  kind: ProjectKind;
  target: TargetId;
  spec: Record<string, unknown> | null;
  script_id: string | null;
  /** kind "bound": the Google Sheet the script lives in (set by the first publish, lib/bound.ts) */
  bound_sheet_id: string | null;
  /** kind "bound": the files last pushed into that script (a bound project has no web-app deployment) */
  bound_push?: { hash: string; at: string } | null;
  scratch_script_id: string | null;
  token_spend_input: number;
  token_spend_output: number;
  /** API provider the project last ran on (set by the API engine). Whether the history is TIED to it
   *  is decided from the stored rows, not from this field — see apiProviderLock in lib/ai-options.ts. */
  llm_provider: string | null;
  /** The AI the user last picked in this project's chat (engine, provider, model). */
  ai?: AiChoice | null;
  /** One conversation per CLI engine: its session id, the instructions it was given, and how much of
   *  the chat history it has seen (lib/engines/engine-session.ts). */
  engine_sessions?: EngineSessions | null;
  /** Before per-engine sessions (read once, then retired): the last CLI engine's session id… */
  engine_session_id: string | null;
  /** …and the fingerprints of the system prompt that session was started with. */
  engine_prompt?: { core: string; prefs: string } | null;
  /** This project's look & feel choices; they override the global ones in Settings (lib/preferences). */
  prefs?: Partial<StylePrefs> | null;
  /** Answers from the new-project wizard (lib/brief) — used to pick rule cards for the build. */
  brief?: ProjectBrief | null;
  /** Last web-app deployment (re-deploys PATCH this one — never create a new deployment). */
  deployment: EgsDeployment | null;
  /** Where the front page lives. "github" (premium) = a static page on the user's GitHub Pages that
   *  calls the GAS web app as its backend, so it can use the camera. Absent = "gas". */
  hosting?: "gas" | "github" | null;
  /** The backend's /exec answered without Google's permission wall (the owner approved it once). Set by
   *  backendAuthAction; cleared by a deploy that adds scopes, since Google asks again then. */
  backend_authorized_at?: string | null;
  /** The GitHub Pages copy of the front page, once published (lib/pages). */
  pages?: { repo: string; url: string; published_at: string } | null;
  /** "imported" = an existing Apps Script cloned in from the user's Google account (lib/import.ts): its
   *  manifest is never rewritten, Google's copy is checked for outside edits before every push, and only
   *  files the user changed are linted. Absent / "created" = made in this app. */
  origin?: "created" | "imported" | "cloned" | null;
  /** "cloned" = made from an EasyGAS share link (lib/share): where it came from, for the share dialog's
   *  "ต่อยอดจาก" and the sidebar label. */
  cloned_from?: { slug: string; url: string; title: string; author: string; version: number; cloned_at: string } | null;
  /** This project is published as an EasyGAS share link (lib/share). The token proves ownership to the
   *  website (new version, take down) and never leaves this computer. */
  share?: { slug: string; url: string; token: string; title: string; version: number; shared_at: string; updated_at: string } | null;
  /** Imported projects: what Google held at the last sync (import, pull, or our own push). */
  remote?: { hash: string; synced_at: string; title: string; /** local files last pushed */ pushed?: string } | null;
  created_at: string;
  updated_at: string;
  /** Soft-delete timestamp; null = live. */
  deleted_at: string | null;
}

export interface EgsFile {
  id: string;
  project_id: string;
  path: string;
  content: string;
  content_hash: string;
  updated_at: string;
}

export type MessageRole = "user" | "assistant";
export type TurnType = "codegen" | "plan";

export interface EgsMessage {
  id: string;
  project_id: string;
  role: MessageRole;
  content: unknown;
  turn_type: TurnType;
  created_at: string;
}

export type DeploymentEntryType = "webapp" | "api_executable";

export interface EgsDeployment {
  id: string;
  project_id: string;
  deployment_id: string;
  entry_type: DeploymentEntryType;
  exec_url: string | null;
  version_number: number | null;
  content_hash: string | null; // hash of the files last deployed → re-deploy change-detection
  oauth_scopes: string[]; // manifest oauthScopes of the last deploy → scope-growth detection
  created_at: string;
  updated_at: string;
}
