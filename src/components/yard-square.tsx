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
  const walletName = useWallet.getState().name;
  const name = walletName || useGame.getState().players.find((p) => p.id === useGame.getState().youId)?.name || "Гость";
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
  const admin = useWallet((s) => s.admin);
  const who = caller();
  const mine = song.vk === who.heroId || song.author === who.author;
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
      {mine || admin ? (
        <Button
          variant="secondary"
          className="mt-2 w-full rounded-xl"
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
          Удалить
        </Button>
      ) : null}
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
  const admin = useWallet((s) => s.admin);
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
          className={`${/\/iframe\/album\/\d+\/?$/.test(frame.split("?")[0] || "") && !frame.includes("#track") ? "h-[420px]" : "h-[180px]"} w-full rounded-lg border-0`}
          allow="autoplay; encrypted-media"
        />
      ) : null}
      {!file && !frame ? <p className="text-xs">Эта ссылка не файл и не Яндекс. В наш плеер она не встаёт.</p> : null}
      {frame ? (
        <p className="text-xs">
          Играет здесь, только у тебя. Пол-ноты за Яндекс не даём: их плеер не сообщает, дослушал ты или закрыл.
        </p>
      ) : null}
      {mine || admin ? (
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
      <p>Название и код вставки с Яндекс Музыки. Обычная ссылка на сцену не встанет. Пол-ноты за этот плеер не даём: Яндекс не сообщает, дослушали или нет.</p>
      <div className="mt-3 flex flex-col gap-2">
        <Input placeholder="Название песни" value={title} onChange={(e) => setTitle(e.target.value)} />
        <div className="flex gap-2">
        <Input placeholder="Код вставки Яндекс Музыки" value={url} onChange={(e) => setUrl(e.target.value)} />
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
type WhisperLine = { id: string; from: string; to: string; text: string; at: number; image?: string; seen?: boolean };

const SMILES = ["😊", "😂", "😉", "😍", "😎", "🤔", "😭", "😡", "👍", "🔥", "❤️", "💀", "🎵", "🎤", "🎸", "👏", "🙏", "⭐", "👀", "🪆"];

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
    from?: string[];
    people?: Face[];
    lines?: WhisperLine[];
  };
}

function shrinkFace(file: File) {
  return shrinkShot(file, 256, 90000, true);
}

function shrinkShot(file: File, edge = 480, limit = 150000, square = false) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      let width = img.width;
      let height = img.height;
      if (square) {
        width = edge;
        height = edge;
      } else {
        const scale = Math.min(1, edge / Math.max(img.width, img.height));
        width = Math.max(1, Math.round(img.width * scale));
        height = Math.max(1, Math.round(img.height * scale));
      }
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      if (square) {
        const side = Math.min(img.width, img.height);
        ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, edge, edge);
      } else {
        ctx.drawImage(img, 0, 0, width, height);
      }
      URL.revokeObjectURL(url);
      let quality = 0.72;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > limit && quality > 0.4) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (data.length > limit) {
        reject(new Error("big"));
        return;
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

function FaceDot({ photo, name }: { photo?: string; name?: string }) {
  if (photo) return <img src={photo} alt="" className="size-8 shrink-0 rounded-full object-cover" />;
  return (
    <span className="inline-flex size-8 shrink-0 items-center justify-center rounded-full bg-[#2a1a0c] text-sm text-[#f4e4c4]">
      {(name || "🪆").slice(0, 1)}
    </span>
  );
}

function SmileBox({ onPick }: { onPick: (smile: string) => void }) {
  return (
    <div className="mt-2 flex gap-1 overflow-x-auto pb-1">
      {SMILES.map((smile) => (
        <button key={smile} type="button" className="shrink-0 rounded-lg bg-surface px-2 py-1 text-2xl" onClick={() => onPick(smile)}>
          {smile}
        </button>
      ))}
    </div>
  );
}

function useStick(dep: unknown) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const node = box.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [dep]);
  return box;
}

