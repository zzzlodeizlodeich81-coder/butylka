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
  peoplePurse,
  readPurse,
  setCookie,
  setFace,
} from "@/lib/purse.server";
import { postWhisper, threadFor } from "@/lib/mail.server";

export const Route = createFileRoute("/api/door")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          action?: string;
          password?: string;
          name?: string;
          id?: string;
          amount?: number;
          photo?: string;
          to?: string;
          text?: string;
          with?: string;
        } = {};
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

        if (body.action === "people" || body.action === "face" || body.action === "whisper" || body.action === "thread") {
          if (!doorFromRequest(request)) {
            return Response.json({ ok: false, error: "Сначала зайди во двор." }, { status: 401 });
          }
          const guest = guestFromRequest(request);
          if (!guest) return Response.json({ ok: false, error: "Сначала назовись." }, { status: 401 });
          if (body.action === "people") {
            return Response.json({ ok: true, me: guest.id, people: await peoplePurse() });
          }
          if (body.action === "face") {
            const saved = await setFace(guest.id, body.photo || "");
            if (!saved) return Response.json({ ok: false, error: "Лицо не встало. Возьми фото поменьше." }, { status: 400 });
            return Response.json({ ok: true });
          }
          const other = body.action === "whisper" ? body.to || "" : body.with || "";
          const people = await peoplePurse();
          if (!people.some((person) => person.id === other)) {
            return Response.json({ ok: false, error: "Такого человека нет." }, { status: 400 });
          }
          if (body.action === "whisper") {
            const sent = await postWhisper(guest.id, other, body.text || "");
            if (!sent) return Response.json({ ok: false, error: "Пусто." }, { status: 400 });
          }
          return Response.json({ ok: true, lines: await threadFor(guest.id, other) });
        }

        return Response.json({ ok: false, error: "Не понял." }, { status: 400 });
      },
    },
  },
});
