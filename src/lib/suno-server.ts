import { createServerFn } from "@tanstack/react-start";
import type { AlignedWord } from "@/lib/suno";

const SUNO_BASE = "https://api.sunoapi.org";
const CALLBACK = "https://httpbin.org/post";

function sunoKey() {
  return process.env.SUNO_API_KEY || "";
}

function pick<T>(obj: Record<string, unknown> | null | undefined, ...keys: string[]): T | undefined {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== "") return v as T;
  }
  return undefined;
}

async function sunoFetch(path: string, init?: RequestInit) {
  const res = await fetch(`${SUNO_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${sunoKey()}`,
      "Content-Type": "application/json",
      ...(init?.headers ?? {}),
    },
  });
  const body = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  return { res, body };
}

export function lyricsForSuno(lines: string[]) {
  const clean = lines.map((l) => l.trim()).filter(Boolean).slice(0, 12);
  const verseA = clean.slice(0, 4);
  const chorus = clean.slice(4, 6);
  const verseB = clean.slice(6, 10);
  const parts = ["[Verse]", ...verseA];
  if (chorus.length) parts.push("", "[Chorus]", ...chorus);
  if (verseB.length) parts.push("", "[Verse]", ...verseB);
  if (chorus.length) parts.push("", "[Chorus]", ...chorus);
  return parts.join("\n").slice(0, 4800);
}

function lyricsPrompt(lyrics: string[] | string) {
  if (typeof lyrics === "string") {
    if (/\[(Verse|Chorus|Bridge|Intro|Outro)\]/i.test(lyrics)) return lyrics.slice(0, 4800);
    return lyricsForSuno(lyrics.split(/\n/).map((l) => l.trim()).filter(Boolean));
  }
  return lyricsForSuno(lyrics);
}

export type SunoClip = {
  audioId: string;
  audioUrl: string;
  streamUrl?: string;
  duration: number;
  title: string;
  lyrics: string;
};

export function themeToLyricsPrompt(theme: string) {
  const clean = theme.replace(/\s+/g, " ").trim();
  return `Весёлая русская песня с юмором, живые рифмы, правильные ударения, не корявый перевод. Тема: ${clean}`.slice(
    0,
    200,
  );
}

function vocalGenderFromStyle(style: string): "m" | "f" | undefined {
  if (/женск|female|\bgirl\b|\bwom/i.test(style)) return "f";
  if (/мужск|male|\bman\b|\bmale vocal/i.test(style)) return "m";
  return undefined;
}

export const startSunoGenerate = createServerFn({ method: "POST" })
  .validator((input: { title: string; style: string; lyrics: string[] | string }) => input)
  .handler(async ({ data }) => {
    const prompt = lyricsPrompt(data.lyrics);
    const gender = vocalGenderFromStyle(data.style);
    const style = `${data.style}, clear russian vocals, correct word stress, sung not spoken`.slice(0, 1000);
    const { res, body } = await sunoFetch("/api/v1/generate", {
      method: "POST",
      body: JSON.stringify({
        customMode: true,
        instrumental: false,
        model: "V5_5",
        callBackUrl: CALLBACK,
        prompt,
        style,
        title: data.title.slice(0, 100),
        duration: 80,
        negativeTags: "podcast, spoken word, audiobook, mumble rap, robotic, off-key",
        weirdnessConstraint: 0.18,
        styleWeight: 0.5,
        ...(gender ? { vocalGender: gender } : {}),
      }),
    });
    const code = Number(body.code ?? res.status);
    const taskId = pick<string>(body.data as Record<string, unknown>, "taskId", "task_id");
    if (code !== 200 || !taskId) {
      const msg = String(body.msg ?? `Suno ${code}`);
      return { ok: false as const, error: msg };
    }
    return { ok: true as const, taskId };
  });

