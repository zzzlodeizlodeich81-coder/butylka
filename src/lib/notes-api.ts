import { createServerFn } from "@tanstack/react-start";
import { NOTE_PACKS } from "@/lib/notes";
import { vkMiddleware } from "@/lib/vk/middleware";

export const getWallet = createServerFn({ method: "GET" })
  .middleware([vkMiddleware])
  .handler(async ({ context }) => {
    const vk = context.vk;
    if (!vk) return { ok: false as const, error: "Нет сессии VK.", notes: 0, name: "", vkId: null };
    const { readWallet } = await import("@/lib/notes-db.server");
    const row = await readWallet(vk);
    return { ok: true as const, notes: row.notes, name: row.name || vk.name, vkId: vk.vkId };
  });

export const listPacks = createServerFn({ method: "GET" }).handler(async () => ({
  packs: NOTE_PACKS,
}));
