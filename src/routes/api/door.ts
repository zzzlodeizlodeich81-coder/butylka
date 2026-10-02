import { createFileRoute } from "@tanstack/react-router";
import {
  DOOR_COOKIE,
  GUEST_COOKIE,
  addPurse,
  checkAdminPassword,
  checkDoorPassword,
  doorCookieValue,
  doorEnabled,
  doorFromRequest,
  guestFromRequest,
  guestToken,
  joinPurse,
  listPurse,
  readPurse,
  setCookie,
} from "@/lib/purse.server";

export const Route = createFileRoute("/api/door")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: { action?: string; password?: string; name?: string; id?: string; amount?: number } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });

        if (body.action === "status") {
          const guest = doorFromRequest(request) ? guestFromRequest(request) : null;
          const row = guest ? await readPurse(guest.id) : null;
          return Response.json({
            ok: true,
            needDoor: doorEnabled(),
            inside: doorFromRequest(request),
            guest: row ? { id: row.id, name: row.name, notes: row.notes } : null,
          });
        }

        if (body.action === "enter") {
          if (!checkDoorPassword(body.password || "")) {
            return Response.json({ ok: false, error: "Пароль не тот." }, { status: 401 });
          }
          headers.append("set-cookie", setCookie(request, DOOR_COOKIE, doorCookieValue()));
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
        }

        if (body.action === "join") {
          if (!doorFromRequest(request)) {
            return Response.json({ ok: false, error: "Сначала пароль двора." }, { status: 401 });
          }
          const row = await joinPurse(body.name || "");
          if (!row) return Response.json({ ok: false, error: "Имя хотя бы из двух букв." }, { status: 400 });
          headers.append("set-cookie", setCookie(request, GUEST_COOKIE, guestToken(row)));
          return new Response(JSON.stringify({ ok: true, guest: row }), { status: 200, headers });
        }

        if (body.action === "admin") {
          if (!checkAdminPassword(body.password || "")) {
            return Response.json({ ok: false, error: "Это не пароль кассы." }, { status: 401 });
          }
          if (body.id) {
            const row = await addPurse(body.id, Number(body.amount || 0));
            if (!row) return Response.json({ ok: false, error: "Не начислилось. Проверь игрока и число." }, { status: 400 });
          }
          const players = await listPurse();
          return Response.json({ ok: true, players });
        }

        return Response.json({ ok: false, error: "Не понял." }, { status: 400 });
      },
    },
  },
});
