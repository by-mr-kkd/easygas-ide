"use server";

import { listTickets, markTicketSeen, sendTicket, SupportError, type Ticket } from "@/lib/support/fast-track";

/** Pro Fast Track from Settings → ช่วยเหลือ. The licence key never leaves the server (lib/support/fast-track.ts). */

const LIMIT = { title: 140, body: 8000, name: 40 };

export async function sendTicketAction(input: { title: string; body: string; name: string }): Promise<{ ok: true; url: string } | { ok: false; error: string }> {
  const title = String(input?.title ?? "").trim().slice(0, LIMIT.title);
  const body = String(input?.body ?? "").trim().slice(0, LIMIT.body);
  const name = String(input?.name ?? "").trim().slice(0, LIMIT.name);
  if (title.length < 4) return { ok: false, error: "หัวข้อสั้นเกินไป อย่างน้อย 4 ตัวอักษร" };
  if (!body) return { ok: false, error: "ยังไม่ได้พิมพ์รายละเอียด" };
  try {
    const r = await sendTicket({ title, body, name });
    return { ok: true, url: r.url };
  } catch (e) {
    return { ok: false, error: e instanceof SupportError ? e.message : "ส่งไม่สำเร็จ ลองใหม่อีกครั้ง" };
  }
}

export async function listTicketsAction(): Promise<{ ok: true; tickets: Ticket[] } | { ok: false; error: string }> {
  try {
    return { ok: true, tickets: await listTickets() };
  } catch (e) {
    return { ok: false, error: e instanceof SupportError ? e.message : "โหลดรายการไม่สำเร็จ" };
  }
}

export async function ticketOpenedAction(id: string, adminRepliedAt: string | null): Promise<void> {
  if (typeof id !== "string" || (adminRepliedAt !== null && typeof adminRepliedAt !== "string")) return;
  await markTicketSeen(id, adminRepliedAt).catch(() => {});
}
