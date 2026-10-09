import { createFileRoute } from "@tanstack/react-router";
import { guestFromRequest, readPurse } from "@/lib/purse.server";
import { dropDraft, listVerses, publishDraft, saveDraft } from "@/lib/verses.server";

export const Route = createFileRoute("/api/verse")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ error: "Сначала зайди во двор." }, { status: 401 });
        return Response.json({ ok: true, ...(await listVerses(guest.id)) });
      },
      POST: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ error: "Сначала зайди во двор." }, { status: 401 });
        const purse = await readPurse(guest.id);
        const author = purse?.name || guest.name;
        const body = (await request.json().catch(() => null)) as {
          action?: string;
          id?: string;
          title?: string;
          body?: string;
          font?: string;
          size?: number;
        } | null;
        if (body?.action === "save") {
          const row = await saveDraft(guest.id, author, body);
          if (!row) return Response.json({ error: "Черновиков уже 80. Удали старый." }, { status: 400 });
          return Response.json({ ok: true, draft: row });
        }
        if (body?.action === "publish") {
          const pub = await publishDraft(guest.id, author, body.id || "");
          if (!pub) return Response.json({ error: "Пустой черновик в сборник не берём." }, { status: 400 });
          return Response.json({ ok: true, pub });
        }
        if (body?.action === "drop") {
          const ok = await dropDraft(guest.id, body.id || "");
          if (!ok) return Response.json({ error: "Черновик не найден." }, { status: 404 });
          return Response.json({ ok: true });
        }
        return Response.json({ error: "Не понял." }, { status: 400 });
      },
    },
  },
});
