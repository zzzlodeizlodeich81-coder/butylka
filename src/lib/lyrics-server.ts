import { createServerFn } from "@tanstack/react-start";

type LrcHit = {
  name: string;
  artistName?: string;
  artist?: string;
  duration: number;
  instrumental?: boolean;
  syncedLyrics: string | null;
  plainLyrics: string | null;
};

export const findSyncedLyrics = createServerFn({ method: "POST" })
  .validator((input: { title: string; artist?: string; duration?: number }) => input)
  .handler(async ({ data }) => {
    const title = data.title.trim();
    if (!title) return { ok: false as const, error: "Нужно название." };
    const artist = data.artist?.trim() ?? "";
    const params = new URLSearchParams();
    params.set("q", artist ? `${title} ${artist}` : title);
    params.set("track_name", title);
    if (artist) params.set("artist_name", artist);
    const res = await fetch(`https://lrclib.net/api/search?${params.toString()}`, {
      headers: {
        Accept: "application/json",
        "User-Agent": "Butyločka/1.0 (https://butylka.vercel.app; karaoke lyrics)",
      },
    });
    if (!res.ok) return { ok: false as const, error: "Каталог текстов не ответил." };
    const raw = (await res.json()) as LrcHit[];
    if (!Array.isArray(raw) || !raw.length) {
      return { ok: false as const, error: "Не нашли текст по названию." };
    }
    const want = data.duration ?? 0;
    const ranked = [...raw].sort((a, b) => {
      const aSync = a.syncedLyrics?.trim() ? 0 : 1;
      const bSync = b.syncedLyrics?.trim() ? 0 : 1;
      if (aSync !== bSync) return aSync - bSync;
      const aInst = a.instrumental ? 1 : 0;
      const bInst = b.instrumental ? 1 : 0;
      if (aInst !== bInst) return aInst - bInst;
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
      artist: hit.artistName || hit.artist || "",
      duration: hit.duration,
      syncedLyrics: synced || null,
      plainLyrics: plain || null,
    };
  });
