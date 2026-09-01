import { useMemo, useState } from "react";
import { AudioLines, Link2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { generateSong, MOODS } from "@/lib/generate-song";
import { FOLK_REGIONS } from "@/lib/folk-songs";
import { buildSong, FOLK, GENRE_LABEL, parseGenre, type Genre, type Song } from "@/lib/songs";
import { playUiTick, unlockAudio } from "@/lib/audio";
import { formatChallenge, playerById, useGame } from "@/lib/store";
import { uid } from "@/lib/utils";
import { cn } from "@/lib/utils";

function SongCard({ song, onPick }: { song: Song; onPick: (song: Song) => void }) {
  return (
    <button
      type="button"
      onClick={() => {
        unlockAudio();
        playUiTick();
        onPick(song);
      }}
      className="rounded-xl border border-border bg-surface p-4 text-left transition-opacity hover:opacity-90"
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-lg leading-tight text-fg">{song.title}</p>
          <p className="mt-1 text-sm text-muted">{song.artist}</p>
        </div>
        <Badge>
          {song.pack === "mine" ? "мой файл · " : song.pack === "folk" ? "все знают · " : song.minus ? "минус · " : ""}
          {GENRE_LABEL[song.genre]} · {song.bpm}
        </Badge>
      </div>
      <p className="mt-3 line-clamp-2 text-sm text-subtle">{song.lines.map((l) => l.text).join(" · ")}</p>
    </button>
  );
}

export function SongPick() {
  const options = useGame((s) => s.options);
  const chooseSong = useGame((s) => s.chooseSong);
  const rerollSongs = useGame((s) => s.rerollSongs);
  const addCustomSong = useGame((s) => s.addCustomSong);
  const players = useGame((s) => s.players);
  const singer = playerById(players, useGame((s) => s.singerId));
  const partner = playerById(players, useGame((s) => s.partnerId));
  const challenge = useGame((s) => s.challenge);
  const [panel, setPanel] = useState<"none" | "gen" | "import" | "folk">("none");
  const [mood, setMood] = useState<(typeof MOODS)[number]["id"]>("party");
  const [busy, setBusy] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("Suno");
  const [lyrics, setLyrics] = useState("");
  const [audioUrl, setAudioUrl] = useState("");

  const folkByRegion = useMemo(
    () =>
      FOLK_REGIONS.map((region) => ({
        ...region,
        songs: FOLK.filter((s) => s.region === region.id),
      })).filter((g) => g.songs.length > 0),
    [],
  );

  async function onGenerate() {
    if (busy) return;
    setBusy(true);
    playUiTick();
    try {
      const res = await generateSong({ data: { mood } });
      if (!res.ok) {
        toast.error(res.error);
        return;
      }
      addCustomSong(res.song);
      toast.success(`«${res.song.title}» уже в колоде`);
      setPanel("none");
    } catch {
      toast.error("Не вышло сгенерировать. Возьми из каталога.");
    } finally {
      setBusy(false);
    }
  }

  function onImport() {
    const texts = lyrics
      .split(/\n/)
      .map((l) => l.trim())
      .filter(Boolean);
    if (!title.trim() || texts.length < 4) {
      toast.error("Нужны название и хотя бы 4 строки текста.");
      return;
    }
    const song = buildSong({
      id: uid("suno"),
      title: title.trim().slice(0, 48),
      artist: (artist.trim() || "Suno").slice(0, 32),
      genre: parseGenre("indie") as Genre,
      bpm: 110,
      mood: "свой трек",
      texts,
      audioUrl: audioUrl.trim() || undefined,
      generated: true,
    });
    addCustomSong(song);
    toast.success("Трек в колоде. Можно петь.");
    setPanel("none");
    setTitle("");
    setLyrics("");
    setAudioUrl("");
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <p className="text-sm text-muted">
        {singer?.name} выбирает, что петь
        {challenge ? ` · ${formatChallenge(challenge, partner?.name)}` : ""}
      </p>
      <h2 className="mt-1 font-display text-2xl text-fg">
        {panel === "folk" ? "Все знают" : "Три трека"}
      </h2>

      {panel === "folk" ? (
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-4 overflow-auto">
          <p className="text-sm text-subtle">
            Народные и XIX век. Хиты вроде «Смуглянки» — своим файлом.
          </p>
          {folkByRegion.map((group) => (
            <section key={group.id}>
              <p className="mb-2 text-xs uppercase tracking-wide text-muted">{group.label}</p>
              <div className="flex flex-col gap-2">
                {group.songs.map((song) => (
                  <SongCard key={song.id} song={song} onPick={chooseSong} />
                ))}
              </div>
            </section>
          ))}
        </div>
      ) : (
        <div className="mt-4 flex min-h-0 flex-1 flex-col gap-3 overflow-auto">
          {options.map((song) => (
            <SongCard key={song.id} song={song} onPick={chooseSong} />
          ))}
        </div>
      )}

      {panel === "none" ? (
        <div className="mt-4 grid grid-cols-2 gap-2">
          <Button variant="secondary" onClick={rerollSongs}>
            <RefreshCw />
            Ещё три
          </Button>
          <Button variant="secondary" onClick={() => setPanel("gen")}>
            <AudioLines />
            Сгенерировать
          </Button>
          <Button variant="outline" onClick={() => setPanel("import")}>
            <Link2 />
            Из Suno
          </Button>
        </div>
      ) : null}

      {panel === "folk" ? (
        <div className="mt-4">
          <Button variant="ghost" className="w-full" onClick={() => setPanel("none")}>
            К трём трекам
          </Button>
        </div>
      ) : null}

      {panel === "gen" ? (
        <div className="mt-4 rounded-xl border border-border bg-surface p-4">
          <p className="text-sm text-muted">Настроение текста</p>
          <div className="mt-2 flex flex-wrap gap-2">
            {MOODS.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => setMood(m.id)}
                className={cn(
                  "rounded-full border px-3 py-1.5 text-sm",
                  mood === m.id
                    ? "border-accent bg-accent text-accent-fg"
                    : "border-border bg-surface-2 text-muted",
                )}
              >
                {m.label}
              </button>
            ))}
          </div>
          <div className="mt-3 flex gap-2">
            <Button className="flex-1" onClick={onGenerate} disabled={busy}>
              {busy ? "Пишет…" : "Написать текст"}
            </Button>
            <Button variant="ghost" onClick={() => setPanel("none")}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}

      {panel === "import" ? (
        <div className="mt-4 space-y-2 rounded-xl border border-border bg-surface p-4">
          <Input placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
          <Input placeholder="Исполнитель — Suno" value={artist} onChange={(e) => setArtist(e.target.value)} />
          <textarea
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder="Текст по строкам — как в караоке"
            rows={5}
            className="w-full rounded-md border border-border bg-surface-2 px-3 py-2 text-base text-fg placeholder:text-subtle outline-none"
          />
          <Input
            placeholder="Прямая ссылка на mp3, необязательно"
            value={audioUrl}
            onChange={(e) => setAudioUrl(e.target.value)}
          />
          <p className="text-xs text-subtle">
            Если файла ещё нет — сыграем минусовку. Когда генератор отдаст mp3, просто вставь ссылку.
          </p>
          <div className="flex gap-2">
            <Button className="flex-1" onClick={onImport}>
              В колоду
            </Button>
            <Button variant="ghost" onClick={() => setPanel("none")}>
              Закрыть
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
