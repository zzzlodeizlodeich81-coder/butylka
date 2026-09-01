import { useEffect, useRef, useState } from "react";
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
import { looksLikeLrc, parseLrc } from "@/lib/lyrics-sync";
import { proxyAudio } from "@/lib/suno";
import { importSunoSong } from "@/lib/suno-server";
import { takeAudioFile, prepareKaraokeTrack } from "@/lib/stems";
import { useGame } from "@/lib/store";
import { uid } from "@/lib/utils";

async function syncSongs(artist: string) {
  const saved = await listSavedTracks();
  useGame.getState().replaceCustomSongs(saved.map((t) => songFromSaved(t, artist)));
  return saved;
}

export function BringSong() {
  const toTable = useGame((s) => s.toTable);
  const you = useGame((s) => s.players.find((p) => p.id === s.youId));
  const artist = you?.name ?? "мой трек";
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [sunoUrl, setSunoUrl] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [studio, setStudio] = useState<SavedTrack | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void syncSongs(artist)
      .then(setTracks)
      .catch(() => {
        toast.error("Библиотека на этом устройстве не открылась.");
      });
    return () => stopPreview();
  }, [artist]);

  function acceptFile(next: File | undefined | null) {
    const audio = takeAudioFile(next);
    if (!audio) {
      if (next) toast.error("Нужен аудиофайл — mp3, wav, m4a.");
      return;
    }
    setFile(audio);
    if (!title.trim()) {
      const stem = audio.name.replace(/\.[^.]+$/, "").slice(0, 48);
      if (stem) setTitle(stem);
    }
  }

  async function addFromSuno() {
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`В колоде уже ${LIBRARY_MAX}.`);
      return;
    }
    if (!sunoUrl.trim()) {
      toast.error("Вставь ссылку suno.com/song/… или suno.com/s/…");
      return;
    }
    setBusy(true);
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
      const lines = looksLikeLrc(text) ? parseLrc(text) : undefined;
      const saved: SavedTrack = {
        id,
        title: (title.trim() || hit.title).slice(0, 48),
        lyrics: text,
        duration: duration || hit.duration,
        mime: fileish.type,
        addedAt: Date.now(),
        blob: fileish,
        lines,
        sourceUrl: hit.audioUrl,
      };
      await saveTrack(saved);
      const next = await syncSongs(artist);
      setTracks(next);
      setSunoUrl("");
      setLyrics("");
      toast.success("С Suno в колоде. Можно снять минус без загрузки.");
      playUiTick();
      setStudio(next.find((t) => t.id === id) ?? saved);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Ссылка не открылась.");
    } finally {
      setBusy(false);
    }
  }

  async function addTrack() {
    if (!file) {
      toast.error("Нужен файл песни.");
      return;
    }
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`В колоде уже ${LIBRARY_MAX}. Убери одну — положи другую.`);
      return;
    }
    setBusy(true);
    try {
      const prepared = await prepareKaraokeTrack(file, false);
      const id = uid("mine");
      const lines = looksLikeLrc(lyrics) ? parseLrc(lyrics) : undefined;
      const saved: SavedTrack = {
        id,
        title: (title.trim() || file.name.replace(/\.[^.]+$/, "")).slice(0, 48),
        lyrics: lyrics.trim(),
        duration: prepared.duration,
        mime: file.type || "audio/mpeg",
        addedAt: Date.now(),
        blob: file,
        lines,
      };
      await saveTrack(saved);
      URL.revokeObjectURL(prepared.url);
      const next = await syncSongs(artist);
      setTracks(next);
      setFile(null);
      setTitle("");
      setLyrics("");
      const fresh = next.find((t) => t.id === id) ?? saved;
      toast.success("В колоде. Собери караоке — текст по тактам.");
      playUiTick();
      setStudio(fresh);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не вышло прочитать файл.");
    } finally {
      setBusy(false);
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
        Файл как есть. Собери караоке, спой запись, свари кавер — и неси к столу. Без тактов строки убегут.
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
            <Button type="button" className="rounded-xl" onClick={() => void addFromSuno()} disabled={busy}>
              {busy ? "Забираю с Suno…" : "Забрать с Suno"}
            </Button>
            <p className="text-xs text-subtle">Или свой файл:</p>
            <Input placeholder="Название как в песне" value={title} onChange={(e) => setTitle(e.target.value)} />
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
              onDrop={(e) => {
                e.preventDefault();
                e.stopPropagation();
                acceptFile(e.dataTransfer.files[0]);
              }}
              className="flex min-h-12 items-center justify-between rounded-md border border-border bg-surface-2 px-3 text-left text-sm text-muted"
            >
              <span className="truncate">{file ? file.name : "Файл — mp3, wav, m4a. Можно перетащить."}</span>
            </button>
            <input
              ref={fileRef}
              type="file"
              accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,audio/mp4,audio/aac,audio/ogg,.mp3,.wav,.m4a,.ogg,.aac"
              className="hidden"
              onChange={(e) => {
                acceptFile(e.target.files?.[0]);
                e.target.value = "";
              }}
            />
            <textarea
              value={lyrics}
              onChange={(e) => setLyrics(e.target.value)}
              placeholder="Текст по строкам или LRC [00:12.00] — не обязательно, найдём по названию"
              rows={5}
              className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
            />
            <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void addTrack()} disabled={busy}>
              {busy ? "Читаю файл…" : "Положить в колоду"}
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