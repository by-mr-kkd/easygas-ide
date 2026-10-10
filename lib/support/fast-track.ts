/**
 * Pro Fast Track (server-only): a support question sent from inside the app to the owner. The licence server
 * (premium-support) checks the key + this machine, writes a PRIVATE thread on the website's webboard and pushes
 * the owner. The thread's token comes back once and is kept here, in <dataRoot>/support-threads.json, so the
 * user can open their thread on the website (…/board/t/<id>?k=<token>) — only its hash is on the server.
 *
 * While the app runs, startFastTrackWatch() asks every CHECK_MS whether the owner answered; a new answer pops
 * a desktop notification (and a phone push when the user's phones have notifications on).
 */
import { join } from "node:path";
import { PREMIUM_SERVER } from "../premium/config.ts";
import { deviceIdentity } from "../premium/device.ts";
import { premiumStatus } from "../premium/status.ts";
import { readPremium } from "../premium/store.ts";
import { dataRoot } from "../local/paths.ts";
import { readJson, writeJsonAtomic } from "../local/json-store.ts";
import type { CodeAttachment } from "./code.ts";

export const SUPPORT_SITE = "https://easygaside.tech";
const CHECK_MS = 10 * 60_000;
const FIRST_CHECK_MS = 60_000;

export interface LocalTicket {
  id: string;
  token: string;
  title: string;
  createdAt: string;
  /** the newest admin answer the user has opened */
  seenAdminAt: string | null;
  /** the newest admin answer a notification already announced */
  notifiedAt?: string | null;
}

interface TicketFile {
  v: 1;
  tickets: LocalTicket[];
  /** an admin answer not opened yet (the settings nav badge reads this, offline) */
  unread: number;
}

export interface Ticket {
  id: string;
  title: string;
  url: string;
  createdAt: string;
  replies: number;
  adminRepliedAt: string | null;
  lastReplyAt: string;
  /** the last word is the admin's (else the user wrote after the answer, or nobody answered yet) */
  answered: boolean;
  locked: boolean;
  unread: boolean;
}

export class SupportError extends Error {}

const filePath = (): string => join(dataRoot(), "support-threads.json");

async function readFile(): Promise<TicketFile> {
  const f = await readJson<Partial<TicketFile>>(filePath(), {});
  return { v: 1, tickets: Array.isArray(f.tickets) ? f.tickets : [], unread: Number(f.unread) || 0 };
}

const writeFile = (f: TicketFile): Promise<void> => writeJsonAtomic(filePath(), f);

export async function unreadAnswers(): Promise<number> {
  return (await readFile()).unread;
}

