"use client";

import { useEffect, useSyncExternalStore } from "react";
import { checkCliAction, openCliTerminalAction, type CliCheck } from "@/app/settings/actions";
import type { InstallableCli } from "@/lib/engines/cli-install";

/**
 * One status per AI command-line tool for the whole Settings → AI page, so the overview at the top and the
 * chosen engine's setup below always say the same thing. After "ติดตั้ง" / "ล็อกอิน" it looks again by
 * itself every WATCH_MS until the tool appears (or signs in), so nobody has to know to press "ตรวจอีกครั้ง".
 */

export type CliBusy = "check" | "install" | "login" | null;
export interface CliEntry {
  result: CliCheck | null;
  busy: CliBusy;
  message: string | null;
  /** a terminal was opened and the page is waiting for the install / sign-in to finish */
  watching: "install" | "login" | null;
}

const WATCH_MS = 5_000;
const WATCH_FOR_MS = 5 * 60_000;
const EMPTY: CliEntry = { result: null, busy: null, message: null, watching: null };

const entries = new Map<InstallableCli, CliEntry>();
const listeners = new Set<() => void>();
const inflight = new Map<InstallableCli, Promise<CliCheck | null>>();
const watchers = new Map<InstallableCli, ReturnType<typeof setInterval>>();

const get = (tool: InstallableCli): CliEntry => entries.get(tool) ?? EMPTY;
function set(tool: InstallableCli, patch: Partial<CliEntry>) {
  entries.set(tool, { ...get(tool), ...patch });
  listeners.forEach((l) => l());
}

/** Look again (one request per tool at a time). `quiet` = a background look: no spinner, no message on failure. */
export function checkCli(tool: InstallableCli, quiet = false): Promise<CliCheck | null> {
  const running = inflight.get(tool);
  if (running) return running;
  if (!quiet) set(tool, { busy: "check", message: null });
  const p = checkCliAction(tool)
    .then((r) => {
      set(tool, { result: r });
      return r;
    })
    .catch(() => {
      if (!quiet) set(tool, { message: "ตรวจไม่สำเร็จ ลองใหม่อีกครั้ง" });
      return null;
    })
    .finally(() => {
      inflight.delete(tool);
      if (!quiet) set(tool, { busy: null });
    });
  inflight.set(tool, p);
  return p;
}

function stopWatch(tool: InstallableCli) {
  const t = watchers.get(tool);
  if (t) clearInterval(t);
  watchers.delete(tool);
  set(tool, { watching: null });
}

/** done = what "finished" means for this kind; Muse has no sign-in check, so its login is not watched. */
const finished = (kind: "install" | "login", r: CliCheck | null): boolean => (kind === "install" ? !!r?.found : r?.loggedIn === true);

function watch(tool: InstallableCli, kind: "install" | "login") {
  stopWatch(tool);
  const until = Date.now() + WATCH_FOR_MS;
  set(tool, { watching: kind });
  watchers.set(
    tool,
    setInterval(async () => {
      const r = await checkCli(tool, true);
      if (finished(kind, r)) {
        stopWatch(tool);
        set(tool, {
          message:
            kind === "install"
              ? r?.loggedIn === true
                ? "ติดตั้งเสร็จแล้ว และล็อกอินอยู่แล้ว พร้อมใช้"
                : "ติดตั้งเสร็จแล้ว ขั้นต่อไป กด ล็อกอิน"
              : "ล็อกอินแล้ว พร้อมใช้",
        });
      } else if (Date.now() > until) {
        stopWatch(tool);
        set(tool, { message: kind === "install" ? "ยังไม่พบโปรแกรม ถ้าหน้าต่างติดตั้งเสร็จแล้ว กด ตรวจอีกครั้ง" : "ยังไม่เห็นการล็อกอิน ทำในหน้าต่างให้เสร็จ แล้วกด ตรวจอีกครั้ง" });
      }
    }, WATCH_MS),
  );
}

/** "ติดตั้ง" / "ล็อกอิน": the visible PowerShell window with the vendor's own installer / the tool's own sign-in. */
export async function openCli(tool: InstallableCli, kind: "install" | "login"): Promise<void> {
  set(tool, { busy: kind, message: null });
  try {
    const r = await openCliTerminalAction(tool, kind);
    if (!r.ok) return set(tool, { message: r.error ?? "เปิดหน้าต่างไม่สำเร็จ" });
    set(tool, {
      message:
        kind === "install"
          ? "เปิดหน้าต่างติดตั้งแล้ว รอจนเสร็จ หน้านี้จะเห็นเองเมื่อติดตั้งเสร็จ"
          : tool === "muse"
            ? "เปิดหน้าต่างล็อกอินแล้ว อนุมัติรหัสในเบราว์เซอร์ให้เสร็จ"
            : "เปิดหน้าต่างล็อกอินแล้ว ทำตามในหน้าต่างนั้น หน้านี้จะเห็นเองเมื่อล็อกอินเสร็จ",
    });
    if (kind === "install" || tool !== "muse") watch(tool, kind);
  } catch {
    set(tool, { message: "เปิดหน้าต่างไม่สำเร็จ ลองทำตามขั้นตอนติดตั้งเองในส่วนของโปรแกรมนั้น" });
  } finally {
    set(tool, { busy: null });
  }
}

/**
 * The tool's shared status. `found` = what the page knew at render; a found tool is asked once (shared by
 * every component on the page) whether it is signed in, so the page says so without a click.
 */
export function useCliStatus(tool: InstallableCli, found: boolean): CliEntry & { isFound: boolean } {
  const entry = useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => get(tool),
    () => EMPTY,
  );
  useEffect(() => {
    if (found && !get(tool).result) void checkCli(tool);
  }, [tool, found]);
  return { ...entry, isFound: entry.result ? entry.result.found : found };
}
