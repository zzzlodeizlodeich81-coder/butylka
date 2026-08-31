import { createServerFn } from "@tanstack/react-start";
import { buildSong, parseGenre, type Genre } from "@/lib/songs";
import { uid } from "@/lib/utils";

export const MOODS = [
  { id: "party", label: "вечеринка" },
  { id: "longing", label: "тоска" },
  { id: "flirt", label: "флирт" },
  { id: "absurd", label: "абсурд" },
  { id: "city", label: "ночной город" },
] as const;

type GenOk = {
  ok: true;
  song: ReturnType<typeof buildSong>;
};

type GenFail = {
  ok: false;
  error: string;
};

export const generateSong = createServerFn({ method: "POST" })
  .validator((input: { mood: string }) => input)
  .handler(async ({ data }): Promise<GenOk | GenFail> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) {
      return { ok: false, error: "Генерация сейчас недоступна. Возьми трек из каталога или вставь свой." };
    }

    const mood =
      MOODS.find((m) => m.id === data.mood || m.label === data.mood)?.label ?? "вечеринка";

    const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 0.95,
        max_tokens: 700,
        messages: [
          {
            role: "system",
            content:
              "Ты автор коротких русских песен для вечериночного караоке. Только оригинал, никаких чужих хитов, названий известных песен и цитат. Ответ — один JSON-объект без markdown.",
          },
          {
            role: "user",
            content: `Напиши песню для караоке, настроение: ${mood}.
Формат JSON:
{"title":"...", "artist":"вымышленное имя нейросети-исполнителя", "genre":"synthpop|ballad|disco|rnb|indie|hyperpop|lofi", "bpm":число 76-138, "lines":["строка", "..."]}
Правила: 8–10 строк, каждая до 34 символов, есть повторяющийся припев из 2 строк, разговорный русский, без английского кроме жанра, без эмодзи.`,
          },
        ],
      }),
    });

    if (!res.ok) {
      return { ok: false, error: "Нейросеть не ответила. Попробуй ещё раз." };
    }

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return { ok: false, error: "Не получилось разобрать текст. Ещё раз." };

    try {
      const parsed = JSON.parse(match[0]) as {
        title?: string;
        artist?: string;
        genre?: string;
        bpm?: number;
        lines?: unknown;
      };
      const lines = Array.isArray(parsed.lines)
        ? parsed.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 12)
        : [];
      if (!parsed.title || lines.length < 6) {
        return { ok: false, error: "Песня вышла слишком короткой. Ещё раз." };
      }
      const bpm = Math.min(138, Math.max(76, Math.round(Number(parsed.bpm) || 110)));
      const song = buildSong({
        id: uid("gen"),
        title: String(parsed.title).slice(0, 48),
        artist: String(parsed.artist || "модель без имени").slice(0, 32),
        genre: parseGenre(String(parsed.genre || "indie")) as Genre,
        bpm,
        mood,
        texts: lines,
        generated: true,
      });
      return { ok: true, song };
    } catch {
      return { ok: false, error: "Не получилось разобрать текст. Ещё раз." };
    }
  });
