import { useEffect, useRef, useState } from "react";
import { Mic, Music, Play, Trash2, Upload } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { KaraokeCook } from "@/components/karaoke-cook";
import { TrackTakes } from "@/components/track-takes";
import { previewFile, playUiTick, stopPreview, unlockAudio } from "@/lib/audio";
import {
  LIBRARY_MAX,
  deleteSavedTrack,
  downloadBlob,
  fileNameFor,
  listSavedTracks,
  saveTrack,
  songFromSaved,
  type SavedTrack,
} from "@/lib/library";
import { linesFromPlain, looksLikeLrc, parseLrc } from "@/lib/lyrics-sync";
import { cookCost, NOTE_PRICE } from "@/lib/notes";
import { linesFromAligned, proxyAudio } from "@/lib/suno";
import { pullMinusBlobs, pullSunoAligned } from "@/lib/suno-flow";
import { prepareKaraokeTrack, takeAudioFile } from "@/lib/stems";
import { useGame } from "@/lib/store";
import {
  importSunoSong,
  pollSunoGenerate,
  pollSunoLyrics,
  startSunoCover,
  startSunoGenerate,
  startSunoLyrics,
  themeToLyricsPrompt,
} from "@/lib/suno-server";
import { uid } from "@/lib/utils";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";

type Desk = "home" | "cook" | "voice" | "file";

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

function paidFail(err: { error?: string; needNotes?: number } | unknown) {
  const rec = err && typeof err === "object" ? (err as { error?: string; needNotes?: number; message?: string }) : {};
  toast.error(rec.error || rec.message || "Не вышло.");
  if (rec.needNotes) useWallet.getState().setShop(true);
  void refreshWallet();
}

async function hostFile(blob: Blob, name = "track.mp3") {
  const form = new FormData();
  form.append("file", new File([blob], name, { type: blob.type || "audio/mpeg" }));
  const res = await fetch("/api/host-audio", { method: "POST", body: form });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!json.ok || !json.url) throw new Error(json.error || "Не выложился файл.");
  return json.url;
}

async function blobFromFile(file: File): Promise<SavedTrack> {
  const prepared = await prepareKaraokeTrack(file, false);
  const id = uid("file");
  return {
    id,
    title: file.name.replace(/\.[^.]+$/, "").slice(0, 48) || "мой трек",
    lyrics: "",
    duration: prepared.duration,
    mime: file.type || "audio/mpeg",
    addedAt: Date.now(),
    blob: file,
    sourceUrl: prepared.url,
  };
}