export const startSunoLyrics = createServerFn({ method: "POST" })
  .validator((input: { prompt: string }) => input)
  .handler(async ({ data }) => {
    const { res, body } = await sunoFetch("/api/v1/lyrics", {
      method: "POST",
      body: JSON.stringify({
        prompt: data.prompt.slice(0, 200),
        callBackUrl: CALLBACK,
      }),
    });
    const code = Number(body.code ?? res.status);
    const taskId = pick<string>(body.data as Record<string, unknown>, "taskId", "task_id");
    if (code !== 200 || !taskId) {
      return { ok: false as const, error: String(body.msg ?? `Suno ${code}`) };
    }
    return { ok: true as const, taskId };
  });

export const pollSunoLyrics = createServerFn({ method: "GET" })
  .validator((input: { taskId: string }) => input)
  .handler(async ({ data }) => {
    const { body } = await sunoFetch(
      `/api/v1/lyrics/record-info?taskId=${encodeURIComponent(data.taskId)}`,
    );
    const outer = (body.data ?? {}) as Record<string, unknown>;
    const response = (outer.response ?? outer) as Record<string, unknown>;
    const status = String(pick(response, "status") ?? pick(outer, "status") ?? "PENDING");
    const failed = /FAIL|ERROR|SENSITIVE/i.test(status);
    const raw = (pick<unknown[]>(response, "data") ?? []) as Record<string, unknown>[];
    const variants = raw
      .map((v) => ({
        title: String(pick(v, "title") ?? ""),
        text: String(pick(v, "text", "lyrics") ?? ""),
        status: String(pick(v, "status") ?? ""),
      }))
      .filter((v) => v.text.replace(/\s+/g, " ").trim().length > 24);
    return { ok: true as const, status, failed, variants };
  });

export const pollSunoGenerate = createServerFn({ method: "GET" })
  .validator((input: { taskId: string }) => input)
  .handler(async ({ data }) => {
    const { body } = await sunoFetch(
      `/api/v1/generate/record-info?taskId=${encodeURIComponent(data.taskId)}`,
    );
    const outer = (body.data ?? {}) as Record<string, unknown>;
    const response = (outer.response ?? outer) as Record<string, unknown>;
    const status = String(pick(response, "status") ?? pick(outer, "status") ?? "PENDING");
    const failed = /FAIL|ERROR|SENSITIVE/i.test(status);
    const raw = (pick<unknown[]>(response, "sunoData", "suno_data") ?? []) as Record<
      string,
      unknown
    >[];
    const clips: SunoClip[] = raw
      .map((c) => {
        const audioUrl = String(pick(c, "audioUrl", "audio_url", "sourceAudioUrl") ?? "");
        const streamUrl = String(pick(c, "streamAudioUrl", "stream_audio_url") ?? "");
        const audioId = String(pick(c, "id", "audioId") ?? "");
        return {
          audioId,
          audioUrl: audioUrl || streamUrl,
          streamUrl: streamUrl || undefined,
          duration: Number(pick(c, "duration") ?? 0),
          title: String(pick(c, "title") ?? ""),
          lyrics: String(pick(c, "prompt") ?? ""),
        };
      })
      .filter((c) => c.audioId && c.audioUrl);
    return { ok: true as const, status, failed, clips };
  });