function PrivatePane({
  focusId,
  pingPeople,
  onOpenPerson,
}: {
  focusId?: string;
  pingPeople: string[];
  onOpenPerson: (id: string) => void;
}) {
  const [people, setPeople] = useState<Face[]>([]);
  const [me, setMe] = useState("");
  const [withId, setWithId] = useState(focusId || "");
  const [lines, setLines] = useState<WhisperLine[]>([]);
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const mine = people.find((person) => person.id === me);
  const box = useStick(lines);

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
    if (focusId) setWithId(focusId);
  }, [focusId]);

  useEffect(() => {
    if (!withId) return;
    onOpenPerson(withId);
    void loadThread(withId);
    const timer = window.setInterval(() => void loadThread(withId), 4000);
    return () => window.clearInterval(timer);
  }, [withId]);

  const others = people.filter((person) => person.id !== me);
  const talk = people.find((person) => person.id === withId);

  async function send() {
    const row = await postDoor({ action: "whisper", to: withId, text, image: shot });
    if (!row.ok) {
      toast.error(row.error || "Не ушло.");
      return;
    }
    setText("");
    setShot("");
    setLines(row.lines || []);
  }

  return (
    <div>
      <div className="mb-3 flex items-center gap-3">
        <FaceDot photo={mine?.photo} name={mine?.name} />
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
            className={`flex shrink-0 items-center gap-2 rounded-full border px-2 py-1 text-sm ${withId === person.id ? "border-accent bg-accent text-accent-fg" : "border-border"} ${pingPeople.includes(person.id) && withId !== person.id ? "kadr-blink" : ""}`}
            onClick={() => setWithId(person.id)}
          >
            <FaceDot photo={person.photo} name={person.name} />
            {person.name}
          </button>
        ))}
        {others.length === 0 ? <p className="text-sm text-muted">Пока ты тут один. Личный разговор появится, когда зайдёт второй.</p> : null}
      </div>
      {withId ? (
        <>
          <div ref={box} className="flex max-h-52 flex-col gap-2 overflow-auto text-sm">
            {lines.map((line) => {
              const own = line.from === me;
              const face = people.find((person) => person.id === line.from);
              return (
                <div key={line.id} className={own ? "flex flex-row-reverse gap-2" : "flex gap-2"}>
                  <FaceDot photo={face?.photo} name={face?.name} />
                  <div className={own ? "max-w-[75%] text-right" : "max-w-[75%]"}>
                    {line.image ? <img src={line.image} alt="" className="mb-1 max-h-40 rounded-lg" /> : null}
                    {line.text ? <p className="text-muted">{line.text}</p> : null}
                    {own ? <p className="text-xs text-accent">{line.seen ? "✓✓" : "✓"}</p> : null}
                  </div>
                </div>
              );
            })}
            {lines.length === 0 ? <p className="text-sm text-muted">Это видите только вы двое. {talk ? talk.name : ""}</p> : null}
          </div>
          {shot ? <img src={shot} alt="" className="mt-2 max-h-24 rounded-lg" /> : null}
          <SmileBox onPick={(smile) => setText((prev) => (prev + smile).slice(0, 300))} />
          <div className="mt-2 flex gap-2">
            <label className="inline-flex shrink-0 cursor-pointer items-center rounded-xl bg-surface-2 px-3 text-sm">
              фото
              <input
                className="hidden"
                type="file"
                accept="image/*"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = "";
                  if (!file) return;
                  void shrinkShot(file).then(setShot).catch(() => toast.error("Картинка не влезла."));
                }}
              />
            </label>
            <Input value={text} placeholder="Только ему" onChange={(e) => setText(e.target.value)} />
            <Button onClick={() => void send()}>Сказать</Button>
          </div>
        </>
      ) : null}
    </div>
  );
}

