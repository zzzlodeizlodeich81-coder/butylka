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
    if (!context.vk) return { ok: true as const, local: true as const, notes: 0 };
    const { spendAmount } = await import("@/lib/notes-db.server");
    const paid = await spendAmount(context.vk, data.kind, cost);
    if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes, needNotes: cost };
    return { ok: true as const, local: false as const, notes: paid.notes };
  });
