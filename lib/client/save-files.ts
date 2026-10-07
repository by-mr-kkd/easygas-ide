import { useProjectStore } from "@/store/useProjectStore";

/**
 * Persist every dirty file to the server (egs_files) and mark them saved in the store.
 * Saving is now MANUAL — this is called by the "บันทึก" button AND auto-fired right before any
 * action that would otherwise discard unsaved edits (an AI run, a version restore), so the user
 * never loses local work. AI writes already persist server-side, so they're never dirty here.
 *
 * Returns the paths that were saved (empty when nothing was dirty). Best-effort: a failed write
 * leaves that file dirty so the user can retry.
 */
export async function saveDirtyFiles(projectId: string): Promise<string[]> {
  const { files, order, markSaved } = useProjectStore.getState();
  const dirty = order.filter((p) => files[p]?.dirty);
  if (dirty.length === 0) return [];

  const results = await Promise.allSettled(
    dirty.map((path) =>
      fetch(`/api/files/${projectId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ path, content: files[path].content }),
      }),
    ),
  );

  const saved: string[] = [];
  results.forEach((r, i) => {
    if (r.status === "fulfilled" && r.value.ok) {
      markSaved(dirty[i]);
      saved.push(dirty[i]);
    }
  });
  return saved;
}
