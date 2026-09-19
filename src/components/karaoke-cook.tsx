import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { TrackTakes } from "@/components/track-takes";
import {
  applyTakeMix,
  isFilePlaying,
  previewFile,
  previewTime,
  renderMasteredMix,
  setKaraokeEcho,
  startMixedTake,
  startTakePreview,
  stopPreview,
  TAKE_MINUS_DEFAULT,
  TAKE_RATE_DEFAULT,
  TAKE_SHIFT_DEFAULT,
  TAKE_VOLUME_DEFAULT,
  trackTime,
  unlockAudio,
  type MixedTake,
} from "@/lib/audio";
import { objectUrlFor, listSavedTracks, saveTrack, songFromSaved, downloadBlob, fileNameFor, type SavedTrack } from "@/lib/library";
import { findSyncedLyrics } from "@/lib/lyrics-server";
import { looksLikeLrc, parseLrc, stampLines } from "@/lib/lyrics-sync";
import { proxyAudio } from "@/lib/suno";
import { pullMinusBlobs } from "@/lib/suno-flow";
import { pollSunoGenerate, startSunoCover } from "@/lib/suno-server";
import { useGame } from "@/lib/store";
import { NOTE_PRICE } from "@/lib/notes";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";

type Props = {
  track: SavedTrack;
  onClose: () => void;
  onSaved: (next: SavedTrack) => void;
};

function splitText(raw: string) {
  return raw
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
}

async function hostFile(blob: Blob, name = "track.mp3") {
  const form = new FormData();
  form.append("file", new File([blob], name, { type: blob.type || "audio/mpeg" }));
  const res = await fetch("/api/host-audio", { method: "POST", body: form });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!json.ok || !json.url) throw new Error(json.error || "Не выложился файл.");
  return json.url;
}

