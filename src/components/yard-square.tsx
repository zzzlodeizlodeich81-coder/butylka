import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/lib/store";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";
import { yardBoard, type Hero, type YardLine, type YardSong } from "@/lib/yard-board";
import { readFrames } from "@/lib/yard";

function caller() {
  let heroId = "guest";
  try {
    heroId = localStorage.getItem("yard-hero") || "";
    if (!heroId) {
      heroId = crypto.randomUUID();
      localStorage.setItem("yard-hero", heroId);
    }
  } catch {
    /* двор без хранилища */
  }
  const name = useGame.getState().players.find((p) => p.id === useGame.getState().youId)?.name || "Гость";
  return { heroId, author: name };
}

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
      <div className="mt-3 flex gap-2">
        <Input placeholder="https:// ссылка на черновик" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await yardBoard({ data: { action: "add", kind: "draft", url, ...caller() } });
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
            const res = await yardBoard({ data: { action: "rate", songId: song.id, ...score, ...caller() } });
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

function yandexFrame(url: string) {
  try {
    const page = new URL(url);
    if (!/music\.yandex\./i.test(page.hostname)) return "";
    if (page.pathname.includes("/iframe")) return url;
    const both = page.pathname.match(/\/album\/(\d+)\/track\/(\d+)/);
    if (both) return `https://music.yandex.ru/iframe/#track/${both[2]}/${both[1]}`;
    const track = page.pathname.match(/\/track\/(\d+)/);
    if (track) return `https://music.yandex.ru/iframe/#track/${track[1]}`;
  } catch {
    return "";
  }
  return "";
}

function fileTrack(url: string) {
  return /\.(mp3|ogg|wav|m4a|aac|flac)(\?|$)/i.test(url);
}

function ReleaseRow({ song, onDone }: { song: YardSong; onDone: (songs: YardSong[]) => void }) {
  const youId = useGame((s) => s.youId);
  const setYouNotes = useGame((s) => s.setYouNotes);
  const heard = useRef({ last: 0, total: 0, paid: false });
  const frame = yandexFrame(song.url);
  const file = fileTrack(song.url);
  const who = caller();
  const mine = song.vk === who.heroId || song.author === who.author;

  async function credit() {
    if (heard.current.paid) return;
    heard.current.paid = true;
    const res = await yardBoard({ data: { action: "hear", songId: song.id, ...caller() } });
    if (!res.ok) {
      heard.current.paid = res.error === "Уже засчитано.";
      if (res.error !== "Уже засчитано.") toast.error(res.error || "Не зачлось.");
      return;
    }
    if (typeof res.notes === "number") {
      useWallet.getState().apply({ notes: res.notes });
      setYouNotes(res.notes);
    } else if (res.local) {
      const you = useGame.getState().players.find((player) => player.id === youId);
      setYouNotes((you?.notes || 0) + 0.5);
    }
    toast.success("+0,5 ноты");
  }

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-border bg-surface px-3 py-2">
      <p className="font-medium text-fg">{song.author}</p>
      <p className="text-xs">{song.title || "без названия"}</p>
      {file ? (
        <audio
          className="w-full"
          controls
          preload="none"
          src={song.url}
          onTimeUpdate={(event) => {
            const node = event.currentTarget;
            const now = node.currentTime;
            const delta = now - heard.current.last;
            heard.current.last = now;
            if (delta > 0 && delta < 1.5) heard.current.total += delta;
            if (node.duration && heard.current.total >= Math.max(20, Math.min(node.duration * 0.7, 90))) void credit();
          }}
        />
      ) : null}
      {frame ? (
        <iframe
          title={song.title || song.author}
          src={frame}
          className="h-[180px] w-full rounded-lg border-0"
          allow="autoplay; encrypted-media"
        />
      ) : null}
      {!file && !frame ? <p className="text-xs">Эта ссылка не файл и не Яндекс. В наш плеер она не встаёт.</p> : null}
      {frame ? (
        <p className="text-xs">
          Играет здесь, только у тебя. Пол-ноты за Яндекс не даём: их плеер не сообщает, дослушал ты или закрыл.
        </p>
      ) : null}
      {mine ? (
        <Button
          variant="secondary"
          className="w-full rounded-xl"
          onClick={() => {
            void (async () => {
              const res = await yardBoard({ data: { action: "drop", songId: song.id, ...caller() } });
              if (!res.ok) {
                toast.error(res.error || "Не удалилось.");
                return;
              }
              onDone(res.songs || []);
            })();
          }}
        >
          Удалить ссылку
        </Button>
      ) : null}
    </div>
  );
}

