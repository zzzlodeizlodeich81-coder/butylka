import { packById, type PaidKind } from "@/lib/notes";
import type { VkUser } from "@/lib/vk/session.server";

type SheetOk = { ok: true; notes: number; duplicate?: boolean };
type SheetFail = { ok: false; error: string; notes?: number; needNotes?: number };
type SheetRes = SheetOk | SheetFail;

function webhook() {
  try {
    return process.env.NOTES_SHEET_WEBHOOK?.trim() || "";
  } catch {
    return "";
  }
}

function secret() {
  try {
    return process.env.NOTES_SHEET_SECRET?.trim() || "";
  } catch {
    return "";
  }
}

export function sheetEnabled() {
  return Boolean(webhook());
}

async function callSheet(body: Record<string, unknown>): Promise<SheetRes> {
  const url = webhook();
  if (!url) return { ok: false, error: "sheet off" };
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ secret: secret(), ...body }),
    signal: AbortSignal.timeout(18000),
  });
  const json = (await res.json().catch(() => null)) as SheetRes | null;
  if (!json || typeof json !== "object") return { ok: false, error: "sheet empty" };
  return json;
}

export async function sheetRead(user: VkUser): Promise<{ notes: number; name: string } | null> {
  if (!sheetEnabled()) return null;
  const hit = await callSheet({ op: "read", vkId: user.vkId, name: user.name });
  if (!hit.ok) throw new Error(hit.error || "sheet read");
  return { notes: Number(hit.notes ?? 0), name: user.name };
}

export async function sheetSpend(
  user: VkUser,
  kind: PaidKind,
  cost: number,
): Promise<SheetOk | SheetFail | null> {
  if (!sheetEnabled()) return null;
  return callSheet({ op: "spend", vkId: user.vkId, name: user.name, kind, cost });
}

export async function sheetRefund(user: VkUser, kind: PaidKind, cost: number): Promise<number | null> {
  if (!sheetEnabled()) return null;
  const hit = await callSheet({ op: "refund", vkId: user.vkId, name: user.name, kind, cost });
  if (!hit.ok) throw new Error(hit.error || "sheet refund");
  return Number(hit.notes ?? 0);
}

export async function sheetCredit(
  vkId: string,
  orderId: string,
  item: string,
): Promise<SheetOk | SheetFail | null> {
  if (!sheetEnabled()) return null;
  const pack = packById(item);
  if (!pack) return { ok: false, error: "unknown item" };
  return callSheet({
    op: "credit",
    vkId,
    name: "",
    orderId,
    item,
    notes: pack.notes,
    votes: pack.votes,
  });
}
