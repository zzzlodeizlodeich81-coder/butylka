import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { previewFile, previewTime, stopPreview, unlockAudio } from "@/lib/audio";
import { objectUrlFor, saveTrack, type SavedTrack } from "@/lib/library";
import { findSyncedLyrics } from "@/lib/lyrics-server";
import { looksLikeLrc, parseLrc, stampLines } from "@/lib/lyrics-sync";
import { proxyAudio } from "@/lib/suno";
import { pollSunoStems, startSunoStems } from "@/lib/suno-server";
import { TrackTakes } from "@/components/track-takes";

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

async function hostFile(blob: Blob) {
  const form = new FormData();
  form.append("file", blob, "track.mp3");
  const res = await fetch("/api/host-audio", { method: "POST", body: form });
  const json = (await res.json()) as { ok?: boolean; url?: string; error?: string };
  if (!json.ok || !json.url) throw new Error(json.error || "Не выложился файл.");
  return json.url;
}

export function KaraokeCook({ track, onClose, onSaved }: Props) {
  const [text, setText] = useState(track.lyrics);
  const [tapping, setTapping] = useState(false);
  const [stamps, setStamps] = useState<number[]>([]);
  const [busy, setBusy] = useState<string | null>(null);

  useEffect(() => () => stopPreview(), []);

  async function persist(next: SavedTrack) {
    await saveTrack(next);
    onSaved(next);
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

  function startTap() {
    const rows = looksLikeLrc(text) ? parseLrc(text).map((l) => l.text) : splitText(text);
    if (rows.length < 2) {
      toast.error("Сначала текст — хотя бы две строки.");
      return;
    }
    unlockAudio();
    setStamps([]);
    setTapping(true);
    previewFile(objectUrlFor(track.id, track.blob));
  }

  function tapLine() {
    const t = previewTime();
    const next = [...stamps, t];
    setStamps(next);
    const rows = looksLikeLrc(text) ? parseLrc(text).map((l) => l.text) : splitText(text);
    if (next.length >= rows.length) {
      const lines = stampLines(rows, next, track.duration);
      stopPreview();
      setTapping(false);
      const nextTrack = { ...track, lines, lyrics: rows.join("\n") };
      void persist(nextTrack);
      toast.success("Такт записан.");
    }
  }

  async function cookMinus() {
    setBusy("Снимаю минус… минута-две");
    try {
      const audioUrl = track.sourceUrl || (await hostFile(track.blob));
      const started = await startSunoStems({ data: { audioUrl } });
      if (!started.ok) throw new Error(started.error);
      let instrumental: string | null = null;
      let vocal: string | null = null;
      for (let i = 0; i < 40; i++) {
        await new Promise((r) => window.setTimeout(r, 2500));
        const st = await pollSunoStems({ data: { taskId: started.taskId } });
        if (st.failed) throw new Error("Кухня не сняла голос.");
        if (st.ready && st.instrumentalUrl) {
          instrumental = st.instrumentalUrl;
          vocal = st.vocalUrl;
          break;
        }
      }
      if (!instrumental) throw new Error("Минус не успел. Попробуй ещё раз.");
      const res = await fetch(proxyAudio(instrumental));
      if (!res.ok) throw new Error("Не скачался минус.");
      const minusBlob = await res.blob();
      let vocalBlob: Blob | undefined;
      if (vocal) {
        const v = await fetch(proxyAudio(vocal));
        if (v.ok) vocalBlob = await v.blob();
      }
      const next = { ...track, minusBlob, vocalBlob: vocalBlob ?? track.vocalBlob };
      await persist(next);
      toast.success(vocalBlob ? "Минус и вокал в колоде. Можно скачать." : "Минус в колоде. Можно скачать.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не вышел минус.");
    } finally {
      setBusy(null);
    }
  }

  const rows = looksLikeLrc(text) ? parseLrc(text).map((l) => l.text) : splitText(text);
  const currentLine = rows[stamps.length] ?? "готово";

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-3xl text-fg">Караоке</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        {track.title}. Текст по тактам — чтобы строки не убегали. Минус — по желанию, через кухню.
      </p>

      {tapping ? (
        <div className="mt-6 flex min-h-0 flex-1 flex-col">
          <p className="text-xs uppercase tracking-[0.2em] text-subtle">
            строка {Math.min(stamps.length + 1, rows.length)} / {rows.length}
          </p>
          <p className="mt-3 font-display text-3xl leading-tight text-fg">{currentLine}</p>
          <div className="mt-auto flex flex-col gap-2">
            <Button size="lg" className="h-16 rounded-xl" onClick={tapLine}>
              Эта строка сейчас
            </Button>
            <Button
              variant="ghost"
              onClick={() => {
                stopPreview();
                setTapping(false);
              }}
            >
              Сброс
            </Button>
          </div>
        </div>
      ) : (
        <>
          <textarea
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Текст по строкам или LRC с таймкодами"
            rows={8}
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
              Набить такт под песню
            </Button>
            <Button variant="secondary" onClick={() => void cookMinus()} disabled={Boolean(busy)}>
              {busy?.startsWith("Снимаю") ? busy : track.minusBlob ? "Переснять минус" : "Снять минус"}
            </Button>
            <TrackTakes track={track} />
            <Button variant="ghost" onClick={onClose}>
              К колоде
            </Button>
          </div>
        </>
      )}
    </div>
  );
}
