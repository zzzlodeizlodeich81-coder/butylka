import { useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { playUiTick } from "@/lib/audio";
import { buildSong } from "@/lib/songs";
import { prepareKaraokeTrack, takeAudioFile } from "@/lib/stems";
import { useGame } from "@/lib/store";
import { uid } from "@/lib/utils";
import { cn } from "@/lib/utils";

export function BringSong() {
  const addCustomSong = useGame((s) => s.addCustomSong);
  const toVerse = useGame((s) => s.toVerse);
  const you = useGame((s) => s.players.find((p) => p.id === s.youId));
  const [title, setTitle] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fullTrack, setFullTrack] = useState(true);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

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

  async function submit() {
    const texts = lyrics
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!file) {
      toast.error("Нужен файл песни.");
      return;
    }
    if (!title.trim() || texts.length < 4) {
      toast.error("Название и хотя бы 4 строки текста.");
      return;
    }
    setBusy(true);
    await new Promise((r) => window.setTimeout(r, 30));
    try {
      const prepared = await prepareKaraokeTrack(file, fullTrack);
      addCustomSong(
        buildSong({
          id: uid("mine"),
          title: title.trim().slice(0, 48),
          artist: you?.name ?? "мой трек",
          genre: "indie",
          bpm: 110,
          mood: "свой трек",
          texts,
          audioUrl: prepared.url,
          audioDuration: prepared.duration,
          generated: true,
          minus: prepared.minus,
        }),
      );
      toast.success(prepared.minus ? "В колоде. Минус снимем при пении." : "Трек в колоде.");
      playUiTick();
      toVerse();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не вышло прочитать файл.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <h1 className="font-display text-3xl text-fg">Свой трек</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Файл и текст. Если это полный трек — минус снимем при пении, без тяжёлой обработки.
      </p>

      <div className="mt-5 flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
        <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
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
          placeholder="Текст по строкам — каждая строка как в караоке"
          rows={7}
          className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
        />
        <button
          type="button"
          onClick={() => setFullTrack((v) => !v)}
          className={cn(
            "rounded-lg border px-3 py-3 text-left text-sm",
            fullTrack ? "border-accent bg-surface text-fg" : "border-border bg-surface-2 text-muted",
          )}
        >
          <span className="block font-medium text-fg">Полный трек — вытащить минус</span>
          <span className="mt-1 block text-subtle">
            Голос обычно в центре. Уберём его при воспроизведении.
          </span>
        </button>
      </div>

      <div className="mt-4 flex flex-col gap-2">
        <Button type="button" size="lg" className="h-14 rounded-xl" onClick={submit} disabled={busy}>
          {busy ? "Читаю файл…" : "В колоду — дальше бред"}
        </Button>
        <Button
          type="button"
          variant="ghost"
          onClick={() => {
            playUiTick();
            toVerse();
          }}
        >
          Играть без своего трека
        </Button>
      </div>
    </div>
  );
}