export function ReleaseCard({ onStage }: { onStage: () => void }) {
  const [songs, setSongs] = useState<YardSong[]>([]);
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void loadBoard().then((row) => setSongs(row.songs.filter((s) => s.kind === "release")));
  }, []);

  return (
    <div className="text-sm text-muted">
      <p>Название и ссылка. Файл играет нашим плеером, и за него дают 0,5 ноты, если правда дослушать. Ссылка Яндекса играет тут же, в карточке, но пол-ноты за неё не приходит.</p>
      <div className="mt-3 flex flex-col gap-2">
        <Input placeholder="Название песни" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
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
                } else if (typeof paid.notes === "number") {
                  useWallet.getState().apply({ notes: paid.notes });
                } else await refreshWallet();
                const res = await yardBoard({ data: { action: "add", kind: "release", url, title, ...caller() } });
                if (!res.ok) {
                  toast.error(res.error || "Ссылка не встала.");
                  return;
                }
                setUrl("");
                setTitle("");
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
      </div>
      <div className="mt-3 flex flex-col gap-2">
        {songs.map((song) => (
          <ReleaseRow key={song.id} song={song} onDone={(next) => setSongs(next.filter((item) => item.kind === "release"))} />
        ))}
      </div>
      <Button className="mt-3 w-full rounded-xl" onClick={onStage}>
        За стол петь
      </Button>
    </div>
  );
}

type Face = { id: string; name: string; photo: string };
type WhisperLine = { id: string; from: string; to: string; text: string; at: number };

async function postDoor(body: Record<string, unknown>) {
  const res = await fetch("/api/door", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    ok?: boolean;
    error?: string;
    me?: string;
    people?: Face[];
    lines?: WhisperLine[];
  };
}

function shrinkFace(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, size, size);
      URL.revokeObjectURL(url);
      let quality = 0.72;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 90000 && quality > 0.4) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("image"));
    };
    img.src = url;
  });
}