export const startSunoStems = createServerFn({ method: "POST" })
  .validator((input: { taskId?: string; audioId?: string; audioUrl?: string }) => input)
  .handler(async ({ data }) => {
    const payload = data.audioUrl
      ? {
          audioUrl: data.audioUrl,
          type: "separate_vocal",
          callBackUrl: CALLBACK,
        }
      : {
          taskId: data.taskId,
          audioId: data.audioId,
          type: "separate_vocal",
          callBackUrl: CALLBACK,
        };
    const { body, res } = await sunoFetch("/api/v1/vocal-removal/generate", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    const code = Number(body.code ?? res.status);
    const stemTaskId = pick<string>(body.data as Record<string, unknown>, "taskId", "task_id");
    if (code !== 200 || !stemTaskId) {
      return { ok: false as const, error: String(body.msg ?? "Не вышло снять минус") };
    }
    return { ok: true as const, taskId: stemTaskId };
  });

export const startSunoCover = createServerFn({ method: "POST" })
  .validator((input: { audioUrl: string; title: string; lyrics: string; duration: number }) => input)
  .handler(async ({ data }) => {
    const lines = data.lyrics
      .split(/\n/)
      .map((l) => l.trim())
      .filter((l) => l && !/^\[[^\]]+]$/.test(l));
    const prompt = lines.length ? lyricsForSuno(lines) : data.lyrics.slice(0, 800);
    const duration = Math.min(360, Math.max(20, Math.round(data.duration) || 80));
    const { res, body } = await sunoFetch("/api/v1/generate/upload-cover", {
      method: "POST",
      body: JSON.stringify({
        uploadUrl: data.audioUrl,
        customMode: true,
        instrumental: false,
        model: "V5_5",
        callBackUrl: CALLBACK,
        prompt: prompt || "karaoke cover, keep the singer",
        style: "karaoke cover, keep original melody and the singer's voice, studio mix",
        title: data.title.slice(0, 80) || "Cover",
        audioWeight: 0.8,
        styleWeight: 0.45,
        weirdnessConstraint: 0.35,
        duration,
        negativeTags: "podcast, spoken word, audiobook",
      }),
    });
    const code = Number(body.code ?? res.status);
    const taskId = pick<string>(body.data as Record<string, unknown>, "taskId", "task_id");
    if (code !== 200 || !taskId) {
      return { ok: false as const, error: String(body.msg ?? "Кавер не приняли.") };
    }
    return { ok: true as const, taskId };
  });

export const pollSunoStems = createServerFn({ method: "GET" })
  .validator((input: { taskId: string }) => input)
  .handler(async ({ data }) => {
    const { body } = await sunoFetch(
      `/api/v1/vocal-removal/record-info?taskId=${encodeURIComponent(data.taskId)}`,
    );
    const outer = (body.data ?? body) as Record<string, unknown>;
    const response = (outer.response ?? outer) as Record<string, unknown>;
    const info = (response.vocal_removal_info ??
      outer.vocal_removal_info ??
      response) as Record<string, unknown>;
    const flag = String(
      pick(outer, "successFlag", "success_flag", "status") ??
        pick(response, "status") ??
        pick(info, "status") ??
        "PENDING",
    );
    const n = Number(flag);
    const failed = n === 2 || /FAIL|ERROR/i.test(flag);
    const instrumentalUrl =
      pick<string>(info, "instrumentalUrl", "instrumental_url") ??
      pick<string>(response, "instrumentalUrl", "instrumental_url") ??
      pick<string>(outer, "instrumentalUrl", "instrumental_url") ??
      null;
    const vocalUrl =
      pick<string>(info, "vocalUrl", "vocal_url") ??
      pick<string>(response, "vocalUrl", "vocal_url") ??
      null;
    const ready = n === 1 || /SUCCESS|COMPLETE/i.test(flag) || Boolean(instrumentalUrl);
    return {
      ok: true as const,
      status: flag,
      failed,
      ready,
      instrumentalUrl,
      vocalUrl,
    };
  });

export const getSunoTimestamps = createServerFn({ method: "POST" })
  .validator((input: { taskId: string; audioId: string }) => input)
  .handler(async ({ data }) => {
    const { body, res } = await sunoFetch("/api/v1/generate/get-timestamped-lyrics", {
      method: "POST",
      body: JSON.stringify({ taskId: data.taskId, audioId: data.audioId }),
    });
    if (!res.ok && Number(body.code) !== 200) return { ok: false as const, words: [] as AlignedWord[] };
    const inner = (body.data ?? body) as Record<string, unknown>;
    const nested = (inner.data ?? inner.response ?? inner) as Record<string, unknown>;
    const raw = (nested.alignedWords ??
      nested.aligned_words ??
      inner.alignedWords ??
      inner.aligned_words ??
      []) as Record<string, unknown>[];
    const words: AlignedWord[] = raw
      .map((w) => {
        const startS = Number(w.startS ?? w.start_s ?? w.start ?? 0);
        const endS = Number(w.endS ?? w.end_s ?? w.end ?? 0);
        return {
          word: String(w.word ?? w.text ?? ""),
          startS: startS > 400 ? startS / 1000 : startS,
          endS: endS > 400 ? endS / 1000 : endS,
        };
      })
      .filter((w) => w.word);
    return { ok: true as const, words };
  });

