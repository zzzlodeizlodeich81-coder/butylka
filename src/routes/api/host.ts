import { createFileRoute } from "@tanstack/react-router";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { NOTE_PRICE } from "@/lib/notes";
import { addPurse, guestFromRequest, spendPurse } from "@/lib/purse.server";

const FALLBACK = `Ты хозяин особняка XXV Kadr. Говоришь коротко, по-русски, как человек у камина, не как справочник.
Если просят стихи или песню, работай так: сначала сочини текст по-английски, с рифмой и размером. Потом сделай литературный поэтический перевод на русский. Смысл, образы и настроение сохрани, рифму подбери заново по-русски, не кальку и не подстрочник.
Игроку отдай только русский текст: название и куплеты. Английский черновик не показывай.
Если просят промпт для генерации музыки, напиши готовый промпт на английском для Suno: жанр, темп, настроение, инструменты, вокал, структура. Сразу под ним короткий русский перевод, о чём этот промпт.
Чужие песни, стихи и чужие треки не копируй. Если это просто разговор, ответь коротко по-русски, без перевода.

Если просят карточку BandLink, пресейв или описание релиза, сначала нужны стиль и материал. Материал — это либо текст песни, либо пересказ своими словами, о чём она. Если стиля или материала нет, карточку не пиши. Попроси стиль и скажи прямо: полный текст можно прислать, а если боишься, что шедевр украдут, своими словами напиши, о чём песня. Этого хватит. Чужой текст целиком в ответ не копируй и в описание не вставляй.
Когда стиль и текст или пересказ уже есть, отдай только то, что человек скопирует в BandLink:
Статус: «Не опубликован», если релиза на площадках ещё нет. «Опубликован» ставь только если трек уже вышел и человек это сказал.
Заголовок.
Короткое описание, строго не длиннее 200 знаков.
Полное описание по-русски.
Полное описание по-английски.
Три-пять тегов по стилю.
Промпт обложки на английском: квадратная картинка, без букв на ней.
Коротко напомни шаги: Страницы, Создать Bandlink, Страницы, Релиз, свой артист, вставить UPC и нажать «Добавить пресейв». Обложка: квадрат, от 500 px, JPG или PNG, не тяжелее 10 Мб.`;

type Turn = { role: "user" | "assistant"; content: string };

async function askModel(system: string, history: Turn[], text: string) {
  const yandexKey = process.env.YANDEX_API_KEY || "";
  const folder = process.env.YANDEX_FOLDER_ID || "";
  const groq = process.env.GROQ_API_KEY || "";
  const xai = process.env.XAI_API_KEY || "";
  const messages = [{ role: "system" as const, content: system }, ...history, { role: "user" as const, content: text }];
  if (yandexKey && folder) {
    const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${yandexKey}`,
        "x-folder-id": folder,
      },
      body: JSON.stringify({
        modelUri: `gpt://${folder}/${process.env.YANDEX_MODEL || "yandexgpt-lite"}/latest`,
        completionOptions: { stream: false, temperature: 0.8, maxTokens: "1600" },
        messages: messages.map((row) => ({ role: row.role, text: row.content })),
      }),
    });
    if (!res.ok) return { ok: false as const, error: `Яндекс не ответил (${res.status}). Ноты вернул.` };
    const data = (await res.json()) as { result?: { alternatives?: { message?: { text?: string } }[] } };
    const reply = (data.result?.alternatives?.[0]?.message?.text || "").trim();
    return reply ? { ok: true as const, text: reply } : { ok: false as const, error: "Пустой ответ. Ноты вернул." };
  }
  if (!groq && !xai) return { ok: false as const, error: "Хозяин сейчас молчит: нет ключа." };
  const res = await fetch(groq ? "https://api.groq.com/openai/v1/chat/completions" : "https://api.x.ai/v1/chat/completions", {
    method: "POST",
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${groq || xai}` },
    body: JSON.stringify({
      model: groq ? process.env.GROQ_MODEL || "qwen/qwen3.8-27b" : process.env.XAI_CHAT_MODEL || "grok-4-fast-non-reasoning",
      temperature: 0.9,
      max_tokens: 1600,
      messages,
    }),
  });
  if (!res.ok) return { ok: false as const, error: `Модель не ответила (${res.status}). Ноты вернул.` };
  const data = (await res.json()) as { choices?: { message?: { content?: string } }[] };
  const reply = (data.choices?.[0]?.message?.content || "").replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  return reply ? { ok: true as const, text: reply } : { ok: false as const, error: "Пустой ответ. Ноты вернул." };
}

async function systemPrompt() {
  const extra = `

Если просят карточку BandLink, пресейв или описание релиза, сначала нужны стиль и материал. Материал — это либо текст песни, либо пересказ своими словами, о чём она. Если стиля или материала нет, карточку не пиши. Попроси стиль и скажи прямо: полный текст можно прислать, а если боишься, что шедевр украдут, своими словами напиши, о чём песня. Этого хватит. Чужой текст целиком в ответ не копируй и в описание не вставляй.
Когда стиль и текст или пересказ уже есть, отдай только то, что человек скопирует в BandLink:
Статус: «Не опубликован», если релиза на площадках ещё нет. «Опубликован» ставь только если трек уже вышел и человек это сказал.
Заголовок.
Короткое описание, строго не длиннее 200 знаков.
Полное описание по-русски.
Полное описание по-английски.
Три-пять тегов по стилю.
Промпт обложки на английском: квадратная картинка, без букв на ней.
Коротко напомни шаги: Страницы, Создать Bandlink, Страницы, Релиз, свой артист, вставить UPC и нажать «Добавить пресейв». Обложка: квадрат, от 500 px, JPG или PNG, не тяжелее 10 Мб.`;
  const fromEnv = (process.env.MANOR_PROMPT || "").trim();
  if (fromEnv) return fromEnv + extra;
  try {
    const file = (await readFile(join(process.cwd(), "data", "manor-prompt.txt"), "utf8")).trim();
    if (file) return file + extra;
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
        const body = (await request.json().catch(() => null)) as { text?: string; history?: Turn[] } | null;
        const text = (body?.text || "").trim().slice(0, 4000);
        if (text.length < 2) return Response.json({ error: "Скажи, о чём писать." }, { status: 400 });
        const history = Array.isArray(body?.history)
          ? body.history
              .filter((row) => row && (row.role === "user" || row.role === "assistant") && typeof row.content === "string")
              .slice(-6)
              .map((row) => ({ role: row.role, content: row.content.slice(0, 4000) }))
          : [];
        const paid = await spendPurse(guest.id, NOTE_PRICE.host);
        if (!paid.ok) return Response.json({ error: paid.error, notes: paid.notes }, { status: 402 });
        const system = await systemPrompt();
        const hit = await askModel(system, history, text);
        if (!hit.ok) {
          const back = await addPurse(guest.id, NOTE_PRICE.host);
          return Response.json({ error: hit.error, notes: back?.notes ?? paid.notes + NOTE_PRICE.host }, { status: 502 });
        }
        return Response.json({ text: hit.text, notes: paid.notes });
      },
    },
  },
});
