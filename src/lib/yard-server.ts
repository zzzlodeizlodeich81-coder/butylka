import { createServerFn } from "@tanstack/react-start";
import { vkMiddleware } from "@/lib/vk/middleware";

export const settleYard = createServerFn({ method: "POST" })
  .middleware([vkMiddleware])
  .validator((input: { notes: number; kind: "deal" | "frame" }) => input)
  .handler(async ({ data, context }) => {
    const cost = Math.round(Number(data.notes));
    if (!Number.isFinite(cost) || cost < 1 || cost > 100000) {
      return { ok: false as const, error: "Странная цена.", notes: 0 };
    }
    if (!context.vk || process.env.DOOR_PASSWORD?.trim()) {
      if (process.env.DOOR_PASSWORD?.trim()) {
        const { currentGuest, spendPurse } = await import("@/lib/purse.server");
        const guest = currentGuest();
        if (!guest) return { ok: false as const, error: "Сначала войди во двор.", notes: 0, needNotes: cost };
        const paid = await spendPurse(guest.id, cost);
        if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes, needNotes: cost };
        return { ok: true as const, local: false as const, notes: paid.notes };
      }
      return { ok: true as const, local: true as const, notes: 0 };
    }
    const { spendAmount } = await import("@/lib/notes-db.server");
    const paid = await spendAmount(context.vk, data.kind, cost);
    if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes, needNotes: cost };
    return { ok: true as const, local: false as const, notes: paid.notes };
  });
