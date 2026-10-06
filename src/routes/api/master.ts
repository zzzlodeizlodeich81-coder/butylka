import { createFileRoute } from "@tanstack/react-router";
import { NOTE_PRICE } from "@/lib/notes";
import { guestFromRequest, spendPurse } from "@/lib/purse.server";

export const Route = createFileRoute("/api/master")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ ok: false, error: "Сначала зайди во двор." }, { status: 401 });
        const paid = await spendPurse(guest.id, NOTE_PRICE.master);
        if (!paid.ok) return Response.json({ ok: false, error: paid.error, notes: paid.notes }, { status: 402 });
        const { grantCut } = await import("@/lib/yard-cut.server");
        await grantCut("master");
        return Response.json({ ok: true, notes: paid.notes });
      },
    },
  },
});
