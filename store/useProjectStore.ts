import { create } from "zustand";
import type { AiChoice } from "@/lib/ai-choice";

export interface FileEntry {
  content: string;
  dirty: boolean;
}

export interface FileMutation {
  op: "write" | "edit" | "delete";
  path: string;
  content?: string;
}

/** A rulebook-critic finding surfaced in the editor (file badge + Monaco marker + issues panel). */
export interface EditorIssue {
  file: string;
  line?: number;
  severity: "high" | "medium" | "low";
  problem: string;
  fix: string;
}

interface ProjectState {
  files: Record<string, FileEntry>;
  order: string[];
  activePath: string | null;
  /** the file the agent is currently writing/editing — FileTree pulses its dot; null when idle */
  workingPath: string | null;
  /** critic findings keyed by file path (from "ให้ AI ตรวจซ้ำ") */
  issues: Record<string, EditorIssue[]>;
  setInitial: (files: { path: string; content: string }[]) => void;
  applyMutation: (m: FileMutation) => void;
  setActive: (path: string) => void;
  setWorking: (path: string | null) => void;
  updateActiveContent: (content: string) => void;
  markSaved: (path: string) => void;
  setIssues: (list: EditorIssue[]) => void;
  clearIssues: () => void;
  /** cross-pane trigger: the editor toolbar / issues panel ask ChatPanel to run the agent
   *  (kind "send" = fix-via-chat with `text`, kind "verify" = Gate-2 run-and-repair) */
  command: { kind: "send" | "verify"; text?: string } | null;
  runAgent: (kind: "send" | "verify", text?: string) => void;
  consumeCommand: () => void;
  /** The AI (and model) picked in the chat box for the next message; the re-check follows it too. */
  aiChoice: AiChoice | null;
  setAiChoice: (choice: AiChoice | null) => void;
  /** true once the chat has a message or the AI is running — until then (and while the project has no
   *  files) the IDE shows its single start screen instead of the panes. Owned by ChatPanel. */
  chatActive: boolean;
  setChatActive: (active: boolean) => void;
  /** Ctrl+K command palette open state — set by the top-bar search box or the global hotkey */
  paletteOpen: boolean;
  setPaletteOpen: (open: boolean) => void;
  /** one-shot imperative action dispatched by the palette, consumed by the owning component
   *  (DeployButton→"deploy", DeployedUrlBar→"openDev"/"redeploy", EditorToolbar→"recheck",
   *  IdeShell→"connectGoogle") */
  actionRequest: string | null;
  requestAction: (key: string) => void;
  clearActionRequest: () => void;
  /** per-project token budget used so far (drives the energy bar). ChatPanel seeds it from the
   *  server value; both a chat/verify turn AND a manual re-check add their tokens live. */
  energy: number;
  initEnergy: (used: number) => void;
  addEnergy: (tokens: number) => void;
}

/**
 * Single source of truth for the editor. The agent loop echoes file_mutation events over SSE
 * (ChatPanel) → applyMutation → Monaco + FileTree + Preview re-render (one-way, no drift).
 * Manual edits flow updateActiveContent → autosave (EditorPane) → markSaved.
 */
export const useProjectStore = create<ProjectState>((set) => ({
  files: {},
  order: [],
  activePath: null,
  workingPath: null,
  issues: {},
  command: null,
  aiChoice: null,
  chatActive: false,
  paletteOpen: false,
  actionRequest: null,
  energy: 0,

  setInitial: (list) =>
    set(() => {
      const files: Record<string, FileEntry> = {};
      const order: string[] = [];
      for (const f of list) {
        files[f.path] = { content: f.content, dirty: false };
        order.push(f.path);
      }
      return { files, order, activePath: order[0] ?? null, issues: {} };
    }),

  applyMutation: (m) =>
    set((s) => {
      if (m.op === "delete") {
        const files = { ...s.files };
        delete files[m.path];
        const issues = { ...s.issues };
        delete issues[m.path];
        const order = s.order.filter((p) => p !== m.path);
        return {
          files,
          order,
          issues,
          activePath: s.activePath === m.path ? order[0] ?? null : s.activePath,
          workingPath: s.workingPath === m.path ? null : s.workingPath,
        };
      }
      const files = { ...s.files, [m.path]: { content: m.content ?? "", dirty: false } };
      const order = s.order.includes(m.path) ? s.order : [...s.order, m.path];
      const issues = { ...s.issues };
      delete issues[m.path]; // content changed → old findings are stale
      // jump to + mark as the file being written (FileTree pulses its dot)
      return { files, order, issues, activePath: m.path, workingPath: m.path };
    }),

  setActive: (path) => set({ activePath: path }),
  setWorking: (path) => set({ workingPath: path }),

  updateActiveContent: (content) =>
    set((s) => {
      if (!s.activePath) return {};
      const issues = { ...s.issues };
      delete issues[s.activePath]; // editing invalidates this file's findings
      return { files: { ...s.files, [s.activePath]: { content, dirty: true } }, issues };
    }),

  markSaved: (path) =>
    set((s) => {
      const f = s.files[path];
      if (!f || !f.dirty) return {};
      return { files: { ...s.files, [path]: { ...f, dirty: false } } };
    }),

  setIssues: (list) =>
    set(() => {
      const issues: Record<string, EditorIssue[]> = {};
      for (const i of list) (issues[i.file] ??= []).push(i);
      return { issues };
    }),

  clearIssues: () => set({ issues: {} }),

  runAgent: (kind, text) => set({ command: { kind, text } }),
  consumeCommand: () => set({ command: null }),

  setAiChoice: (choice) => set({ aiChoice: choice }),
  setChatActive: (active) => set((s) => (s.chatActive === active ? {} : { chatActive: active })),
  setPaletteOpen: (open) => set({ paletteOpen: open }),
  requestAction: (key) => set({ actionRequest: key }),
  clearActionRequest: () => set({ actionRequest: null }),

  initEnergy: (used) => set({ energy: used }),
  addEnergy: (tokens) => set((s) => ({ energy: s.energy + (tokens || 0) })),
}));