export function YardChat({
  onClose,
  focusId,
  pingYard,
  pingPeople,
  myId,
  onSeenYard,
  onOpenPerson,
}: {
  onClose: () => void;
  focusId?: string;
  pingYard: boolean;
  pingPeople: string[];
  myId: string;
  onSeenYard: (id: string) => void;
  onOpenPerson: (id: string) => void;
}) {
  const [lines, setLines] = useState<YardLine[]>([]);
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [tab, setTab] = useState<"yard" | "private">(focusId ? "private" : "yard");
  const box = useStick(tab === "yard" ? lines : tab);

  async function pull() {
    const row = await loadBoard();
    setLines(row.chat);
    const last = row.chat[row.chat.length - 1];
    if (last) onSeenYard(last.id);
  }

  useEffect(() => {
    if (focusId) setTab("private");
  }, [focusId]);

  useEffect(() => {
    if (tab !== "yard") return;
    void pull();
    const timer = window.setInterval(() => void pull(), 4000);
    return () => window.clearInterval(timer);
  }, [tab]);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="flex max-h-[78%] w-full flex-col overflow-hidden rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Чат</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <div className="mb-3 flex gap-2">
          <Button variant={tab === "yard" ? "default" : "secondary"} className={`rounded-xl ${pingYard && tab !== "yard" ? "kadr-blink" : ""}`} onClick={() => setTab("yard")}>
            Двор
          </Button>
          <Button
            variant={tab === "private" ? "default" : "secondary"}
            className={`rounded-xl ${pingPeople.length && tab !== "private" ? "kadr-blink" : ""}`}
            onClick={() => setTab("private")}
          >
            Лично
          </Button>
        </div>
        {tab === "private" ? <PrivatePane focusId={focusId} pingPeople={pingPeople} onOpenPerson={onOpenPerson} /> : null}
        {tab === "yard" ? (
          <>
            <div ref={box} className="flex min-h-0 max-h-48 flex-col gap-2 overflow-auto text-sm">
              {lines.map((line) => {
                const own = Boolean(myId && line.who === myId);
                return (
                  <div key={line.id} className={own ? "flex flex-row-reverse gap-2" : "flex gap-2"}>
                    <FaceDot photo={line.photo} name={line.name} />
                    <div className={own ? "max-w-[75%] text-right" : "max-w-[75%]"}>
                      {!own ? <p className="text-xs font-medium text-fg">{line.name}</p> : null}
                      {line.image ? <img src={line.image} alt="" className="mb-1 max-h-40 rounded-lg" /> : null}
                      {line.text ? <p className="text-muted">{line.text}</p> : null}
                      {own ? <p className="text-xs text-accent">✓</p> : null}
                    </div>
                  </div>
                );
              })}
            </div>
            {shot ? <img src={shot} alt="" className="mt-2 max-h-24 rounded-lg" /> : null}
            <SmileBox onPick={(smile) => setText((prev) => (prev + smile).slice(0, 200))} />
            <div className="mt-2 flex gap-2">
              <label className="inline-flex shrink-0 cursor-pointer items-center rounded-xl bg-surface-2 px-3 text-sm">
                фото
                <input
                  className="hidden"
                  type="file"
                  accept="image/*"
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    event.target.value = "";
                    if (!file) return;
                    void shrinkShot(file).then(setShot).catch(() => toast.error("Картинка не влезла."));
                  }}
                />
              </label>
              <Input value={text} placeholder="Реплика двору" onChange={(e) => setText(e.target.value)} />
              <Button
                onClick={() => {
                  void (async () => {
                    const res = await yardBoard({ data: { action: "say", text, image: shot, ...caller() } });
                    if (!res.ok) {
                      toast.error(res.error || "Не ушло.");
                      return;
                    }
                    setText("");
                    setShot("");
                    const next = res.chat || [];
                    setLines(next);
                    const last = next[next.length - 1];
                    if (last) onSeenYard(last.id);
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
