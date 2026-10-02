import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NOTE_PRICE } from "@/lib/notes";
import { addPurse, guestFromRequest, spendPurse } from "@/lib/purse.server";

const FALLBACK = `Ты хозяин особняка XXV Kadr. Говоришь коротко, по-русски, как человек у камина, не как справочник.
Если просят стихи или песню, работай так: сначала сочини текст по-английски, с рифмой и размером. Потом сделай литературный поэтический перевод на русский. Смысл, образы и настроение сохрани, рифму подбери заново по-русски, не кальку и не подстрочник.
Игроку отдай только русский текст: название и куплеты. Английский черновик не показывай.
Чужие песни и стихи не копируй. Если это просто разговор, ответь коротко по-русски, без перевода.`;

type Turn = { role: "user" | "assistant"; content: string };

async function systemPrompt() {
  const fromEnv = (process.env.MANOR_PROMPT || "").trim();
  if (fromEnv) return fromEnv;
  try {
    const file = (await readFile(join(process.cwd(), "data", "manor-prompt.txt"), "utf8")).trim();
    if (file) return file;
  } catch {
    /* файла ещё нет, берём запасной */
  }
  return FALLBACK;
}

export const Route = createFileRoute("/api/host")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ error: "Сначала зайди во двор." }, { status: 401 });
        const key = process.env.XAI_API_KEY || "";
        if (!key) return Response.json({ error: "Хозяин сейчас молчит: нет ключа." }, { status: 503 });
        const body = (await request.json().catch(() => null)) as { text?: string; history?: Turn[] } | null;
        const text = (body?.text || "").trim().slice(0, 600);
        if (text.length < 2) return Response.json({ error: "Скажи, о чём писать." }, { status: 400 });
        const history = Array.isArray(body?.history)
          ? body.history
              .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
              .slice(-6)
              .map((row) => ({ role: row.role, content: row.content.slice(0, 1200) }))
          : [];
        const paid = await spendPurse(guest.id, NOTE_PRICE.host);
        if (!paid.ok) return Response.json({ error: paid.error, notes: paid.notes }, { status: 402 });
        const system = await systemPrompt();
        const res = await fetch("https://api.x.ai/v1/chat/completions", {
          method: "POST",
          headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
          body: JSON.stringify({
            model: process.env.XAI_CHAT_MODEL || "grok-4-fast-non-reasoning",
            temperature: 0.9,
            max_tokens: 900,
            messages: [{ role: "system", content: system }, ...history, { role: "user", content: text }],
          }),
        });
        if (!res.ok) {
          const back = await addPurse(guest.id, NOTE_PRICE.host);
          return Response.json({ error: "Хозяин не ответил. Ноты вернул.", notes: back?.notes ?? paid.notes + NOTE_PRICE.host }, { status: 502 });
        }
        const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
        const reply = (data.choices?.[0]?.message?.content || "").trim();
        if (!reply) {
          const back = await addPurse(guest.id, NOTE_PRICE.host);
          return Response.json({ error: "Пустой ответ. Ноты вернул.", notes: back?.notes ?? paid.notes + NOTE_PRICE.host }, { status: 502 });
        }
        return Response.json({ text: reply, notes: paid.notes });
      },
    },
  },
});
