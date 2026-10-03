import { createFileRoute } from "@tanstack/react-router";
import { doorFromRequest, guestFromRequest, readPurse } from "@/lib/purse.server";
import { settleGuest, settlePay, startPay } from "@/lib/yookassa.server";

export const Route = createFileRoute("/api/yookassa")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const text = await request.text();
        let body: { action?: string; pack?: string; email?: string; event?: string; object?: { id?: string } } = {};
        try {
          body = JSON.parse(text) as typeof body;
        } catch {
          body = {};
        }
        if (body.event && body.object?.id) {
          const res = await settlePay(body.object.id);
          const soft = res.ok || res.error === "Платёж не наш." || res.error === "Оплата ещё не прошла.";
          return Response.json({ ok: res.ok }, { status: soft ? 200 : 500 });
        }
        if (!doorFromRequest(request)) return Response.json({ ok: false, error: "Сначала зайди." }, { status: 401 });
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ ok: false, error: "Сначала зайди." }, { status: 401 });
        if (body.action === "check") {
          const res = await settleGuest(guest.id);
          const row = await readPurse(guest.id);
          return Response.json({ ok: true, paid: res.ok, notes: row?.notes ?? res.notes });
        }
        const origin = (process.env.SITE_URL || "").trim() || new URL(request.url).origin;
        const res = await startPay(guest.id, body.pack || "", `${origin.replace(/\/$/, "")}/?kassa=1`, body.email || "");
        return Response.json(res, { status: res.ok ? 200 : 400 });
      },
    },
  },
});