const UUID =
  /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function parseSunoClipId(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  const fromSong = text.match(/suno\.(?:com|ai)\/(?:song|songs)\/([0-9a-f-]{8,})/i);
  if (fromSong?.[1] && UUID.test(fromSong[1])) return fromSong[1].toLowerCase();
  const fromCdn = text.match(/cdn\d?\.suno\.ai\/(?:image_)?([0-9a-f-]{36})/i);
  if (fromCdn?.[1]) return fromCdn[1].toLowerCase();
  const bare = text.match(UUID);
  return bare ? bare[0].toLowerCase() : "";
}

function parseShareCode(raw: string) {
  const m = raw.trim().match(/suno\.(?:com|ai)\/s\/([A-Za-z0-9_-]{6,})/);
  return m?.[1] ?? "";
}

async function resolveSunoClipId(raw: string) {
  const direct = parseSunoClipId(raw);
  if (direct) return direct;
  const share = parseShareCode(raw);
  if (!share) return "";
  const res = await fetch(`https://suno.com/s/${share}`, {
    method: "GET",
    redirect: "manual",
    headers: { "User-Agent": "Mozilla/5.0 Butylka" },
  });
  const loc = res.headers.get("location") ?? "";
  return parseSunoClipId(loc) || parseSunoClipId(`https://suno.com${loc}`);
}

function lyricsFromPrompt(prompt: string) {
  return prompt
    .split(/\n/)
    .map((l) => l.trim())
    .filter((l) => l && !/^\[[^\]]+]$/.test(l))
    .join("\n")
    .slice(0, 8000);
}

function pickClipLyrics(clip: Record<string, unknown>, meta: Record<string, unknown>) {
  const raw = [meta.prompt, meta.lyrics, clip.lyrics, meta.display_prompt]
    .map((v) => (typeof v === "string" ? lyricsFromPrompt(v) : ""))
    .filter((t) => t.split(/\n/).filter(Boolean).length >= 2);
  raw.sort((a, b) => b.length - a.length);
  return raw[0] ?? "";
}

export const importSunoSong = createServerFn({ method: "POST" })
  .validator((input: { url: string }) => input)
  .handler(async ({ data }) => {
    const id = await resolveSunoClipId(data.url);
    if (!id) return { ok: false as const, error: "Нужна ссылка suno.com/song/… или suno.com/s/…" };
    const res = await fetch(`https://studio-api.prod.suno.com/api/clip/${id}`, {
      headers: { "User-Agent": "Mozilla/5.0 Butylka" },
    });
    if (!res.ok) return { ok: false as const, error: "Suno не отдал этот клип. Проверь, что песня публичная." };
    const clip = (await res.json()) as Record<string, unknown>;
    if (clip.is_trashed) return { ok: false as const, error: "Клип уже стёрт." };
    const meta = (clip.metadata ?? {}) as Record<string, unknown>;
    const videoUrl = String(clip.video_url ?? "");
    const media = (clip.media_urls ?? []) as { url?: string; content_type?: string }[];
    const m4a = media.find((m) => /m4a/i.test(m.content_type ?? "") || /\.m4a(\?|$)/i.test(m.url ?? ""));
    const mp3 = media.find((m) => /mp3/i.test(m.content_type ?? "") || /\.mp3(\?|$)/i.test(m.url ?? ""));
    const audioUrl = /\.mp4(\?|$)/i.test(videoUrl)
      ? videoUrl
      : m4a?.url || mp3?.url || "";
    if (!audioUrl || /forbidden/i.test(audioUrl)) {
      return { ok: false as const, error: "У клипа нет открытого файла." };
    }
    const title = String(clip.title ?? "Suno").slice(0, 48) || "Suno";
    const artist = String(clip.display_name || clip.handle || "suno").slice(0, 48);
    const duration = Number(meta.duration ?? 0);
    const lyrics = pickClipLyrics(clip, meta);
    return {
      ok: true as const,
      clipId: id,
      title,
      artist,
      duration,
      lyrics,
      audioUrl,
    };
  });