function isPublicHttp(url?: string) {
  return Boolean(url && /^https:\/\//i.test(url));
}

function lineAt(track: SavedTrack, t: number, rows: string[]) {
  const timed = track.lines;
  if (timed?.length) {
    for (const line of timed) {
      if (t < line.t + line.duration) {
        if (t < line.t) return "инструментал";
        return line.text;
      }
    }
    return rows.at(-1) ?? "";
  }
  if (!rows.length || !track.duration) return rows[0] ?? "";
  const i = Math.min(rows.length - 1, Math.floor((t / track.duration) * rows.length));
  return rows[i] ?? "";
}

export function KaraokeCook({ track, onClose, onSaved }: Props) {
  const artist = useGame((s) => s.players.find((p) => p.id === s.youId)?.name ?? "мой трек");
  const replaceCustomSongs = useGame((s) => s.replaceCustomSongs);
  const [text, setText] = useState(track.lyrics);
  const [tapping, setTapping] = useState(false);
  const [recording, setRecording] = useState(false);
  const [recLine, setRecLine] = useState("");
  const [stamps, setStamps] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [tapClock, setTapClock] = useState(0);
  const [shiftMs, setShiftMs] = useState(track.takeShiftMs ?? TAKE_SHIFT_DEFAULT);
  const [takeRate, setTakeRate] = useState(track.takeRate ?? TAKE_RATE_DEFAULT);
  const [takeVol, setTakeVol] = useState(track.takeVolume ?? TAKE_VOLUME_DEFAULT);
  const [minusVol, setMinusVol] = useState(track.takeMinusVol ?? TAKE_MINUS_DEFAULT);
  const recRef = useRef<MixedTake | null>(null);

  useEffect(() => {
    setShiftMs(track.takeShiftMs ?? TAKE_SHIFT_DEFAULT);
    setTakeRate(track.takeRate ?? TAKE_RATE_DEFAULT);
    setTakeVol(track.takeVolume ?? TAKE_VOLUME_DEFAULT);
    setMinusVol(track.takeMinusVol ?? TAKE_MINUS_DEFAULT);
  }, [track.id, track.takeShiftMs, track.takeRate, track.takeVolume, track.takeMinusVol]);

  useEffect(() => () => {
    stopPreview();
    void recRef.current?.stop();
  }, []);

  async function persist(next: SavedTrack) {
    await saveTrack(next);
    onSaved(next);
    const saved = await listSavedTracks();
    replaceCustomSongs(saved.map((t) => songFromSaved(t, artist)));
  }

  function listenMix() {
    if (!track.minusBlob || !track.takeBlob) return;
    startTakePreview(objectUrlFor(`${track.id}-minus`, track.minusBlob), objectUrlFor(`${track.id}-take`, track.takeBlob), {
      shiftMs,
      rate: takeRate,
      volume: takeVol,
      minusVol,
    });
  }

  function liveMix(next: { voice?: number; minus?: number; rate?: number }) {
    if (applyTakeMix(next)) return;
    if (!track.minusBlob || !track.takeBlob) return;
    startTakePreview(objectUrlFor(`${track.id}-minus`, track.minusBlob), objectUrlFor(`${track.id}-take`, track.takeBlob), {
      shiftMs,
      rate: next.rate ?? takeRate,
      volume: next.voice ?? takeVol,
      minusVol: next.minus ?? minusVol,
    });
  }

  function saveMix(extra: Partial<SavedTrack> = {}) {
    void persist({
      ...track,
      takeShiftMs: shiftMs,
      takeRate,
      takeVolume: takeVol,
      takeMinusVol: minusVol,
      ...extra,
    });
  }

  async function saveText() {
    const lines = looksLikeLrc(text) ? parseLrc(text) : track.lines;
    const next = { ...track, lyrics: text, lines };
    await persist(next);
    toast.success(lines?.length ? "Текст с таймингом." : "Текст записан. Набей такт — тогда не убежит.");
  }

  async function fetchLyrics() {
    setBusy("Ищу текст…");
    try {
      const hit = await findSyncedLyrics({ data: { title: track.title, duration: Math.round(track.duration) } });
      if (!hit.ok) {
        toast.error(hit.error);
        return;
      }
      if (hit.syncedLyrics) {
        const lines = parseLrc(hit.syncedLyrics);
        const next = { ...track, lyrics: hit.syncedLyrics, lines };
        setText(hit.syncedLyrics);
        await persist(next);
        toast.success(`Нашли «${hit.name}» — строки уже по тактам.`);
        return;
      }
      if (hit.plainLyrics) {
        setText(hit.plainLyrics);
        await persist({ ...track, lyrics: hit.plainLyrics });
        toast.success("Текст есть, тактов нет. Набей пальцем под песню.");
      }
    } catch {
      toast.error("Каталог текстов не ответил.");
    } finally {
      setBusy(null);
    }
  }

  function tapRows() {
    return looksLikeLrc(text) ? parseLrc(text).map((l) => l.text) : splitText(text);
  }

  function startTap() {
    const rows = tapRows();
    if (rows.length < 2) {
      toast.error("Сначала текст — хотя бы две строки.");
      return;
    }
    unlockAudio();
    setStamps([]);
    setTapClock(0);
    setTapping(true);
    previewFile(objectUrlFor(track.id, track.blob));
  }

  function bump() {
    if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(14);
  }

  async function finishTap(times: number[]) {
    const rows = tapRows();
    const lines = stampLines(rows, times, track.duration);
    stopPreview();
    setTapping(false);
    const nextTrack = { ...track, lines, lyrics: rows.join("\n") };
    await persist(nextTrack);
    toast.success("Такт записан. Дальше — снять минус.");
  }

  function tapLine() {
    unlockAudio();
    const rows = tapRows();
    if (!isFilePlaying()) previewFile(objectUrlFor(track.id, track.blob));
    const t = Math.max(0, previewTime() - 0.08);
    const next = [...stamps, t];
    setStamps(next);
    bump();
    if (next.length >= rows.length) void finishTap(next);
  }

  function undoTap() {
    setStamps((s) => s.slice(0, -1));
    bump();
  }

  useEffect(() => {
    if (!tapping) return;
    let raf = 0;
    const tick = () => {
      setTapClock(previewTime());
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [tapping]);

  async function cookMinus(from: SavedTrack = track): Promise<SavedTrack | null> {
    setBusy("Suno снимает минус… минута-две");
    try {
      const audioUrl = isPublicHttp(from.sourceUrl)
        ? from.sourceUrl!
        : await hostFile(from.blob, fileNameFor(from.title, "plus", from.mime || "audio/mpeg"));
      const pulled = await pullMinusBlobs({ audioUrl });
      if (!pulled) throw new Error("Минус не успел. Попробуй ещё раз.");
      const next = {
        ...from,
        sourceUrl: isPublicHttp(from.sourceUrl) ? from.sourceUrl : audioUrl,
        minusBlob: pulled.minusBlob,
        vocalBlob: pulled.vocalBlob ?? from.vocalBlob,
      };
      await persist(next);
      downloadBlob(next.minusBlob, fileNameFor(from.title, "minus", next.minusBlob.type || "audio/mpeg"));
      void refreshWallet();
      toast.success(pulled.vocalBlob ? "Минус и вокал с Suno скачались." : "Минус с Suno скачался.");
      return next;
    } catch (err) {
      const rec = err && typeof err === "object" ? (err as { error?: string; needNotes?: number; message?: string }) : {};
      toast.error(rec.error || rec.message || "Не вышел минус.");
      if (rec.needNotes) useWallet.getState().setShop(true);
      void refreshWallet();
      return null;
    } finally {
      setBusy(null);
    }
  }

  async function startRecord() {
    unlockAudio();
    setKaraokeEcho(false);
    let current = track;
    if (!current.minusBlob) {
      toast.message("Сначала сниму минус через Suno — иначе голос ляжет на голос.");
      const next = await cookMinus();
      if (!next?.minusBlob) {
        toast.error("Минус не снялся. Без него запись не пишем.");
        return;
      }
      current = next;
    }
    const bed = objectUrlFor(`${current.id}-minus`, current.minusBlob!);
    const handle = await startMixedTake(bed, bed);
    if (!handle) {
      toast.error("Микрофон не открылся.");
      return;
    }
    recRef.current = handle;
    setRecording(true);
    toast.message("В ушах только минус. Голос пишется отдельной дорожкой, сам себя не слышишь.");
  }

  async function finishRecord() {
    const handle = recRef.current;
    recRef.current = null;
    setRecording(false);
    if (!handle) return;
    try {
      const blob = await handle.stop();
      if (!blob || blob.size < 2000) {
        toast.error("Пустая запись. Ещё раз — ближе к микрофону.");
        return;
      }
      await persist({
        ...track,
        takeBlob: blob,
        takeShiftMs: shiftMs,
        takeRate,
        takeVolume: takeVol,
        takeMinusVol: minusVol,
      });
      toast.success("Запись в колоде. Скачай или свари кавер.");
    } catch {
      toast.error("Запись оборвалась.");
    }
  }

  useEffect(() => {
    if (!recording) return;
    const rows = looksLikeLrc(text) ? parseLrc(text).map((l) => l.text) : splitText(text);
    let raf = 0;
    const tick = () => {
      const t = recRef.current?.time() ?? trackTime() ?? 0;
      setRecLine(lineAt(track, t, rows));
      if (track.duration && t >= track.duration - 0.15) {
        void finishRecord();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [recording, text, track]);

  async function cookCover() {
    if (!track.takeBlob) {
      toast.error("Сначала запиши голос под минус.");
      return;
    }
    setBusy("Варю кавер… пару минут");
    try {
      const ext = /wav/i.test(track.takeBlob.type)
        ? "take.wav"
        : /mp4|m4a|aac/i.test(track.takeBlob.type)
          ? "take.m4a"
          : "take.wav";
      const audioUrl = await hostFile(track.takeBlob, ext);
      const started = await startSunoCover({
        data: {
          audioUrl,
          title: `${track.title} cover`,
          lyrics: text || track.lyrics,
          duration: track.duration,
        },
      });
      if (!started.ok) throw started;
      let audio: string | null = null;
      for (let i = 0; i < 48; i++) {
        await new Promise((r) => window.setTimeout(r, 4000));
        const st = await pollSunoGenerate({ data: { taskId: started.taskId } });
        if (st.failed) throw new Error("Кавер не вышел.");
        const clip = st.clips.find((c) => c.audioUrl);
        if (clip?.audioUrl) {
          audio = clip.audioUrl;
          break;
        }
      }
      if (!audio) throw new Error("Кавер не успел. Попробуй ещё раз.");
      const res = await fetch(proxyAudio(audio));
      if (!res.ok) throw new Error("Не скачался кавер.");
      const coverBlob = await res.blob();
      await persist({ ...track, coverBlob });
      downloadBlob(coverBlob, fileNameFor(track.title, "cover", coverBlob.type || "audio/mpeg"));
      void refreshWallet();
      toast.success("Кавер скачался.");
    } catch (err) {
      const rec = err && typeof err === "object" ? (err as { error?: string; needNotes?: number; message?: string }) : {};
      toast.error(rec.error || rec.message || "Кавер не сварился.");
      if (rec.needNotes) useWallet.getState().setShop(true);
      void refreshWallet();
    } finally {
      setBusy(null);
    }
  }

  const rows = looksLikeLrc(text) ? parseLrc(text).map((l) => l.text) : splitText(text);
  const currentLine = rows[stamps.length] ?? "готово";
  const nextLine = rows[stamps.length + 1] ?? "";
  const prevLine = stamps.length > 0 ? rows[stamps.length - 1] : "";
  const clock = `${Math.floor(tapClock / 60)}:${String(Math.floor(tapClock % 60)).padStart(2, "0")}`;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      {recording || tapping ? null : (
        <>
          <h1 className="font-display text-3xl text-fg">{track.title}</h1>
          <p className="mt-2 text-sm leading-relaxed text-muted">
            Минус, запись голоса, кавер. Файлы качаются сразу. Текст можно набить пальцем под песню.
          </p>
        </>
      )}

      {recording ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">пишем · жми стоп когда спел</p>
          <p className="mt-4 font-display text-3xl leading-tight text-fg sm:text-4xl">{recLine || "…"}</p>
          <div className="mt-auto flex flex-col gap-2">
            <Button size="lg" className="h-20 rounded-xl text-lg" onClick={() => void finishRecord()}>
              Стоп — сохранить
            </Button>
          </div>
        </div>
      ) : tapping ? (
        <div className="flex min-h-0 flex-1 flex-col">
          <button
            type="button"
            className="flex min-h-0 flex-1 touch-manipulation select-none flex-col text-left"
            onPointerDown={(e) => {
              if (e.button !== 0) return;
              e.preventDefault();
              tapLine();
            }}
          >
            <p className="text-xs uppercase tracking-[0.2em] text-subtle">
              {clock} · {Math.min(stamps.length + 1, rows.length)} / {rows.length} · жми экран
            </p>
            <p className="mt-4 min-h-6 text-sm text-subtle">{prevLine}</p>
            <p className="mt-3 font-display text-3xl leading-tight text-fg sm:text-5xl">{currentLine}</p>
            <p className="mt-4 min-h-6 text-sm text-muted">{nextLine}</p>
            <p className="mt-auto pb-4 text-center text-sm text-subtle">
              Как услышишь эту строку — тык куда угодно. С телефона так и надо.
            </p>
          </button>
          <div className="grid grid-cols-2 gap-2">
            <Button variant="secondary" className="h-12 rounded-xl" onPointerDown={(e) => e.stopPropagation()} onClick={undoTap} disabled={!stamps.length}>
              На строку назад
            </Button>
            <Button
              variant="ghost"
              className="h-12 rounded-xl"
              onPointerDown={(e) => e.stopPropagation()}
              onClick={() => {
                stopPreview();
                setTapping(false);
                setStamps([]);
              }}
            >
              Сброс
            </Button>
          </div>
          <Button
            className="mt-2 h-12 rounded-xl"
            onPointerDown={(e) => e.stopPropagation()}
            onClick={() => void finishTap(stamps.length ? stamps : [0])}
            disabled={!stamps.length}
          >
            Готово
          </Button>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Текст по строкам или LRC с таймкодами"
            rows={6}
            className="mt-5 min-h-0 flex-1 w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
          />
          <div className="mt-4 flex flex-col gap-2">
            <Button onClick={() => void saveText()} disabled={Boolean(busy)}>
              Сохранить текст
            </Button>
            <Button variant="secondary" onClick={() => void fetchLyrics()} disabled={Boolean(busy)}>
              {busy?.startsWith("Ищу") ? busy : "Найти текст по названию"}
            </Button>
            <Button variant="secondary" onClick={startTap} disabled={Boolean(busy)}>
              Набить такт — жми экран
            </Button>
            <Button variant="secondary" onClick={() => void cookMinus()} disabled={Boolean(busy)}>
              {busy?.startsWith("Suno") || busy?.startsWith("Снимаю")
                ? busy
                : track.minusBlob
                  ? `Переснять минус · ${NOTE_PRICE.minus}`
                  : `Снять минус через Suno · ${NOTE_PRICE.minus} нот`}
            </Button>
            <Button onClick={() => void startRecord()} disabled={Boolean(busy)}>
              {track.takeBlob ? "Перезаписать голос" : "Спеть и записать"}
            </Button>
            {track.takeBlob ? (
              <div className="flex flex-col gap-3 rounded-xl border border-border bg-surface px-3 py-3">
                <p className="text-xs uppercase tracking-[0.18em] text-subtle">сведение</p>
                <p className="text-sm leading-relaxed text-muted">
                  Крути на ходу — должно меняться сразу. Две громкости: минус и голос.
                </p>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted">
                    Скорость голоса {takeRate < 1 ? "медленнее" : takeRate > 1 ? "быстрее" : "как пел"} · {takeRate.toFixed(2)}
                  </span>
                  <input
                    type="range"
                    min={0.85}
                    max={1.2}
                    step={0.01}
                    value={takeRate}
                    className="h-11 w-full accent-accent"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTakeRate(v);
                      liveMix({ rate: v });
                    }}
                    onPointerUp={(e) => {
                      const v = Number((e.currentTarget as HTMLInputElement).value);
                      setTakeRate(v);
                      saveMix({ takeRate: v });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted">Громкость голоса {Math.round(takeVol * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={8}
                    step={0.05}
                    value={takeVol}
                    className="h-11 w-full accent-accent"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setTakeVol(v);
                      liveMix({ voice: v });
                    }}
                    onPointerUp={(e) => {
                      const v = Number((e.currentTarget as HTMLInputElement).value);
                      setTakeVol(v);
                      saveMix({ takeVolume: v });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted">Громкость минуса {Math.round(minusVol * 100)}%</span>
                  <input
                    type="range"
                    min={0}
                    max={2}
                    step={0.05}
                    value={minusVol}
                    className="h-11 w-full accent-accent"
                    onChange={(e) => {
                      const v = Number(e.target.value);
                      setMinusVol(v);
                      liveMix({ minus: v });
                    }}
                    onPointerUp={(e) => {
                      const v = Number((e.currentTarget as HTMLInputElement).value);
                      setMinusVol(v);
                      saveMix({ takeMinusVol: v });
                    }}
                  />
                </label>
                <label className="flex flex-col gap-1">
                  <span className="text-sm text-muted">
                    Сдвиг {shiftMs > 0 ? `+${shiftMs}` : shiftMs} мс
                  </span>
                  <input
                    type="range"
                    min={-400}
                    max={200}
                    step={10}
                    value={shiftMs}
                    className="h-11 w-full accent-accent"
                    onChange={(e) => setShiftMs(Number(e.target.value))}
                    onPointerUp={(e) => {
                      const v = Number((e.currentTarget as HTMLInputElement).value);
                      setShiftMs(v);
                      saveMix({ takeShiftMs: v });
                      listenMix();
                    }}
                  />
                </label>
                <Button type="button" variant="secondary" className="rounded-xl" onClick={listenMix}>
                  Слушать сведение
                </Button>
                <Button
                  type="button"
                  className="rounded-xl"
                  disabled={Boolean(busy) || !track.minusBlob || !track.takeBlob}
                  onClick={() => {
                    void (async () => {
                      if (!track.minusBlob || !track.takeBlob) return;
                      setBusy("Свожу и мастерю…");
                      try {
                        const mix = await renderMasteredMix(track.minusBlob, track.takeBlob, {
                          shiftMs,
                          rate: takeRate,
                          volume: takeVol,
                          minusVol,
                        });
                        downloadBlob(mix, fileNameFor(track.title, "mix", "audio/wav"));
                        toast.success("Сведение скачалось — wav после мастера.");
                      } catch {
                        toast.error("Сведение не собралось.");
                      } finally {
                        setBusy(null);
                      }
                    })();
                  }}
                >
                  {busy?.startsWith("Свожу") ? busy : "Скачать сведение"}
                </Button>
              </div>
            ) : null}
            <Button variant="secondary" onClick={() => void cookCover()} disabled={Boolean(busy) || !track.takeBlob}>
              {busy?.startsWith("Варю") ? busy : track.coverBlob ? `Переварить кавер · ${NOTE_PRICE.cover}` : `Кавер · ${NOTE_PRICE.cover} нот`}
            </Button>
            <TrackTakes track={track} />
            <Button variant="ghost" onClick={onClose}>
              К студии
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
