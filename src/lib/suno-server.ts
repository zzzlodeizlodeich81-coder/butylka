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

export type SunoClip = {
  audioId: string;
  audioUrl: string;
  streamUrl?: string;
  duration: number;
  title: string;
  lyrics: string;
};

export const startSunoGenerate = createServerFn({ method: "POST" })
  .validator((input: { title: string; style: string; lyrics: string[] }) => input)
  .handler(async ({ data }) => {
    const prompt = lyricsForSuno(data.lyrics);
    const { res, body } = await sunoFetch("/api/v1/generate", {
      method: "POST",
      body: JSON.stringify({
        customMode: true,
        instrumental: false,
        model: "V5_5",
        callBackUrl: CALLBACK,
        prompt,
        style: data.style.slice(0, 900),
        title: data.title.slice(0, 80),
        duration: 80,
        negativeTags: "podcast, spoken word, audiobook, mumble rap",
        weirdnessConstraint: 0.7,
        styleWeight: 0.6,
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
    const outer = (body.data ?? {}) as Record<string, unknown>;
    const info = (outer.vocal_removal_info ?? outer.response ?? outer) as Record<string, unknown>;
    const flag = String(
      pick(outer, "successFlag", "success_flag", "status") ??
        pick(info, "status") ??
        "PENDING",
    );
    const failed = /FAIL|ERROR/i.test(flag);
    const ready = flag === "SUCCESS" || Boolean(pick(info, "instrumentalUrl", "instrumental_url"));
    return {
      ok: true as const,
      status: flag,
      failed,
      ready,
      instrumentalUrl: pick<string>(info, "instrumentalUrl", "instrumental_url") ?? null,
      vocalUrl: pick<string>(info, "vocalUrl", "vocal_url") ?? null,
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
    const inner = (body.data ?? {}) as Record<string, unknown>;
    const raw = (inner.alignedWords ?? inner.aligned_words ?? []) as Record<string, unknown>[];
    const words: AlignedWord[] = raw
      .map((w) => ({
        word: String(w.word ?? ""),
        startS: Number(w.startS ?? w.start_s ?? 0),
        endS: Number(w.endS ?? w.end_s ?? 0),
      }))
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
    const lyrics = lyricsFromPrompt(String(meta.prompt ?? ""));
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

