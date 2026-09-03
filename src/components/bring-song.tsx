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
import { linesFromAligned, proxyAudio } from "@/lib/suno";
import { pullMinusBlobs, pullSunoAligned } from "@/lib/suno-flow";
import { importSunoSong, pollSunoGenerate, pollSunoLyrics, startSunoGenerate, startSunoLyrics, themeToLyricsPrompt } from "@/lib/suno-server";
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
  const toVerse = useGame((s) => s.toVerse);
  const tableSongs = useGame((s) => s.customSongs);
  const mode = useGame((s) => s.mode);
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
      toast.message("Снимаю минус…");
      const pulled = await pullMinusBlobs({ audioUrl: hit.audioUrl });
      if (pulled) {
        saved.minusBlob = pulled.minusBlob;
        saved.vocalBlob = pulled.vocalBlob ?? saved.vocalBlob;
        saved.sourceUrl = pulled.instrumentalUrl;
      }
      await saveTrack(saved);
      const next = await syncSongs(artist);
      setTracks(next);
      setSunoUrl("");
      setLyrics("");
      toast.success(
        pulled
          ? "С Suno в колоде, минус снят."
          : text
            ? "С Suno в колоде. Минус не снялся — снимешь в студии."
            : "С Suno в колоде. Текст допиши в студии.",
      );
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
    if (!rows.length) {
      toast.error("Тема: хотя бы одна строка. Три — уже отлично, Suno допишет стихи.");
      return;
    }
    setBusy("cook");
    try {
      let lyricsText = rows.join("\n");
      let trackTitle = title.trim().slice(0, 48);
      const asTheme = rows.length < 8;
      if (asTheme) {
        toast.message("Suno пишет стихи по теме…");
        const idea = themeToLyricsPrompt(`${trackTitle}. ${rows.join(" / ")}`);
        const startedLyrics = await startSunoLyrics({ data: { prompt: idea } });
        if (!startedLyrics.ok) throw new Error(startedLyrics.error);
        let poem: { title: string; text: string } | null = null;
        for (let i = 0; i < 24; i++) {
          await new Promise((r) => window.setTimeout(r, 4000));
          const st = await pollSunoLyrics({ data: { taskId: startedLyrics.taskId } });
          if (st.failed) throw new Error("Suno не принял тему.");
          const hit = st.variants.find((v) => v.text.length > 40);
          if (hit) {
            poem = hit;
            break;
          }
          if (st.status === "SUCCESS" && st.variants[0]) {
            poem = st.variants[0];
            break;
          }
        }
        if (!poem) throw new Error("Стихи не пришли. Попробуй ещё раз.");
        lyricsText = poem.text;
        if (poem.title) trackTitle = poem.title.slice(0, 48);
        toast.message("Стихи готовы. Варим трек…");
      }
      const started = await startSunoGenerate({
        data: {
          title: trackTitle,
          style: (style.trim() || "russian pop, party vocal").slice(0, 200),
          lyrics: lyricsText,
        },
      });
      if (!started.ok) throw new Error(started.error);
      let audio: string | null = null;
      let duration = 80;
      let audioId = "";
      for (let i = 0; i < 48; i++) {
        await new Promise((r) => window.setTimeout(r, 4000));
        const st = await pollSunoGenerate({ data: { taskId: started.taskId } });
        if (st.failed) throw new Error("Suno не принял текст.");
        const ready = st.clips.filter((c) => c.audioUrl);
        if (ready.length && (st.status === "SUCCESS" || ready[0].duration > 8)) {
          audio = ready[0].audioUrl;
          duration = ready[0].duration || duration;
          audioId = ready[0].audioId;
          if (st.status === "SUCCESS") break;
        }
      }
      if (!audio) throw new Error("Suno не успел. Попробуй ещё раз.");
      const res = await fetch(proxyAudio(audio));
      if (!res.ok) throw new Error("Не скачался новый трек.");
      const blob = await res.blob();
      if (blob.size < 8000) throw new Error("Не скачался новый трек.");
      const words = audioId ? await pullSunoAligned(started.taskId, audioId) : [];
      const rowsForTime = lyricsText
        .split(/\n/)
        .map((l) => l.replace(/^\[[^\]]+]\s*/, "").trim())
        .filter((l) => l && !/^\[/.test(l));
      const aligned = words.length
        ? linesFromAligned(words, rowsForTime)
        : timedLines(lyricsText, duration) ?? [];
      toast.message("Снимаю минус…");
      const pulled = await pullMinusBlobs({ taskId: started.taskId, audioId, audioUrl: audio });
      const id = uid("suno");
      const saved: SavedTrack = {
        id,
        title: trackTitle,
        lyrics: lyricsText,
        duration,
        mime: blob.type || "audio/mpeg",
        addedAt: Date.now(),
        blob,
        lines: aligned.length ? aligned : undefined,
        sourceUrl: pulled?.instrumentalUrl ?? audio,
        minusBlob: pulled?.minusBlob,
        vocalBlob: pulled?.vocalBlob,
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

  function goVerse() {
    const ready = mode === "net" ? tableSongs.length + tracks.length : tracks.length;
    if (!ready) {
      toast.error("Положи хотя бы один свой трек — петь, пока из строк варится новая.");
      return;
    }
    stopPreview();
    playUiTick();
    toVerse();
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
    <div className="flex flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-3xl text-fg">Караоке-колода</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Каждый кидает свой Suno: ссылка или «сварить». На тестах генерация с общего ключа, потом — за ноты.
        Хиты не кладём.
      </p>
      {mode === "net" && tableSongs.length ? (
        <p className="mt-3 text-xs text-subtle">На столе уже {tableSongs.length} трек(ов) от всех.</p>
      ) : null}

      <div className="mt-5 flex flex-col gap-3">
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
              placeholder="Тема или свои строки. Три строки хватит — Suno допишет стихи с юмором."
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
        <Button
          type="button"
          size="lg"
          className="h-14 rounded-xl"
          onClick={goVerse}
          disabled={mode === "net" ? !tableSongs.length && !tracks.length : !tracks.length}
        >
          {tracks.length || tableSongs.length ? "Дальше — круг строк" : "Сначала свой трек"}
        </Button>
      </div>
    </div>
  );
}