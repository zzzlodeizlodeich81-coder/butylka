import { createServerFn } from "@tanstack/react-start";
import { buildSong, parseGenre, type Genre, type Song } from "@/lib/songs";
import { uid } from "@/lib/utils";

export type NonsenseLine = {
  name: string;
  text: string;
  late?: boolean;
};

type CookOk = {
  ok: true;
  song: Song;
  sunoPrompt: string;
};

type CookFail = {
  ok: false;
  error: string;
};

function localCook(lines: NonsenseLine[]): CookOk {
  const raw = lines.map((l) => l.text.trim()).filter((t) => t && t !== "…");
  const hook = raw[0] || "бред на столе";
  const texts = [
    hook,
    raw[1] || "никто не успел рифму",
    raw[2] || "секунды кончились",
    raw[3] || "нота уже снята",
    "это наш бред на столе",
    "это наш бред на столе",
    raw[4] || "бутылка уже чернеет",
    "пой пока не стемнело",
  ];
  const song = buildSong({
    id: uid("omen"),
    title: hook.slice(0, 28) || "Бред стола",
    artist: "чёрная бутылка",
    genre: "hyperpop",
    bpm: 124,
    mood: "бред стола",
    texts,
    generated: true,
  });
  return {
    ok: true,
    song,
    sunoPrompt: `chaotic party karaoke, hyperpop, raw group vocal, based on nonsense: ${hook}`,
  };
}

export const cookFromNonsense = createServerFn({ method: "POST" })
  .validator((input: { lines: NonsenseLine[] }) => input)
  .handler(async ({ data }): Promise<CookOk | CookFail> => {
    const apiKey = process.env.XAI_API_KEY;
    if (!apiKey) return localCook(data.lines);

    const blob = data.lines
      .map((l) => `${l.name}: ${l.text}${l.late ? " (не успел)" : ""}`)
      .join("\n");

    try {
      const res = await fetch("https://api.x.ai/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      signal: AbortSignal.timeout(9000),
      body: JSON.stringify({
        model: "grok-4.5",
        temperature: 1,
        max_tokens: 900,
        messages: [
          {
            role: "system",
            content:
              "Ты делаешь вечериночные песни из пьяного бреда. Не исправляй смысл строк стола — усиливай его. Только оригинал. Ответ — один JSON без markdown.",
          },
          {
            role: "user",
            content: `Стол наговорил по кругу, у каждого была 10 секунд, рифма не обязательна:

${blob}

Свари из этого песню для караоке и промпт для Suno.
JSON:
{"title":"...","artist":"вымышленное имя","genre":"synthpop|ballad|disco|rnb|indie|hyperpop|lofi","bpm":число 84-140,"lines":["строка", "..."],"sunoPrompt":"английский промпт 1-2 предложения: genre, vocal, mood, instruments"}
Правила: 8–10 русских строк до 36 символов, припев из двух строк повторяется, в тексте слышны образы со стола, без чужих хитов, без эмодзи.`,
          },
        ],
      }),
    });

    if (!res.ok) return localCook(data.lines);

    const body = (await res.json()) as {
      choices?: { message?: { content?: string } }[];
    };
    const text = body.choices?.[0]?.message?.content ?? "";
    const match = text.match(/\{[\s\S]*\}/);
    if (!match) return localCook(data.lines);

    try {
      const parsed = JSON.parse(match[0]) as {
        title?: string;
        artist?: string;
        genre?: string;
        bpm?: number;
        lines?: unknown;
        sunoPrompt?: string;
      };
      const lines = Array.isArray(parsed.lines)
        ? parsed.lines.map((l) => String(l).trim()).filter(Boolean).slice(0, 12)
        : [];
      if (!parsed.title || lines.length < 6) return localCook(data.lines);
      const bpm = Math.min(140, Math.max(84, Math.round(Number(parsed.bpm) || 118)));
      const song = buildSong({
        id: uid("omen"),
        title: String(parsed.title).slice(0, 48),
        artist: String(parsed.artist || "чёрная бутылка").slice(0, 32),
        genre: parseGenre(String(parsed.genre || "hyperpop")) as Genre,
        bpm,
        mood: "бред стола",
        texts: lines,
        generated: true,
      });
      return {
        ok: true,
        song,
        sunoPrompt: String(parsed.sunoPrompt || "party karaoke, raw vocal, chaotic energy").slice(0, 400),
      };
    } catch {
      return localCook(data.lines);
    }
    } catch {
      return localCook(data.lines);
    }
  });
