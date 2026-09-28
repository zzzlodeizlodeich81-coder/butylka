import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/lib/store";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";
import { yardBoard, type YardLine, type YardSong } from "@/lib/yard-board.server";

function avg(sum: number, n: number) {
  if (!n) return "—";
  return (sum / n).toFixed(1);
}

async function loadBoard() {
  const res = await yardBoard({ data: { action: "list" } });
  if (!res.ok) return { songs: [] as YardSong[], chat: [] as YardLine[], shared: false };
  return { songs: res.songs || [], chat: res.chat || [], shared: Boolean(res.shared) };
}

export function OrganCard() {
  const name = useGame((s) => s.players.find((p) => p.id === s.youId)?.name || "Гость");
  const [songs, setSongs] = useState<YardSong[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(true);

  useEffect(() => {
    void loadBoard().then((row) => {
      setSongs(row.songs.filter((s) => s.kind === "draft"));
      setShared(row.shared);
    });
  }, []);

  return (
    <div className="text-sm text-muted">
      <p>Неопубликованное кидают бесплатно. Слушатели ставят хук, текст, музыку и оригинальность от 1 до 5.</p>
      {!shared ? <p className="mt-1">Общая доска ещё на старой таблице. Пока список живёт, пока открыт этот заход сервера.</p> : null}
      <div className="mt-3 flex gap-2">
        <Input placeholder="https:// ссылка на черновик" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await yardBoard({ data: { action: "add", kind: "draft", url, author: name } });
                if (!res.ok) {
                  toast.error(res.error || "Не кинулось.");
                  return;
                }
                setUrl("");
                setSongs((res.songs || []).filter((s) => s.kind === "draft"));
                setShared(Boolean(res.shared));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Кинуть
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {songs.map((song) => (
          <DraftRow key={song.id} song={song} onDone={(next) => setSongs(next.filter((s) => s.kind === "draft"))} />
        ))}
      </div>
    </div>
  );
}

function DraftRow({ song, onDone }: { song: YardSong; onDone: (songs: YardSong[]) => void }) {
  const [score, setScore] = useState({ hook: 3, lyric: 3, music: 3, orig: 3 });
  const axes = [
    ["hook", "хук"],
    ["lyric", "текст"],
    ["music", "музыка"],
    ["orig", "оригинальность"],
  ] as const;
  return (
    <div className="rounded-xl border border-border bg-surface px-3 py-2">
      <a className="font-medium text-fg underline" href={song.url} target="_blank" rel="noreferrer">
        {song.author}
      </a>
      <p className="mt-1 text-xs">
        хук {avg(song.hook, song.n)} · текст {avg(song.lyric, song.n)} · музыка {avg(song.music, song.n)} · ориг.{" "}
        {avg(song.orig, song.n)} · {song.n}
      </p>
      <div className="mt-2 grid grid-cols-2 gap-1">
        {axes.map(([key, label]) => (
          <label key={key} className="flex items-center justify-between gap-2 text-xs">
            {label}
            <input
              className="w-14 rounded border border-border bg-surface-2 px-1 py-0.5"
              type="number"
              min={1}
              max={5}
              value={score[key]}
              onChange={(e) => setScore((cur) => ({ ...cur, [key]: Number(e.target.value) }))}
            />
          </label>
        ))}
      </div>
      <Button
        variant="secondary"
        className="mt-2 rounded-xl"
        onClick={() => {
          void (async () => {
            const res = await yardBoard({ data: { action: "rate", songId: song.id, ...score } });
            if (!res.ok) {
              toast.error(res.error || "Не зачлось.");
              return;
            }
            onDone(res.songs || []);
          })();
        }}
      >
        Оценить
      </Button>
    </div>
  );
}

export function ReleaseCard({ onStage }: { onStage: () => void }) {
  const name = useGame((s) => s.players.find((p) => p.id === s.youId)?.name || "Гость");
  const setYouNotes = useGame((s) => s.setYouNotes);
  const youId = useGame((s) => s.youId);
  const [songs, setSongs] = useState<YardSong[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadBoard().then((row) => setSongs(row.songs.filter((s) => s.kind === "release")));
  }, []);

  return (
    <div className="text-sm text-muted">
      <p>Опубликованный релиз Яндекса или ВК. Поставить — 2 ноты. Дослушать чужую — 0,5 ноты, один раз.</p>
      <div className="mt-3 flex gap-2">
        <Input placeholder="https:// ссылка на релиз" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const { settleYard } = await import("@/lib/yard-server");
                const paid = await settleYard({ data: { notes: 2, kind: "deal" } });
                if (!paid.ok) {
                  toast.error(paid.error);
                  useWallet.getState().setShop(true);
                  return;
                }
                if (paid.local) {
                  const game = useGame.getState();
                  const you = game.players.find((p) => p.id === game.youId);
                  if (!you || you.notes < 2 || !game.spendNotes(game.youId, 2)) {
                    toast.error("Нужно 2 ноты.");
                    return;
                  }
                } else await refreshWallet();
                const res = await yardBoard({ data: { action: "add", kind: "release", url, author: name } });
                if (!res.ok) {
                  toast.error(res.error || "Ссылка не встала.");
                  return;
                }
                setUrl("");
                setSongs((res.songs || []).filter((s) => s.kind === "release"));
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          2 ноты
        </Button>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {songs.map((song) => (
          <div key={song.id} className="rounded-xl border border-border bg-surface px-3 py-2">
            <a className="font-medium text-fg underline" href={song.url} target="_blank" rel="noreferrer">
              {song.author}
            </a>
            <Button
              variant="secondary"
              className="mt-2 rounded-xl"
              onClick={() => {
                void (async () => {
                  const res = await yardBoard({ data: { action: "hear", songId: song.id, author: name } });
                  if (!res.ok) {
                    toast.error(res.error || "Не зачлось.");
                    return;
                  }
                  if (res.local) {
                    const you = useGame.getState().players.find((p) => p.id === youId);
                    setYouNotes((you?.notes || 0) + 0.5);
                  } else if (typeof res.notes === "number") {
                    useWallet.getState().apply({ notes: res.notes });
                    setYouNotes(res.notes);
                  } else await refreshWallet();
                  toast.success("+0,5 ноты");
                })();
              }}
            >
              Дослушал · +0,5
            </Button>
          </div>
        ))}
      </div>
      <Button className="mt-3 w-full rounded-xl" onClick={onStage}>
        За стол петь
      </Button>
    </div>
  );
}