function PrivatePane() {
  const [people, setPeople] = useState<Face[]>([]);
  const [me, setMe] = useState("");
  const [withId, setWithId] = useState("");
  const [lines, setLines] = useState<WhisperLine[]>([]);
  const [text, setText] = useState("");
  const mine = people.find((person) => person.id === me);

  async function loadPeople() {
    const row = await postDoor({ action: "people" });
    if (!row.ok) {
      toast.error(row.error || "Люди не открылись.");
      return;
    }
    setMe(row.me || "");
    setPeople(row.people || []);
  }

  async function loadThread(id: string) {
    const row = await postDoor({ action: "thread", with: id });
    if (row.ok) setLines(row.lines || []);
  }

  useEffect(() => {
    void loadPeople();
  }, []);

  useEffect(() => {
    if (!withId) return;
    void loadThread(withId);
    const timer = window.setInterval(() => void loadThread(withId), 5000);
    return () => window.clearInterval(timer);
  }, [withId]);

  const others = people.filter((person) => person.id !== me);

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        {mine?.photo ? (
          <img src={mine.photo} alt="" className="size-12 rounded-full object-cover" />
        ) : (
          <span className="inline-flex size-12 items-center justify-center rounded-full bg-surface-2 text-xs text-muted">лицо</span>
        )}
        <label className="cursor-pointer rounded-xl bg-surface px-3 py-2 text-sm text-fg">
          Поставить своё лицо
          <input
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void (async () => {
                try {
                  const photo = await shrinkFace(file);
                  const row = await postDoor({ action: "face", photo });
                  if (!row.ok) {
                    toast.error(row.error || "Не встало.");
                    return;
                  }
                  await loadPeople();
                } catch {
                  toast.error("Это фото не читается.");
                }
              })();
            }}
          />
        </label>
      </div>
      <div className="mb-3 flex gap-2 overflow-x-auto">
        {others.map((person) => (
          <button
            key={person.id}
            type="button"
            className={`flex shrink-0 items-center gap-2 rounded-full border px-2 py-1 text-sm ${withId === person.id ? "border-accent bg-accent text-accent-fg" : "border-border"}`}
            onClick={() => setWithId(person.id)}
          >
            {person.photo ? <img src={person.photo} alt="" className="size-7 rounded-full object-cover" /> : null}
            {person.name}
          </button>
        ))}
        {others.length === 0 ? <p className="text-sm text-muted">Пока ты тут один. Личный разговор появится, когда зайдёт второй.</p> : null}
      </div>
      {withId ? (
        <>
          <div className="flex max-h-52 flex-col gap-1 overflow-auto text-sm">
            {lines.map((line) => (
              <p key={line.id} className={line.from === me ? "text-right" : ""}>
                <span className="text-muted">{line.text}</span>
              </p>
            ))}
            {lines.length === 0 ? <p className="text-sm text-muted">Это видите только вы двое.</p> : null}
          </div>
          <div className="mt-3 flex gap-2">
            <Input value={text} placeholder="Только ему" onChange={(e) => setText(e.target.value)} />
            <Button
              onClick={() => {
                void (async () => {
                  const row = await postDoor({ action: "whisper", to: withId, text });
                  if (!row.ok) {
                    toast.error(row.error || "Не ушло.");
                    return;
                  }
                  setText("");
                  setLines(row.lines || []);
                })();
              }}
            >
              Сказать
            </Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function YardChat({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<YardLine[]>([]);
  const [text, setText] = useState("");
  const [shared, setShared] = useState(true);
  const [tab, setTab] = useState<"yard" | "private">("yard");

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
          <h2 className="font-display text-2xl text-fg">Чат</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <div className="mb-3 flex gap-2">
          <Button variant={tab === "yard" ? "default" : "secondary"} className="rounded-xl" onClick={() => setTab("yard")}>
            Двор
          </Button>
          <Button variant={tab === "private" ? "default" : "secondary"} className="rounded-xl" onClick={() => setTab("private")}>
            Лично
          </Button>
        </div>
        {tab === "private" ? <PrivatePane /> : null}
        {tab === "yard" ? (
          <>
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
                const res = await yardBoard({ data: { action: "say", text, ...caller() } });
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
          </>
        ) : null}
      </div>
    </div>
  );
}

function axis(sum: number, votes: number) {
  if (!votes) return "—";
  return (sum / votes).toFixed(1);
}

export function FameCard({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<Hero[]>([]);
  const [shared, setShared] = useState(true);
  const me = useWallet((s) => s.vkId) || caller().heroId;

  useEffect(() => {
    void (async () => {
      const res = await yardBoard({ data: { action: "glory", frames: readFrames(), ...caller() } });
      if (!res.ok) return;
      setRows(res.heroes || []);
      setShared(Boolean(res.shared));
    })();
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[78%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Слава</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="text-sm text-muted">
          Ноты и кадры — кошель. Слава — как двор оценил черновики у шарманщика. Деньги славу не покупают.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((hero, index) => (
            <div key={hero.vk} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <p className="font-medium text-fg">
                {index + 1}. {hero.name}
                {hero.vk === me ? " · ты" : ""}
              </p>
              <p className="text-muted">
                слава {hero.fame || "—"} · ноты {hero.notes} · кадры {hero.frames} · треков {hero.tracks}
              </p>
              <p className="text-xs text-muted">
                хук {axis(hero.hook, hero.votes)} · текст {axis(hero.lyric, hero.votes)} · музыка {axis(hero.music, hero.votes)} · ориг.{" "}
                {axis(hero.orig, hero.votes)} · оценок {hero.votes}
              </p>
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-muted">Пока пусто. Кинь черновик шарманщику.</p> : null}
        </div>
      </div>
    </div>
  );
}
