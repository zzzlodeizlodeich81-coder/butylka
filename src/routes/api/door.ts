import { createFileRoute } from "@tanstack/react-router";
import {
  DOOR_COOKIE,
  GUEST_COOKIE,
  addPurse,
  checkAdminPassword,
  checkDoorPassword,
  clearCookie,
  deletePurse,
  doorCookieValue,
  doorEnabled,
  doorFromRequest,
  guestFromRequest,
  guestToken,
  isAdminLogin,
  joinPurse,
  listPurse,
  loginAccount,
  peoplePurse,
  readPurse,
  registerAccount,
  setCookie,
  setFace,
} from "@/lib/purse.server";
import { postWhisper, setTyping, threadFor, typingName, unreadFrom } from "@/lib/mail.server";
import { forgetName } from "@/lib/yard-board";

export const Route = createFileRoute("/api/door")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: {
          action?: string;
          password?: string;
          login?: string;
          name?: string;
          id?: string;
          amount?: number;
          op?: string;
          who?: string;
          photo?: string;
          to?: string;
          text?: string;
          image?: string;
          audio?: string;
          with?: string;
        } = {};
        try {
          body = (await request.json()) as typeof body;
        } catch {
          body = {};
        }
        const headers = new Headers({ "content-type": "application/json", "cache-control": "no-store" });

        if (body.action === "status") {
          const guest = guestFromRequest(request);
          const row = guest ? await readPurse(guest.id) : null;
          return Response.json({
            ok: true,
            needDoor: doorEnabled(),
            inside: doorFromRequest(request) || Boolean(row),
            guest: row ? { id: row.id, name: row.name, notes: row.notes, login: row.login || "", admin: isAdminLogin(row.login) } : null,
          });
        }

        if (body.action === "register" || body.action === "login") {
          const found =
            body.action === "register"
              ? await registerAccount(body.login || "", body.password || "", body.name || "")
              : await loginAccount(body.login || "", body.password || "");
          if (!found.ok) return Response.json({ ok: false, error: found.error }, { status: 401 });
          headers.append("set-cookie", setCookie(request, DOOR_COOKIE, doorCookieValue()));
          headers.append("set-cookie", setCookie(request, GUEST_COOKIE, guestToken(found.row)));
          return new Response(JSON.stringify({ ok: true, guest: { id: found.row.id, name: found.row.name, notes: found.row.notes } }), {
            status: 200,
            headers,
          });
        }

        if (body.action === "out") {
          headers.append("set-cookie", clearCookie(request, DOOR_COOKIE));
          headers.append("set-cookie", clearCookie(request, GUEST_COOKIE));
          return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
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
          const guest = guestFromRequest(request);
          const me = guest ? await readPurse(guest.id) : null;
          const byPassword = checkAdminPassword(body.password || "");
          if (!byPassword && !isAdminLogin(me?.login)) {
            return Response.json({ ok: false, error: "Это не твоя админка." }, { status: 401 });
          }
          if (body.op === "chat" && body.who) await forgetName(body.who, false);
          if (body.op === "drop" && body.id) {
            const gone = await deletePurse(body.id);
            if (gone) await forgetName(gone.name, true);
          } else if (body.id && body.op !== "chat") {
            const row = await addPurse(body.id, Number(body.amount || 0));
            if (!row) return Response.json({ ok: false, error: "Не начислилось. Проверь игрока и число." }, { status: 400 });
          }
          const players = await listPurse();
          return Response.json({ ok: true, players });
        }

        if (body.action === "people" || body.action === "face" || body.action === "whisper" || body.action === "thread" || body.action === "inbox" || body.action === "type") {
          if (!doorFromRequest(request)) {
            return Response.json({ ok: false, error: "Сначала зайди во двор." }, { status: 401 });
          }
          const guest = guestFromRequest(request);
          if (!guest) return Response.json({ ok: false, error: "Сначала назовись." }, { status: 401 });
          if (body.action === "inbox") {
            return Response.json({ ok: true, me: guest.id, from: await unreadFrom(guest.id) });
          }
          if (body.action === "people") {
            return Response.json({ ok: true, me: guest.id, people: await peoplePurse() });
          }
          if (body.action === "face") {
            const saved = await setFace(guest.id, body.photo || "");
            if (!saved) return Response.json({ ok: false, error: "Лицо не встало. Возьми фото поменьше." }, { status: 400 });
            return Response.json({ ok: true });
          }
          if (body.action === "type") {
            setTyping(guest.id, guest.name, body.to || "", Boolean((body.text || "").trim()));
            return Response.json({ ok: true });
          }
          const other = body.action === "whisper" ? body.to || "" : body.with || "";
          const people = await peoplePurse();
          if (!people.some((person) => person.id === other)) {
            return Response.json({ ok: false, error: "Такого человека нет." }, { status: 400 });
          }
          if (body.action === "whisper") {
            const sent = await postWhisper(guest.id, other, body.text || "", body.image || "", body.audio || "");
            if (!sent) return Response.json({ ok: false, error: "Пусто." }, { status: 400 });
            setTyping(guest.id, guest.name, other, false);
          }
          return Response.json({ ok: true, lines: await threadFor(guest.id, other), typing: typingName(guest.id, other) });
        }

        return Response.json({ ok: false, error: "Не понял." }, { status: 400 });
      },
    },
  },
});
