import { useEffect, useState } from "react";
import { Play, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KaraokeCook } from "@/components/karaoke-cook";
import { TrackTakes } from "@/components/track-takes";
import { previewFile, playUiTick, stopPreview, unlockAudio } from "@/lib/audio";
import {
  deleteSavedTrack,
  LIBRARY_MAX,
  listSavedTracks,
  saveTrack,
  songFromSaved,
  type SavedTrack,
} from "@/lib/library";
import { linesFromPlain, looksLikeLrc, parseLrc } from "@/lib/lyrics-sync";
import { proxyAudio } from "@/lib/suno";
import { importSunoSong, pollSunoGenerate, startSunoGenerate } from "@/lib/suno-server";
import { prepareKaraokeTrack } from "@/lib/stems";
import { useGame } from "@/lib/store";
import { uid } from "@/lib/utils";

async function syncSongs(artist: string) {
  const saved = await listSavedTracks();
  useGame.getState().replaceCustomSongs(saved.map((t) => songFromSaved(t, artist)));
  return saved;
}

function timedLines(text: string, duration: number) {
  if (looksLikeLrc(text)) return parseLrc(text);
  const rows = text
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  return rows.length ? linesFromPlain(rows, duration || 80) : undefined;
}

export function BringSong() {
  const toTable = useGame((s) => s.toTable);
  const you = useGame((s) => s.players.find((p) => p.id === s.youId));
  const artist = you?.name ?? "мой трек";
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("russian pop, party vocal");
  const [sunoUrl, setSunoUrl] = useState("");
  const [busy, setBusy] = useState<null | "suno" | "cook">(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [studio, setStudio] = useState<SavedTrack | null>(null);

  useEffect(() => {
    void syncSongs(artist)
      .then(setTracks)
      .catch(() => {
        toast.error("Библиотека на этом устройстве не открылась.");
      });
    return () => stopPreview();
  }, [artist]);

  async function addFromSuno() {
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`В колоде уже ${LIBRARY_MAX}.`);
      return;
    }
    if (!sunoUrl.trim()) {
      toast.error("Вставь ссылку suno.com/song/… или suno.com/s/…");
      return;
    }
    setBusy("suno");
    try {
      const hit = await importSunoSong({ data: { url: sunoUrl } });
      if (!hit.ok) throw new Error(hit.error);
      const res = await fetch(proxyAudio(hit.audioUrl));
      if (!res.ok) throw new Error("Не скачался файл с Suno.");
      const blob = await res.blob();
      const ext = hit.audioUrl.includes(".mp4") ? "mp4" : "m4a";
      const mime = ext === "mp4" ? "video/mp4" : blob.type || "audio/mp4";
      const fileish = new File([blob], `${hit.title}.${ext}`, { type: mime });
      let duration = hit.duration || 0;
      try {
        const prepared = await prepareKaraokeTrack(fileish, false);
        duration = prepared.duration || duration;
        URL.revokeObjectURL(prepared.url);
      } catch {
        if (!duration) throw new Error("Файл с Suno пришёл, но браузер не прочитал длину.");
      }
      const id = uid("suno");
      const text = lyrics.trim() || hit.lyrics;
      const saved: SavedTrack = {
        id,
        title: (title.trim() || hit.title).slice(0, 48),
        lyrics: text,
        duration: duration || hit.duration,
        mime: fileish.type,
        addedAt: Date.now(),
        blob: fileish,
        lines: timedLines(text, duration || hit.duration),
        sourceUrl: hit.audioUrl,
      };
      await saveTrack(saved);
      const next = await syncSongs(artist);
      setTracks(next);
      setSunoUrl("");
      setLyrics("");
      toast.success(text ? "С Suno в колоде, текст тоже." : "С Suno в колоде. Текст допиши в студии.");
      playUiTick();
      setStudio(next.find((t) => t.id === id) ?? saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ссылка не открылась.");
    } finally {
      setBusy(null);
    }
  }

  async function cookNew() {
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`В колоде уже ${LIBRARY_MAX}.`);
      return;
    }
    const rows = lyrics
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!title.trim()) {
      toast.error("Название для новой песни.");
      return;
    }
    if (rows.length < 4) {
      toast.error("Нужны хотя бы 4 строки текста — своё, не чужой хит.");
      return;
    }
    setBusy("cook");
    try {
      const started = await startSunoGenerate({
        data: {
          title: title.trim(),
          style: (style.trim() || "russian pop, party vocal").slice(0, 200),
          lyrics: rows,
        },
      });
      if (!started.ok) throw new Error(started.error);
      let audio: string | null = null;
      let duration = 80;
      for (let i = 0; i < 48; i++) {
        await new Promise((r) => window.setTimeout(r, 4000));
        const st = await pollSunoGenerate({ data: { taskId: started.taskId } });
        if (st.failed) throw new Error("Suno не принял текст.");
        const clip = st.clips.find((c) => c.audioUrl);
        if (clip?.audioUrl) {
          audio = clip.audioUrl;
          duration = clip.duration || duration;
          break;
        }
      }
      if (!audio) throw new Error("Suno не успел. Попробуй ещё раз.");
      const res = await fetch(proxyAudio(audio));
      if (!res.ok) throw new Error("Не скачался новый трек.");
      const blob = await res.blob();
      const id = uid("suno");
      const text = rows.join("\n");
      const saved: SavedTrack = {
        id,
        title: title.trim().slice(0, 48),
        lyrics: text,
        duration,
        mime: blob.type || "audio/mpeg",
        addedAt: Date.now(),
        blob,
        lines: timedLines(text, duration),
        sourceUrl: audio,
      };
      await saveTrack(saved);
      const next = await syncSongs(artist);
      setTracks(next);
      setTitle("");
      setLyrics("");
      toast.success("Новый трек в колоде.");
      playUiTick();
      setStudio(next.find((t) => t.id === id) ?? saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не сварился трек.");
    } finally {
      setBusy(null);
    }
  }

  async function remove(id: string) {
    stopPreview();
    setPlayingId(null);
    await deleteSavedTrack(id);
    setTracks(await syncSongs(artist));
  }

  function hear(track: SavedTrack) {
    unlockAudio();
    const song = songFromSaved(track, artist);
    if (!song.audioUrl) return;
    if (playingId === track.id) {
      stopPreview();
      setPlayingId(null);
      return;
    }
    previewFile(song.audioUrl);
    setPlayingId(track.id);
  }

  function goTable() {
    if (!tracks.length) {
      toast.error("Положи хотя бы один свой трек.");
      return;
    }
    stopPreview();
    playUiTick();
    toTable();
  }

  if (studio) {
    return (
      <KaraokeCook
        track={studio}
        onClose={() => setStudio(null)}
        onSaved={(next) => {
          setStudio(next);
          void syncSongs(artist).then(setTracks);
        }}
      />
    );
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-3xl text-fg">Караоке-колода</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Только Suno: ссылка на публичный трек или сварить новый. Хиты не кладём — минус чужой песни это уже авторское.
      </p>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        {tracks.map((track) => (
          <div key={track.id} className="rounded-xl border border-border bg-surface px-3 py-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                className="grid size-10 shrink-0 place-items-center rounded-full bg-surface-2 text-accent"
                onClick={() => hear(track)}
                aria-label={playingId === track.id ? "Стоп" : "Слушать"}
              >
                <Play className="size-4" />
              </button>
              <div className="min-w-0 flex-1">
                <p className="truncate font-medium text-fg">{track.title}</p>
                <p className="text-xs text-subtle">
                  {Math.round(track.duration)}с
                  {track.minusBlob ? " · минус" : " · оригинал"}
                  {track.lines?.length ? " · по тактам" : " · без тактов"}
                </p>
              </div>
              <button
                type="button"
                className="grid size-10 shrink-0 place-items-center text-muted"
                onClick={() => void remove(track.id)}
                aria-label="Убрать"
              >
                <Trash2 className="size-4" />
              </button>
            </div>
            <Button
              type="button"
              variant="secondary"
              className="mt-2 w-full rounded-xl"
              onClick={() => {
                stopPreview();
                setStudio(track);
              }}
            >
              Собрать караоке
            </Button>
            <TrackTakes track={track} className="mt-2" />
          </div>
        ))}

        {tracks.length < LIBRARY_MAX ? (
          <>
            <Input
              placeholder="Ссылка suno.com/song/… или suno.com/s/…"
              value={sunoUrl}
              onChange={(e) => setSunoUrl(e.target.value)}
            />
            <Button type="button" className="rounded-xl" onClick={() => void addFromSuno()} disabled={Boolean(busy)}>
              {busy === "suno" ? "Забираю с Suno…" : "Забрать с Suno"}
            </Button>
            <p className="text-xs text-subtle">Или сварить новый — свой текст, не чужой хит.</p>
            <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="Стиль: russian pop, disco…" value={style} onChange={(e) => setStyle(e.target.value)} />
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Свои строки, по одной на линию. Минимум четыре."
              rows={5}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
            />
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void cookNew()} disabled={Boolean(busy)}>
              {busy === "cook" ? "Suno варит… минута-две" : "Сварить трек в Suno"}
            </Button>
          </>
        ) : (
          <p className="text-sm text-subtle">Три трека — хватит на круг. Убери один, если хочешь другой.</p>
        )}
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button type="button" size="lg" className="h-14 rounded-xl" onClick={goTable} disabled={!tracks.length}>
          {tracks.length ? `За стол · ${tracks.length}` : "Сначала свой трек"}
        </Button>
      </div>
    </div>
  );
}