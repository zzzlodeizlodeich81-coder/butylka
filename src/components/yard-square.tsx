import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/lib/store";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";
import { NOTE_PRICE } from "@/lib/notes";
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
  if (!res.ok) return { songs: [] as YardSong[], chat: [] as YardLine[], shared: false, typing: [] as { id: string; name: string }[] };
  return { songs: res.songs || [], chat: res.chat || [], shared: Boolean(res.shared), typing: res.typing || [] };
}

function blip() {
  try {
    const Ctx = window.AudioContext || (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = "sine";
    osc.frequency.value = 740;
    gain.gain.setValueAtTime(0.0001, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.07, ctx.currentTime + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + 0.14);
    osc.connect(gain);
    gain.connect(ctx.destination);
    void ctx.resume();
    osc.start();
    osc.stop(ctx.currentTime + 0.15);
    osc.onended = () => void ctx.close();
  } catch {
    /* телефон без звука */
  }
}

type ContestRow = {
  id: string;
  artist: string;
  title: string;
  votes: number;
  voted: boolean;
  mine: boolean;
  place: number;
  passed: boolean;
  lyrics?: string;
};

function squareShot(file: File) {
  return new Promise<Blob>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 800;
      canvas.height = 800;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 800, 800);
      URL.revokeObjectURL(url);
      canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("blob"))), "image/jpeg", 0.82);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img"));
    };
    img.src = url;
  });
}

function ContestSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ContestRow[]>([]);
  const [taken, setTaken] = useState(0);
  const [rank, setRank] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [lyrics, setLyrics] = useState("");
  const [audio, setAudio] = useState<File | null>(null);
  const [cover, setCover] = useState<Blob | null>(null);
  const [coverUrl, setCoverUrl] = useState("");
  const [deal, setDeal] = useState(false);
  const [free, setFree] = useState(false);
  const [rights, setRights] = useState(false);
  const [court, setCourt] = useState(false);
  const [busy, setBusy] = useState(false);

  function take(data: {
    entries?: ContestRow[];
    taken?: number;
    rank?: number;
    admin?: boolean;
    notes?: number;
  }) {
    if (Array.isArray(data.entries)) setRows(data.entries);
    if (typeof data.taken === "number") setTaken(data.taken);
    if (typeof data.rank === "number") setRank(data.rank);
    if (typeof data.admin === "boolean") setAdmin(data.admin);
    if (typeof data.notes === "number") useWallet.getState().apply({ notes: data.notes });
  }

  useEffect(() => {
    void fetch("/api/contest")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) take(data);
      })
      .catch(() => undefined);
  }, []);

  async function send() {
    if (!audio || !cover || busy) return;
    if (!deal || !free || !rights || !court) {
      toast.error("Нужны все четыре согласия.");
      return;
    }
    setBusy(true);
    try {
      const body = new FormData();
      body.set("title", title);
      body.set("artist", artist);
      body.set("lyrics", lyrics);
      body.set("audio", audio);
      body.set("cover", cover, "cover.jpg");
      body.set("deal", deal ? "1" : "");
      body.set("free", free ? "1" : "");
      body.set("rights", rights ? "1" : "");
      body.set("court", court ? "1" : "");
      const res = await fetch("/api/contest", { method: "POST", body });
      const data = await res.json().catch(() => null);
      if (typeof data?.notes === "number") useWallet.getState().apply({ notes: data.notes });
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Не приняли.");
        return;
      }
      take(data);
      setTitle("");
      setArtist("");
      setLyrics("");
      setAudio(null);
      setCover(null);
      setCoverUrl("");
      setDeal(false);
      setFree(false);
      setRights(false);
      setCourt(false);
      toast.success("Трек на конкурсе.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/50">
      <div className="max-h-[88%] w-full overflow-auto rounded-t-3xl bg-[#1a120c] px-3 pt-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Матрёшка (лучшее)</h2>
          <Button variant="ghost" className="text-[#f4e4c4]" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="mt-1 text-sm text-[#c4a574]">
          Сборник HoldingMusic Матрёшка (лучшее). Подать можно сколько угодно, в сборник месяца проходят 10 лучших по голосам. Сейчас подано {taken}. Твой статус {rank}. Голос за чужой трек даёт +1.
        </p>
        <p className="mt-2 text-xs text-[#c4a574]">
          80% роялти всего альбома делится между артистами по прослушиваниям из статистики Needle Music. 10% дистрибьютору. 10% на развитие игры «Музыкальный город».
        </p>
        <Input className="mt-3" placeholder="Название трека" value={title} onChange={(e) => setTitle(e.target.value)} />
        <Input className="mt-2" placeholder="Имя артиста" value={artist} onChange={(e) => setArtist(e.target.value)} />
        <textarea
          className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
          rows={4}
          maxLength={8000}
          placeholder="Текст трека"
          value={lyrics}
          onChange={(e) => setLyrics(e.target.value)}
        />
        <label className="mt-2 block text-xs">
          Файл трека, формат любой
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.m4a,.ogg,.aac"
            onChange={(e) => setAudio(e.target.files?.[0] || null)}
          />
        </label>
        <label className="mt-2 block text-xs">
          Квадратная картинка
          <input
            className="mt-1 block w-full text-sm"
            type="file"
            accept="image/*"
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (!file) return;
              void squareShot(file)
                .then((blob) => {
                  setCover(blob);
                  setCoverUrl(URL.createObjectURL(blob));
                })
                .catch(() => toast.error("Картинка не прочиталась."));
            }}
          />
        </label>
        {coverUrl ? <img src={coverUrl} alt="" className="mt-2 size-24 rounded-lg object-cover" /> : null}
        {(
          [
            ["deal", deal, setDeal, "Согласен с дележом: 80% артистам по прослушиваниям, 10% Needle Music, 10% игре."],
            ["free", free, setFree, "Трек не размещён у других дистрибьюторов."],
            ["rights", rights, setRights, "Права на трек мои."],
            ["court", court, setCourt, "Если будет спор в суде, ответственность несу я."],
          ] as const
        ).map(([key, on, set, label]) => (
          <label key={key} className="mt-2 flex items-start gap-2 text-xs">
            <input type="checkbox" className="mt-0.5" checked={on} onChange={(e) => set(e.target.checked)} />
            <span>{label}</span>
          </label>
        ))}
        <Button className="mt-3 w-full rounded-xl" disabled={busy} onClick={() => void send()}>
          {busy ? "Кладёт…" : `Подать · ${NOTE_PRICE.contest} нот`}
        </Button>
        <div className="mt-4 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl bg-black/30 px-3 py-2">
              <p className="font-medium">
                {row.artist} — {row.title}{" "}
                <span className="text-xs text-[#c4a574]">{row.passed ? `проходит · ${row.place}` : "на конкурсе"}</span>
              </p>
              <img src={`/api/contest?id=${row.id}&part=cover`} alt="" className="mt-2 size-16 rounded-lg object-cover" />
              <audio className="mt-2 w-full" controls src={`/api/contest?id=${row.id}&part=audio`} />
              <p className="mt-1 text-xs">голосов {row.votes}</p>
              {admin && row.lyrics ? <p className="mt-1 whitespace-pre-wrap text-xs text-[#c4a574]">{row.lyrics}</p> : null}
              {admin ? (
                <a className="mt-1 block text-xs underline" href={`/api/contest?id=${row.id}&part=audio`}>
                  Скачать файл
                </a>
              ) : null}
              <Button
                variant="secondary"
                className="mt-2 rounded-xl"
                disabled={row.voted || row.mine}
                onClick={() => {
                  void (async () => {
                    const res = await fetch("/api/contest", {
                      method: "POST",
                      headers: { "Content-Type": "application/json" },
                      body: JSON.stringify({ id: row.id }),
                    });
                    const data = await res.json().catch(() => null);
                    if (!res.ok || !data?.ok) {
                      toast.error(data?.error || "Голос не зачёлся.");
                      return;
                    }
                    take(data);
                    if (data.gained) toast.success(`Статус ${data.rank}`);
                  })();
                }}
              >
                {row.mine ? "Твой трек" : row.voted ? "Голос есть" : "Голосовать · статус +1"}
              </Button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

