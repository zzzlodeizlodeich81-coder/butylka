import { createServerFn } from "@tanstack/react-start";

type LrcHit = {
  name: string;
  artist: string;
  duration: number;
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

export const findSyncedLyrics = createServerFn({ method: "GET" })
  .validator((input: { title: string; duration?: number }) => input)
  .handler(async ({ data }) => {
    const title = data.title.trim();
    if (!title) return { ok: false as const, error: "Нужно название." };
    const url = `https://lrclib.net/api/search?track_name=${encodeURIComponent(title)}`;
    const res = await fetch(url, {
      headers: { "User-Agent": "Butylka karaoke (party table app)" },
    });
    if (!res.ok) return { ok: false as const, error: "Каталог текстов не ответил." };
    const raw = (await res.json()) as LrcHit[];
    if (!Array.isArray(raw) || !raw.length) {
      return { ok: false as const, error: "Не нашли текст по названию." };
    }
    const want = data.duration ?? 0;
    const ranked = [...raw].sort((a, b) => {
      const aSync = a.syncedLyrics ? 0 : 1;
      const bSync = b.syncedLyrics ? 0 : 1;
      if (aSync !== bSync) return aSync - bSync;
      if (want > 0) return Math.abs((a.duration || 0) - want) - Math.abs((b.duration || 0) - want);
      return 0;
    });
    const hit = ranked[0];
    const synced = hit.syncedLyrics?.trim() || "";
    const plain = hit.plainLyrics?.trim() || "";
    if (!synced && !plain) return { ok: false as const, error: "Текст пустой." };
    return {
      ok: true as const,
      name: hit.name,
      artist: hit.artist,
      duration: hit.duration,
      syncedLyrics: synced || null,
      plainLyrics: plain || null,
    };
  });