export function BringSong() {
  const toLobby = useGame((s) => s.toLobby);
  const you = useGame((s) => s.players.find((p) => p.id === s.youId));
  const artist = you?.name ?? "мой трек";
  const notes = useWallet((s) => s.notes);
  const setShop = useWallet((s) => s.setShop);
  const [tracks, setTracks] = useState<SavedTrack[]>([]);
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [style, setStyle] = useState("russian pop, party vocal");
  const [sunoUrl, setSunoUrl] = useState("");
  const [busy, setBusy] = useState<null | "suno" | "cook" | "file" | "cover">(null);
  const [playingId, setPlayingId] = useState<string | null>(null);
  const [studio, setStudio] = useState<SavedTrack | null>(null);
  const [desk, setDesk] = useState<Desk>("home");
  const fileRef = useRef<HTMLInputElement>(null);
  const coverFileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void syncSongs(artist)
      .then(setTracks)
      .catch(() => {
        toast.error("Библиотека на этом устройстве не открылась.");
      });
    return () => stopPreview();
  }, [artist]);

  async function persist(saved: SavedTrack) {
    await saveTrack(saved);
    downloadBlob(saved.blob, fileNameFor(saved.title, "plus", saved.mime));
    if (saved.minusBlob) {
      downloadBlob(saved.minusBlob, fileNameFor(saved.title, "minus", saved.minusBlob.type || "audio/mpeg"));
    }
    if (saved.coverBlob) {
      downloadBlob(saved.coverBlob, fileNameFor(saved.title, "cover", saved.coverBlob.type || "audio/mpeg"));
    }
    const next = await syncSongs(artist);
    setTracks(next);
    void refreshWallet();
    return next.find((t) => t.id === saved.id) ?? saved;
  }

  async function addFromSuno() {
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`Уже ${LIBRARY_MAX} треков. Убери один.`);
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
      const saved: SavedTrack = {
        id: uid("suno"),
        title: (title.trim() || hit.title).slice(0, 48),
        lyrics: lyrics.trim() || hit.lyrics,
        duration: duration || hit.duration,
        mime: fileish.type,
        addedAt: Date.now(),
        blob: fileish,
        lines: timedLines(lyrics.trim() || hit.lyrics, duration || hit.duration),
        sourceUrl: hit.audioUrl,
      };
      toast.message("Снимаю минус…");
      const pulled = await pullMinusBlobs({ audioUrl: hit.audioUrl });
      if (pulled) {
        saved.minusBlob = pulled.minusBlob;
        saved.vocalBlob = pulled.vocalBlob ?? saved.vocalBlob;
        saved.sourceUrl = pulled.instrumentalUrl;
      }
      const next = await persist(saved);
      setSunoUrl("");
      toast.success(pulled ? "С Suno, минус скачался." : "С Suno в студии.");
      playUiTick();
      if (desk === "voice") setStudio(next);
    } catch (err) {
      paidFail(err);
    } finally {
      setBusy(null);
    }
  }

  async function cookNew() {
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`Уже ${LIBRARY_MAX} треков. Убери один.`);
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
        if (!startedLyrics.ok) throw startedLyrics;
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
      if (!started.ok) throw started;
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
      const saved: SavedTrack = {
        id: uid("suno"),
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
      const next = await persist(saved);
      setTitle("");
      setLyrics("");
      toast.success("Трек скачался.");
      playUiTick();
      setDesk("home");
      if (desk === "voice") setStudio(next);
    } catch (err) {
      paidFail(err);
    } finally {
      setBusy(null);
    }
  }

  async function ingestFile(file: File | undefined, openVoice: boolean) {
    const audio = takeAudioFile(file);
    if (!audio) {
      toast.error("Нужен аудиофайл — mp3, wav, m4a.");
      return;
    }
    if (tracks.length >= LIBRARY_MAX) {
      toast.error(`Уже ${LIBRARY_MAX} треков. Убери один.`);
      return;
    }
    setBusy("file");
    try {
      const saved = await blobFromFile(audio);
      saved.lyrics = lyrics.trim();
      if (title.trim()) saved.title = title.trim().slice(0, 48);
      await saveTrack(saved);
      const nextList = await syncSongs(artist);
      setTracks(nextList);
      const next = nextList.find((t) => t.id === saved.id) ?? saved;
      toast.success("Файл в студии.");
      playUiTick();
      if (openVoice) setStudio(next);
      else setDesk("home");
    } catch (err) {
      paidFail(err);
    } finally {
      setBusy(null);
    }
  }

  async function coverFromUpload(file: File | undefined) {
    const audio = takeAudioFile(file);
    if (!audio) {
      toast.error("Нужен аудиофайл — mp3, wav, m4a.");
      return;
    }
    setBusy("cover");
    try {
      const prepared = await prepareKaraokeTrack(audio, false);
      URL.revokeObjectURL(prepared.url);
      const hosted = await hostFile(audio, audio.name || "source.mp3");
      const started = await startSunoCover({
        data: {
          audioUrl: hosted,
          title: (title.trim() || audio.name.replace(/\.[^.]+$/, "") || "Cover").slice(0, 80),
          lyrics: lyrics.trim() || "karaoke cover, keep the melody",
          duration: prepared.duration,
        },
      });
      if (!started.ok) throw started;
      let audioUrl: string | null = null;
      for (let i = 0; i < 48; i++) {
        await new Promise((r) => window.setTimeout(r, 4000));
        const st = await pollSunoGenerate({ data: { taskId: started.taskId } });
        if (st.failed) throw new Error("Кавер не вышел.");
        const clip = st.clips.find((c) => c.audioUrl);
        if (clip?.audioUrl) {
          audioUrl = clip.audioUrl;
          break;
        }
      }
      if (!audioUrl) throw new Error("Кавер не успел. Попробуй ещё раз.");
      const res = await fetch(proxyAudio(audioUrl));
      if (!res.ok) throw new Error("Не скачался кавер.");
      const coverBlob = await res.blob();
      const saved: SavedTrack = {
        id: uid("cover"),
        title: (title.trim() || "кавер").slice(0, 48),
        lyrics: lyrics.trim(),
        duration: prepared.duration,
        mime: coverBlob.type || "audio/mpeg",
        addedAt: Date.now(),
        blob: coverBlob,
        coverBlob,
        sourceUrl: audioUrl,
      };
      await persist(saved);
      toast.success("Кавер скачался.");
      playUiTick();
      setDesk("home");
    } catch (err) {
      paidFail(err);
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
      <div className="flex items-start justify-between gap-3">
        <div>
          <h1 className="font-display text-3xl text-fg">Студия</h1>
          <p className="mt-2 max-w-sm text-sm leading-relaxed text-muted">
            Сварить трек, кавер голосом или с файла. Всё качается сразу. Балалаечка — если захотите спеть за столом.
          </p>
        </div>
        <button
          type="button"
          className="shrink-0 rounded-xl border border-border bg-surface px-3 py-2 text-sm tabular-nums text-fg"
          onClick={() => setShop(true)}
        >
          {notes} нот
        </button>
      </div>

      {desk === "home" ? (
        <div className="mt-6 grid gap-2">
          <button
            type="button"
            className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left"
            onClick={() => setDesk("cook")}
          >
            <Music className="mt-0.5 size-5 text-accent" />
            <span>
              <span className="block font-medium text-fg">Сварить трек</span>
              <span className="mt-1 block text-sm text-muted">
                Тема или свои строки. {cookCost()} нот, файл сразу на телефон.
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left"
            onClick={() => setDesk("voice")}
          >
            <Mic className="mt-0.5 size-5 text-accent" />
            <span>
              <span className="block font-medium text-fg">Кавер своим голосом</span>
              <span className="mt-1 block text-sm text-muted">
                Спой в минус, Suno соберёт кавер. {NOTE_PRICE.minus}+{NOTE_PRICE.cover} нот.
              </span>
            </span>
          </button>
          <button
            type="button"
            className="flex items-start gap-3 rounded-2xl border border-border bg-surface p-4 text-left"
            onClick={() => setDesk("file")}
          >
            <Upload className="mt-0.5 size-5 text-accent" />
            <span>
              <span className="block font-medium text-fg">Кавер с файла</span>
              <span className="mt-1 block text-sm text-muted">
                Загрузи свой трек — получится кавер. {NOTE_PRICE.cover} нот.
              </span>
            </span>
          </button>
        </div>
      ) : null}

      {desk === "cook" ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm text-muted">Свой текст, не чужой хит. Или ссылка с suno.com.</p>
          <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Стиль: russian pop, disco…" value={style} onChange={(e) => setStyle(e.target.value)} />
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Тема или свои строки. Три строки хватит — Suno допишет стихи."
            rows={5}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
          />
          <Button type="button" className="rounded-xl" onClick={() => void cookNew()} disabled={Boolean(busy)}>
            {busy === "cook" ? "Suno варит… минута-две" : `Сварить трек · ${cookCost()} нот`}
          </Button>
          <Input
            placeholder="Или ссылка suno.com/song/…"
            value={sunoUrl}
            onChange={(e) => setSunoUrl(e.target.value)}
          />
          <Button type="button" variant="secondary" className="rounded-xl" onClick={() => void addFromSuno()} disabled={Boolean(busy)}>
            {busy === "suno" ? "Забираю с Suno…" : `Забрать с Suno · ${NOTE_PRICE.minus} нот`}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDesk("home")}>
            К студии
          </Button>
        </div>
      ) : null}

      {desk === "voice" ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Возьми трек, сними минус, спой, потом кавер. Можно из списка ниже, сварить новый или загрузить файл.
          </p>
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg"
            className="hidden"
            onChange={(e) => void ingestFile(e.target.files?.[0], true)}
          />
          <Button type="button" variant="secondary" className="rounded-xl" onClick={() => fileRef.current?.click()} disabled={Boolean(busy)}>
            {busy === "file" ? "Читаю файл…" : "Загрузить минус или плюс"}
          </Button>
          <Button type="button" variant="secondary" className="rounded-xl" onClick={() => setDesk("cook")}>
            Сначала сварить трек
          </Button>
          {tracks.length ? (
            <ul className="flex flex-col gap-2">
              {tracks.map((track) => (
                <li key={track.id}>
                  <Button
                    type="button"
                    variant="outline"
                    className="h-auto w-full justify-start rounded-xl py-3"
                    onClick={() => {
                      stopPreview();
                      setStudio(track);
                    }}
                  >
                    {track.title} · спеть и кавер
                  </Button>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-subtle">Пока пусто — загрузи файл или свари трек.</p>
          )}
          <Button type="button" variant="ghost" onClick={() => setDesk("home")}>
            К студии
          </Button>
        </div>
      ) : null}

      {desk === "file" ? (
        <div className="mt-5 flex flex-col gap-3">
          <p className="text-sm leading-relaxed text-muted">
            Кинь свой трек. По желанию допиши слова — кавер выйдет ближе к тексту.
          </p>
          <Input placeholder="Название кавера" value={title} onChange={(e) => setTitle(e.target.value)} />
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Текст, если есть. Можно пусто."
            rows={4}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
          />
          <input
            ref={coverFileRef}
            type="file"
            accept="audio/*,.mp3,.wav,.m4a,.ogg"
            className="hidden"
            onChange={(e) => void coverFromUpload(e.target.files?.[0])}
          />
          <Button
            type="button"
            className="rounded-xl"
            disabled={Boolean(busy)}
            onClick={() => coverFileRef.current?.click()}
          >
            {busy === "cover" ? "Варю кавер… пару минут" : `Выбрать файл и сварить кавер · ${NOTE_PRICE.cover} нот`}
          </Button>
          <Button type="button" variant="ghost" onClick={() => setDesk("home")}>
            К студии
          </Button>
        </div>
      ) : null}

      {desk === "home" && tracks.length ? (
        <div className="mt-6 flex flex-col gap-3">
          <p className="text-xs uppercase tracking-[0.18em] text-subtle">на этом телефоне</p>
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
                    {track.minusBlob ? " · минус" : ""}
                    {track.coverBlob ? " · кавер" : ""}
                    {track.takeBlob ? " · запись" : ""}
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
                Минус, спеть, кавер
              </Button>
              <TrackTakes track={track} className="mt-2" />
            </div>
          ))}
        </div>
      ) : null}

      {desk === "home" ? (
        <div className="mt-8 flex flex-col gap-2">
          <Button
            type="button"
            variant="outline"
            className="h-12 rounded-xl"
            onClick={() => {
              playUiTick();
              toLobby();
            }}
          >
            Балалаечка — игра за столом
          </Button>
          <p className="text-center text-xs text-subtle">По желанию. Студия от этого не зависит.</p>
        </div>
      ) : null}
    </div>
  );
}