export function OrganCard() {
  const [songs, setSongs] = useState<YardSong[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(true);
  const [contest, setContest] = useState(false);

  useEffect(() => {
    void loadBoard().then((row) => {
      setSongs(row.songs.filter((s) => s.kind === "draft"));
      setShared(row.shared);
    });
  }, []);

  return (
    <div className="text-sm text-muted">
      <p>Неопубликованное кидают бесплатно. Слушатели ставят хук, текст, музыку и оригинальность от 1 до 5.</p>
      <Button className="mt-3 w-full rounded-xl" onClick={() => setContest(true)}>
        На конкурс · {NOTE_PRICE.contest} нот
      </Button>
      {contest ? <ContestSheet onClose={() => setContest(false)} /> : null}
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
      <div className="mt-2 flex flex-col gap-1">
        {axes.map(([key, label]) => (
          <div key={key} className="flex items-center justify-between gap-2 text-xs">
            <span>{label}</span>
            <span className="flex gap-1">
              {[1, 2, 3, 4, 5].map((n) => (
                <button
                  key={n}
                  type="button"
                  className={`size-8 rounded-lg ${score[key] === n ? "bg-accent text-accent-fg" : "bg-surface-2 text-fg"}`}
                  onClick={() => setScore((cur) => ({ ...cur, [key]: n }))}
                >
                  {n}
                </button>
              ))}
            </span>
          </div>
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
    typing?: string;
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
  const [typing, setTyping] = useState("");
  const mine = people.find((person) => person.id === me);
  const box = useStick(lines);
  const typedAt = useRef(0);

  function poke(value: string, to: string) {
    const now = Date.now();
    if (value.trim()) {
      if (now - typedAt.current < 2000) return;
      typedAt.current = now;
    } else if (!typedAt.current) return;
    else typedAt.current = 0;
    void postDoor({ action: "type", to, text: value.trim() ? "1" : "" });
  }

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
    if (row.ok) {
      setLines(row.lines || []);
      setTyping(row.typing || "");
    }
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
    setTyping("");
    typedAt.current = 0;
    blip();
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
          {typing ? <p className="mt-1 text-xs text-muted">{typing} печатает…</p> : null}
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
            <Input
              value={text}
              placeholder="Только ему"
              onChange={(e) => {
                setText(e.target.value);
                poke(e.target.value, withId);
              }}
            />
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
  const [typers, setTypers] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<"yard" | "private">(focusId ? "private" : "yard");
  const box = useStick(tab === "yard" ? lines : tab);
  const typedAt = useRef(0);

  function poke(value: string) {
    const now = Date.now();
    if (value.trim()) {
      if (now - typedAt.current < 2000) return;
      typedAt.current = now;
    } else if (!typedAt.current) return;
    else typedAt.current = 0;
    void yardBoard({ data: { action: "type", text: value.trim() ? "1" : "", ...caller() } });
  }

  async function pull() {
    const row = await loadBoard();
    setLines(row.chat);
    setTypers(row.typing);
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
            {typers.length ? <p className="mt-1 text-xs text-muted">{typers.map((person) => person.name).join(", ")} печатает…</p> : null}
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
              <Input
                value={text}
                placeholder="Реплика двору"
                onChange={(e) => {
                  setText(e.target.value);
                  poke(e.target.value);
                }}
              />
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
                    typedAt.current = 0;
                    blip();
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

type PresaveCard = {
  id: string;
  name: string;
  title: string;
  url: string;
  clicks: number;
  live: boolean;
  mine: boolean;
  heard: boolean;
};

export function PresaveSheet({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<PresaveCard[]>([]);
  const [title, setTitle] = useState("");
  const [url, setUrl] = useState("");
  const [form, setForm] = useState(false);
  const [busy, setBusy] = useState(false);

  function take(notes?: number) {
    if (typeof notes === "number") useWallet.getState().apply({ notes });
  }

  useEffect(() => {
    void (async () => {
      const res = await yardBoard({ data: { action: "field", ...caller() } });
      if (!res.ok) {
        toast.error(res.error || "Поле не открылось.");
        return;
      }
      setRows(res.presaves || []);
    })();
  }, []);

  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/45">
      <div className="max-h-[82%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-fg">Поле</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="text-sm text-muted">Посев стоит 2 ноты и живёт 10 чужих открытий. За открытие 0.1 ноты, один раз с человека. Свой посев нот не даёт.</p>
        <Button className="mt-3 rounded-xl" variant="secondary" onClick={() => setForm((open) => !open)}>
          Добавить пресейв · 2 ноты
        </Button>
        {form ? (
          <div className="mt-3 flex flex-col gap-2">
            <Input placeholder="Кто и что: Полина — Минорное" value={title} onChange={(e) => setTitle(e.target.value)} />
            <Input placeholder="https://band.link/…" value={url} onChange={(e) => setUrl(e.target.value)} />
            <Button
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const res = await yardBoard({ data: { action: "sow", title, url, ...caller() } });
                    take(res.notes);
                    if (!res.ok) {
                      toast.error(res.error || "Не посеялось.");
                      return;
                    }
                    setRows(res.presaves || []);
                    setTitle("");
                    setUrl("");
                    setForm(false);
                    toast.success("Посеяно. 10 открытий.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Посеять
            </Button>
          </div>
        ) : null}
        <div className="mt-4 flex flex-col gap-2">
          {rows.map((card) => (
            <div key={card.id} className={`rounded-xl border border-border px-3 py-2 text-sm ${card.live ? "bg-surface" : "bg-surface-2 opacity-70"}`}>
              <p className="font-medium text-fg">{card.title}</p>
              <p className="text-xs text-muted">
                {card.name}
                {card.mine ? " · твой" : ""} · {card.clicks}/10
                {card.heard ? " · ты уже открывал" : ""}
              </p>
              {card.live ? (
                <Button
                  variant="secondary"
                  className="mt-2 rounded-xl"
                  onClick={() => {
                    void (async () => {
                      const res = await yardBoard({ data: { action: "tap", songId: card.id, ...caller() } });
                      take(res.notes);
                      if (!res.ok) {
                        toast.error(res.error || "Не открылось.");
                        return;
                      }
                      setRows(res.presaves || []);
                      if (card.url) window.open(card.url, "_blank", "noopener,noreferrer");
                      if (res.credit) toast.success("+0.1 ноты");
                    })();
                  }}
                >
                  {card.mine ? "Открыть свою" : card.heard ? "Открыть снова" : "Открыть · 0.1"}
                </Button>
              ) : card.mine ? (
                <Button
                  variant="secondary"
                  className="mt-2 rounded-xl"
                  disabled={busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const res = await yardBoard({ data: { action: "resow", songId: card.id, ...caller() } });
                        take(res.notes);
                        if (!res.ok) {
                          toast.error(res.error || "Не продлилось.");
                          return;
                        }
                        setRows(res.presaves || []);
                        toast.success("Ещё 10 открытий.");
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  Оставить ещё · 2 ноты
                </Button>
              ) : (
                <p className="mt-2 text-xs text-muted">Отсеялся</p>
              )}
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-muted">Поле пустое. Первый посев за тобой.</p> : null}
        </div>
      </div>
    </div>
  );
}
