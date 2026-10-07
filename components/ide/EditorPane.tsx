"use client";

import dynamic from "next/dynamic";
import { useEffect, useRef } from "react";
import { useProjectStore } from "@/store/useProjectStore";
import { useIsDark } from "@/components/ui/useIsDark";

// Monaco logs a benign "Canceled" error whenever it aborts an in-flight async op (hover/suggestion/
// layout) on blur or re-layout. It doesn't affect anything, but Next's dev overlay surfaces it as a
// scary error. Drop ONLY that exact shape from console.error, once.
let canceledSilenced = false;
function silenceMonacoCanceled() {
  if (canceledSilenced || typeof window === "undefined") return;
  canceledSilenced = true;
  const orig = console.error.bind(console);
  console.error = (...args: unknown[]) => {
    const isCanceled = args.some((a) => {
      if (typeof a === "string") return a === "Canceled" || a.startsWith("Canceled:");
      const e = a as { name?: string; message?: string } | null;
      return !!e && (e.name === "Canceled" || e.message === "Canceled");
    });
    if (!isCanceled) orig(...args);
  };
}

const Monaco = dynamic(
  () => import("@monaco-editor/react").then((m) => m.default),
  {
    ssr: false,
    loading: () => (
      <div className="hint grid h-full place-items-center">กำลังโหลดตัวแก้โค้ด…</div>
    ),
  },
);

function langOf(path: string): string {
  if (path.endsWith(".gs")) return "javascript";
  if (path.endsWith(".html")) return "html";
  if (path.endsWith(".json")) return "json";
  return "plaintext";
}

const MARKER_OWNER = "egs-critic";

export function EditorPane() {
  const activePath = useProjectStore((s) => s.activePath);
  const files = useProjectStore((s) => s.files);
  const issues = useProjectStore((s) => s.issues);
  const update = useProjectStore((s) => s.updateActiveContent);
  const dark = useIsDark();
  // refs to the live monaco instance so we can paint critic findings as gutter markers
  const editorRef = useRef<unknown>(null);
  const monacoRef = useRef<{ editor: { getModels: () => unknown[]; setModelMarkers: (...a: unknown[]) => void }; MarkerSeverity: { Error: number; Warning: number } } | null>(null);

  useEffect(silenceMonacoCanceled, []);

  // paint critic findings (one marker per file/line) across every open model — best-effort
  useEffect(() => {
    const monaco = monacoRef.current as unknown as {
      editor: {
        getModels: () => {
          uri?: { path?: string };
          getLineCount: () => number;
          getLineMaxColumn: (n: number) => number;
        }[];
        setModelMarkers: (model: unknown, owner: string, markers: unknown[]) => void;
      };
      MarkerSeverity: { Error: number; Warning: number };
    } | null;
    if (!monaco) return;
    try {
      for (const model of monaco.editor.getModels()) {
        const path = String(model.uri?.path ?? "").replace(/^\/+/, "");
        const list = issues[path] ?? [];
        const markers = list
          .filter((i) => typeof i.line === "number")
          .map((i) => {
            const line = Math.min(Math.max(1, i.line as number), model.getLineCount());
            return {
              startLineNumber: line,
              startColumn: 1,
              endLineNumber: line,
              endColumn: model.getLineMaxColumn(line),
              message: `ขัดกับกฎระบบ: ${i.problem}\nวิธีแก้: ${i.fix}`,
              severity: i.severity === "high" ? monaco.MarkerSeverity.Error : monaco.MarkerSeverity.Warning,
            };
          });
        monaco.editor.setModelMarkers(model, MARKER_OWNER, markers);
      }
    } catch {
      /* marker placement is best-effort — never break the editor */
    }
  }, [issues, activePath]);

  function onChange(v: string | undefined) {
    // Mark the file dirty in the store; persistence is now MANUAL (the "บันทึก" button) and is also
    // auto-flushed right before any AI run / restore via saveDirtyFiles — so edits are never lost.
    update(v ?? "");
  }

  if (!activePath) {
    return (
      <div className="grid h-full place-items-center px-6 text-center">
        <p className="hint">AI เริ่มเขียนแล้วโค้ดจะขึ้นตรงนี้</p>
      </div>
    );
  }

  return (
    <Monaco
      // `path` makes Monaco keep one model per file and switch between them — NOT a full remount
      // (which `key=` forced, disposing the editor mid-async → noisy "Canceled" errors).
      path={activePath}
      height="100%"
      theme={dark ? "vs-dark" : "vs"}
      language={langOf(activePath)}
      value={files[activePath]?.content ?? ""}
      onChange={onChange}
      onMount={(editor, monaco) => {
        editorRef.current = editor;
        monacoRef.current = monaco as never;
        // the web font may land after Monaco measured its glyphs — re-measure or the caret drifts
        document.fonts?.ready.then(() => monaco.editor.remeasureFonts()).catch(() => {});
      }}
      options={{
        minimap: { enabled: false },
        fontSize: 13,
        fontFamily: "var(--font-plex-mono), 'Cascadia Mono', Consolas, monospace",
        scrollBeyondLastLine: false,
        automaticLayout: true,
        padding: { top: 12 },
        tabSize: 2,
      }}
    />
  );
}
