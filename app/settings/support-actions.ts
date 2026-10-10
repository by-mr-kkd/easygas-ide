"use server";

import { getFiles } from "@/lib/files";
import { getProject } from "@/lib/projects";
import { AttachRefusal, buildAttachment, type CodeAttachment } from "@/lib/support/code";
import { getTicket, listTickets, markTicketSeen, replyTicket, sendTicket, SupportError, type Ticket, type TicketDetail } from "@/lib/support/fast-track";

/**
 * Pro Fast Track, from Settings → ช่วยเหลือ and the help button in the editor. The licence key never leaves
 * the server (lib/support/fast-track.ts). Code is attached by project id: the files are read here, never
 * taken from the client.
 */

const LIMIT = { title: 140, body: 8000, name: 40 };

type Fail = { ok: false; error: string };

const failFrom = (e: unknown, fallback: string): Fail => ({
  ok: false,
  error: e instanceof SupportError || e instanceof AttachRefusal ? e.message : fallback,
});

/** The project's code as it will travel (dot files out, credentials masked). */
async function attachmentOf(projectId: unknown): Promise<CodeAttachment | null> {
  if (projectId === undefined || projectId === null || projectId === "") return null;
  const project = await getProject(String(projectId)).catch(() => null);
  if (!project) throw new AttachRefusal("ไม่พบโปรเจกต์นี้ในเครื่อง");
  const files = await getFiles(project.id);
  return buildAttachment(project.name, files.map((f) => ({ path: f.path, content: f.content })));
}

/** What "แนบโค้ด" would send, shown under the checkbox before anything leaves the computer. */
export async function attachPreviewAction(projectId: string): Promise<{ ok: true; files: number; kb: number; redacted: number } | Fail> {
  try {
    const a = await attachmentOf(projectId);
    if (!a) return { ok: false, error: "ยังไม่ได้เลือกโปรเจกต์" };
    const bytes = a.files.reduce((n, f) => n + new TextEncoder().encode(f.source).length, 0);
    return { ok: true, files: a.files.length, kb: Math.max(1, Math.round(bytes / 1000)), redacted: a.redacted };
  } catch (e) {
    return failFrom(e, "อ่านโค้ดของโปรเจกต์ไม่สำเร็จ");
  }
}

export async function sendTicketAction(input: { title: string; body: string; name: string; projectId?: string | null }): Promise<{ ok: true; url: string; id: string } | Fail> {
  const title = String(input?.title ?? "").trim().slice(0, LIMIT.title);
  const body = String(input?.body ?? "").trim().slice(0, LIMIT.body);
  const name = String(input?.name ?? "").trim().slice(0, LIMIT.name);
  if (title.length < 4) return { ok: false, error: "หัวข้อสั้นเกินไป อย่างน้อย 4 ตัวอักษร" };
  if (!body) return { ok: false, error: "ยังไม่ได้พิมพ์รายละเอียด" };
  try {
    const code = await attachmentOf(input?.projectId);
    const r = await sendTicket({ title, body, name, code });
    return { ok: true, url: r.url, id: r.id };
  } catch (e) {
    return failFrom(e, "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

export async function listTicketsAction(): Promise<{ ok: true; tickets: Ticket[] } | Fail> {
  try {
    return { ok: true, tickets: await listTickets() };
  } catch (e) {
    return failFrom(e, "โหลดรายการไม่สำเร็จ");
  }
}

/** One ticket's conversation; opening it marks the answers so far as read. */
export async function getTicketAction(id: string): Promise<{ ok: true; ticket: TicketDetail } | Fail> {
  if (typeof id !== "string" || id.length > 64) return { ok: false, error: "ไม่พบคำถามนี้" };
  try {
    const ticket = await getTicket(id);
    await markTicketSeen(ticket.id, ticket.adminRepliedAt).catch(() => {});
    return { ok: true, ticket };
  } catch (e) {
    return failFrom(e, "โหลดคำถามไม่สำเร็จ");
  }
}

export async function replyTicketAction(input: { id: string; body: string; projectId?: string | null }): Promise<{ ok: true } | Fail> {
  const id = String(input?.id ?? "");
  const body = String(input?.body ?? "").trim().slice(0, LIMIT.body);
  if (!id || id.length > 64) return { ok: false, error: "ไม่พบคำถามนี้" };
  if (!body) return { ok: false, error: "ยังไม่ได้พิมพ์ข้อความ" };
  try {
    await replyTicket(id, body, await attachmentOf(input?.projectId));
    return { ok: true };
  } catch (e) {
    return failFrom(e, "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง");
  }
}

export async function ticketOpenedAction(id: string, adminRepliedAt: string | null): Promise<void> {
  if (typeof id !== "string" || (adminRepliedAt !== null && typeof adminRepliedAt !== "string")) return;
  await markTicketSeen(id, adminRepliedAt).catch(() => {});
}