async function call<T>(body: Record<string, unknown>): Promise<T> {
  const [{ key }, device] = await Promise.all([readPremium(), deviceIdentity()]);
  if (!key || !device) throw new SupportError("Fast Track ใช้ได้เมื่อเปิดใช้ Pro บนเครื่องนี้");
  let res: Response;
  try {
    res = await fetch(`${PREMIUM_SERVER}/premium-support`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...body, key, deviceHash: device.hash }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw new SupportError("ติดต่อเซิร์ฟเวอร์ไม่ได้ ตรวจอินเทอร์เน็ตแล้วลองใหม่");
  }
  const out = (await res.json().catch(() => ({}))) as T & { message?: unknown };
  if (!res.ok) throw new SupportError(typeof out.message === "string" ? out.message : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
  return out;
}

export const ticketUrl = (id: string, token: string | null): string =>
  `${SUPPORT_SITE}/board/t/${id}${token ? `?k=${encodeURIComponent(token)}` : ""}`;

export async function sendTicket(input: { title: string; body: string; name: string; code?: CodeAttachment | null }): Promise<{ id: string; url: string }> {
  if (!(await premiumStatus()).active) throw new SupportError("Fast Track ใช้ได้เฉพาะ Pro");
  const r = await call<{ id?: unknown; token?: unknown }>({ action: "create", ...input, code: input.code ?? undefined });
  if (typeof r.id !== "string" || typeof r.token !== "string") throw new SupportError("ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
  const f = await readFile();
  f.tickets = [{ id: r.id, token: r.token, title: input.title.trim().slice(0, 140), createdAt: new Date().toISOString(), seenAdminAt: null }, ...f.tickets].slice(0, 200);
  await writeFile(f);
  return { id: r.id, url: ticketUrl(r.id, r.token) };
}

type Row = { id: string; title: string; created_at: string; reply_count: number; last_reply_at: string; last_reply_kind: string | null; admin_replied_at: string | null; locked: boolean };

const isNewer = (a: string | null, b: string | null): boolean => !!a && (!b || new Date(a).getTime() > new Date(b).getTime());

/** This licence's tickets (from the server), with what is new since the user last looked. */
export async function listTickets(): Promise<Ticket[]> {
  if (!(await premiumStatus()).active) return [];
  const r = await call<{ threads?: Row[] }>({ action: "list" });
  const f = await readFile();
  const local = new Map(f.tickets.map((t) => [t.id, t]));
  const rows = Array.isArray(r.threads) ? r.threads : [];
  const tickets = rows.map((t) => {
    const mine = local.get(t.id);
    return {
      id: t.id,
      title: t.title,
      url: ticketUrl(t.id, mine?.token ?? null),
      createdAt: t.created_at,
      replies: t.reply_count,
      adminRepliedAt: t.admin_replied_at,
      lastReplyAt: t.last_reply_at,
      answered: t.last_reply_kind === "admin",
      locked: t.locked,
      unread: isNewer(t.admin_replied_at, mine?.seenAdminAt ?? null),
    };
  });
  const unread = tickets.filter((t) => t.unread).length;
  if (unread !== f.unread) await writeFile({ ...f, unread });
  return tickets;
}

/** What the server says about attached code: the project name and how many files (the code stays there). */
export type CodeNote = { project: string; files: number } | null;

export interface TicketMessage {
  id: string;
  body: string;
  author: string;
  admin: boolean;
  at: string;
  code: CodeNote;
}

export interface TicketDetail {
  id: string;
  title: string;
  url: string;
  locked: boolean;
  adminRepliedAt: string | null;
  /** the question first, then every reply */
  messages: TicketMessage[];
}

type DetailRow = {
  thread?: { id: string; title: string; body: string; author_name: string; created_at: string; locked: boolean; admin_replied_at: string | null; code: CodeNote };
  replies?: { id: string; body: string; author_name: string; author_kind: string; created_at: string; code: CodeNote }[];
};

/** One ticket with its conversation, to read and answer inside the app. */
export async function getTicket(id: string): Promise<TicketDetail> {
  if (!(await premiumStatus()).active) throw new SupportError("Fast Track ใช้ได้เฉพาะ Pro");
  const r = await call<DetailRow>({ action: "get", id });
  if (!r.thread) throw new SupportError("ไม่พบคำถามนี้");
  const t = r.thread;
  const replies = r.replies ?? [];
  const mine = (await readFile()).tickets.find((x) => x.id === t.id);
  return {
    id: t.id,
    title: t.title,
    url: ticketUrl(t.id, mine?.token ?? null),
    locked: t.locked,
    adminRepliedAt: t.admin_replied_at ?? null,
    messages: [
      { id: t.id, body: t.body, author: t.author_name, admin: false, at: t.created_at, code: t.code ?? null },
      ...replies.map((x) => ({ id: x.id, body: x.body, author: x.author_name, admin: x.author_kind === "admin", at: x.created_at, code: x.code ?? null })),
    ],
  };
}

/** The asker answers back from the app, optionally with the code again. */
export async function replyTicket(id: string, body: string, code?: CodeAttachment | null): Promise<void> {
  if (!(await premiumStatus()).active) throw new SupportError("Fast Track ใช้ได้เฉพาะ Pro");
  await call<{ id?: unknown }>({ action: "reply", id, body, code: code ?? undefined });
}

/** The user opened a ticket: its answers so far are read. */
export async function markTicketSeen(id: string, adminRepliedAt: string | null): Promise<void> {
  const f = await readFile();
  const t = f.tickets.find((x) => x.id === id);
  if (!t || !adminRepliedAt || !isNewer(adminRepliedAt, t.seenAdminAt)) return;
  t.seenAdminAt = adminRepliedAt;
  f.unread = Math.max(0, f.unread - 1);
  await writeFile(f);
}

/**
 * New admin answers since last time → `notify` for each (desktop + phone). Remembers what it told about in
 * notifiedAt, so one answer is announced once even if the user does not open it.
 */
export async function checkForAnswers(notify: (title: string, body: string) => void): Promise<void> {
  const f = await readFile();
  if (!f.tickets.length || !(await premiumStatus()).active) return;
  const tickets = await listTickets();
  const fresh = await readFile();
  const told = new Map(fresh.tickets.map((t) => [t.id, t.notifiedAt ?? t.seenAdminAt]));
  let changed = false;
  for (const t of tickets) {
    if (!t.adminRepliedAt || !isNewer(t.adminRepliedAt, told.get(t.id) ?? null)) continue;
    notify("แอดมินตอบ Fast Track แล้ว", t.title);
    const local = fresh.tickets.find((x) => x.id === t.id);
    if (local) {
      local.notifiedAt = t.adminRepliedAt;
      changed = true;
    }
  }
  if (changed) await writeFile(fresh);
}

let timer: NodeJS.Timeout | null = null;

/** Started once per server (instrumentation). Quiet when there are no tickets or Pro is off. */
export function startFastTrackWatch(notify: (title: string, body: string) => void): void {
  if (timer) return;
  const tick = () => void checkForAnswers(notify).catch(() => {});
  setTimeout(tick, FIRST_CHECK_MS).unref?.();
  timer = setInterval(tick, CHECK_MS);
  timer.unref?.();
}