export function YardChat({ onClose }: { onClose: () => void }) {
  const name = useGame((s) => s.players.find((p) => p.id === s.youId)?.name || "Гость");
  const [lines, setLines] = useState<YardLine[]>([]);
  const [text, setText] = useState("");
  const [shared, setShared] = useState(true);

  async function pull() {
    const row = await loadBoard();
    setLines(row.chat);
    setShared(row.shared);
  }

  useEffect(() => {
    void pull();
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[70%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Чат двора</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        {!shared ? <p className="mb-2 text-sm text-muted">Общий чат включится, когда обновишь скрипт таблицы. Пока реплики только на этом заходе.</p> : null}
        <div className="flex max-h-64 flex-col gap-1 overflow-auto text-sm">
          {lines.map((line) => (
            <p key={line.id}>
              <span className="font-medium text-fg">{line.name}: </span>
              <span className="text-muted">{line.text}</span>
            </p>
          ))}
        </div>
        <div className="mt-3 flex gap-2">
          <Input value={text} placeholder="Реплика двору" onChange={(e) => setText(e.target.value)} />
          <Button
            onClick={() => {
              void (async () => {
                const res = await yardBoard({ data: { action: "say", text, author: name } });
                if (!res.ok) {
                  toast.error(res.error || "Не ушло.");
                  return;
                }
                setText("");
                setLines(res.chat || []);
                setShared(Boolean(res.shared));
              })();
            }}
          >
            Сказать
          </Button>
        </div>
      </div>
    </div>
  );
}
