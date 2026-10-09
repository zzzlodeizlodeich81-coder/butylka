import { useEffect, useRef, useState, type PointerEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useGame } from "@/lib/store";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";
import { NOTE_PRICE } from "@/lib/notes";
import { yardBoard, type Hero, type YardLine, type YardSong } from "@/lib/yard-desk";
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

async function loadBoard(plot = "") {
  const res = await yardBoard({ data: { action: "list", plot } });
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
  url?: string;
  lyrics?: string;
  guest?: boolean;
  voters?: string[];
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

function ContestSheet({ song, onClose, onSent }: { song: YardSong; onClose: () => void; onSent: () => void }) {
  const [rows, setRows] = useState<ContestRow[]>([]);
  const [taken, setTaken] = useState(0);
  const [rank, setRank] = useState(0);
  const [admin, setAdmin] = useState(false);
  const [title, setTitle] = useState(song.title || "");
  const [artist, setArtist] = useState(song.author || "");
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
    if (!cover || busy) return;
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
      body.set("songId", song.id);
      body.set("url", song.url);
      if (audio) body.set("audio", audio);
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
      onSent();
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
          На конкурс уходит этот трек: {song.author}
          {song.title ? ` — ${song.title}` : ""}. Ссылку заново не кидай. В сборник месяца проходят 10 лучших. Сейчас подано {taken}. Твой статус {rank}.
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
          Квадратная картинка на сборник
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
                <span className="text-xs text-[#c4a574]">
                  {row.passed ? `проходит · ${row.place}` : "на конкурсе"}
                  {row.guest ? " · гость" : ""}
                </span>
              </p>
              <img src={`/api/contest?id=${row.id}&part=cover`} alt="" className="mt-2 size-16 rounded-lg object-cover" />
              {row.url ? (
                <a className="mt-2 block text-xs underline" href={row.url} target="_blank" rel="noreferrer">
                  Слушать трек
                </a>
              ) : (
                <audio className="mt-2 w-full" controls src={`/api/contest?id=${row.id}&part=audio`} />
              )}
              <p className="mt-1 text-xs">голосов {row.votes}</p>
              {admin && row.voters?.length ? (
                <p className="mt-1 text-xs text-[#c4a574]">кто голосовал: {row.voters.join(", ")}</p>
              ) : null}
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

export function OrganCard({ plot = "" }: { plot?: string }) {
  const [songs, setSongs] = useState<YardSong[]>([]);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);
  const [shared, setShared] = useState(true);
  const [contest, setContest] = useState<YardSong | null>(null);
  const [sent, setSent] = useState<string[]>([]);

  useEffect(() => {
    void loadBoard(plot).then((row) => {
      setSongs(row.songs.filter((s) => s.kind === "draft"));
      setShared(row.shared);
    });
    void fetch("/api/contest")
      .then((res) => res.json())
      .then((data) => {
        const ids = Array.isArray(data?.entries) ? data.entries.map((row: { songId?: string }) => row.songId || "").filter(Boolean) : [];
        setSent(ids);
      })
      .catch(() => undefined);
  }, [plot]);

  return (
    <div className="text-sm text-muted">
      <p>{plot ? "Черновики этого двора. В общий зал славы они не попадают." : "Неопубликованное кидают бесплатно. Слушатели ставят хук, текст, музыку и оригинальность от 1 до 5. На конкурс уходит только свой трек."}</p>
      {contest ? (
        <ContestSheet
          song={contest}
          onClose={() => setContest(null)}
          onSent={() => setSent((cur) => (cur.includes(contest.id) ? cur : [...cur, contest.id]))}
        />
      ) : null}
      <div className="mt-3 flex gap-2">
        <Input placeholder="https:// ссылка на черновик" value={url} onChange={(e) => setUrl(e.target.value)} />
        <Button
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await yardBoard({ data: { action: "add", kind: "draft", url, plot, ...caller() } });
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
          <DraftRow
            key={song.id}
            song={song}
            sent={sent.includes(song.id)}
            onContest={() => setContest(song)}
            onDone={(next) => setSongs(next.filter((s) => s.kind === "draft"))}
            plot={plot}
          />
        ))}
      </div>
    </div>
  );
}

function DraftRow({
  song,
  sent,
  onContest,
  onDone,
  plot = "",
}: {
  song: YardSong;
  sent: boolean;
  onContest: () => void;
  onDone: (songs: YardSong[]) => void;
  plot?: string;
}) {
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
      {mine ? (
        <Button variant="secondary" className="mb-2 w-full rounded-xl" disabled={sent} onClick={onContest}>
          {sent ? "Уже на конкурсе" : `Отправить на конкурс · ${NOTE_PRICE.contest} нот`}
        </Button>
      ) : null}
      <div className="flex items-center justify-between gap-2">
        <a className="font-medium text-fg underline" href={song.url} target="_blank" rel="noreferrer">
          {song.title || song.author}
        </a>
        {sent ? <span className="shrink-0 text-xs text-muted">на конкурсе</span> : null}
      </div>
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
            const res = await yardBoard({ data: { action: "rate", songId: song.id, plot, ...score, ...caller() } });
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
              const res = await yardBoard({ data: { action: "drop", songId: song.id, plot, ...caller() } });
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
type WhisperLine = { id: string; from: string; to: string; text: string; at: number; image?: string; audio?: string; seen?: boolean };

const EMOJI_FONT = '"Segoe UI Emoji","Apple Color Emoji","Noto Color Emoji",sans-serif';

const SMILES = [
  "😀", "😁", "😂", "🤣", "😃", "😄", "😅", "😆", "😉", "😊", "😋", "😎", "😍", "😘", "🥰", "😗",
  "😙", "😚", "🙂", "🤗", "🤩", "🤔", "🤨", "😐", "😑", "😶", "🙄", "😏", "😣", "😥", "😮", "🤐",
  "😯", "😪", "😫", "😴", "😌", "😛", "😜", "😝", "🤤", "😒", "😓", "😔", "😕", "🙃", "🤑", "😲",
  "🙁", "😖", "😞", "😟", "😤", "😢", "😭", "😦", "😧", "😨", "😩", "🤯", "😬", "😰", "😱", "🥵",
  "🥶", "😳", "🤪", "😵", "😡", "😠", "🤬", "😷", "🤒", "🤕", "🤢", "🤮", "🤧", "😇", "🤠", "🥳",
  "🥴", "🥺", "🤥", "🤫", "🤭", "🧐", "🤓", "😈", "👿", "💀", "💩", "🤡", "👻", "👽", "🤖", "😺",
  "😸", "😹", "😻", "😼", "😽", "🙀", "😿", "😾", "💋", "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤",
  "💔", "❣️", "💕", "💞", "💓", "💗", "💖", "💘", "💝", "👍", "👎", "👏", "🙌", "🙏", "🤝", "💪",
  "👀", "🔥", "✨", "⭐", "🌟", "💯", "💥", "💫", "🎉", "🎊", "🎁", "🏆", "👑", "💎", "🔔", "🎵",
  "🎶", "🎤", "🎧", "🎸", "🎹", "🥁", "🎷", "🎺", "🎻", "🎬", "🎭", "🎨", "🎯", "🎮", "🎲", "🎰",
  "🚀", "🏠", "🌙", "☀️", "🌈", "❄️", "🍀", "🌸", "🌹", "🌺", "🌻", "🌷", "💐", "🍄", "🐶", "🐱",
  "🐭", "🐰", "🦊", "🐻", "🐼", "🐨", "🐯", "🦁", "🐮", "🐷", "🐸", "🐵", "🐔", "🐧", "🐦", "🦉",
  "🐺", "🦄", "🐝", "🦋", "🐢", "🐍", "🐙", "🐠", "🐬", "🍎", "🍊", "🍋", "🍌", "🍉", "🍇", "🍓",
  "🍒", "🍑", "🥝", "🍅", "🥑", "🌽", "🍞", "🧀", "🍔", "🍟", "🍕", "🍩", "🍪", "🎂", "☕", "🍺",
  "🍷", "🥂", "🪆", "🧸",
];

const STICKERS = [
  { token: "{{bra}}", src: "/sticker-girl.jpg", label: "девушка" },
  { token: "{{guy}}", src: "/sticker-guy.jpg", label: "качок" },
  { token: "{{bloom}}", src: "/sticker-bloom.jpg", label: "букет" },
];

function HoldMic({ onClip }: { onClip: (data: string) => void }) {
  const recRef = useRef<MediaRecorder | null>(null);
  const holdRef = useRef(false);
  const [on, setOn] = useState(false);

  function stop() {
    holdRef.current = false;
    const rec = recRef.current;
    if (rec && rec.state === "recording") rec.stop();
  }

  async function start(event: PointerEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (!window.isSecureContext || !navigator.mediaDevices?.getUserMedia) {
      toast.error("Микрофон браузер даёт только по https. Сейчас двор на голом http, кнопка поэтому молчит.");
      return;
    }
    if (recRef.current && recRef.current.state === "recording") return;
    holdRef.current = true;
    const button = event.currentTarget;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } });
      if (!holdRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      const mime = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"].find((kind) => MediaRecorder.isTypeSupported(kind)) || "";
      const rec = new MediaRecorder(stream, mime ? { mimeType: mime } : undefined);
      const chunks: Blob[] = [];
      rec.ondataavailable = (chunk) => {
        if (chunk.data.size) chunks.push(chunk.data);
      };
      rec.onstop = () => {
        setOn(false);
        stream.getTracks().forEach((track) => track.stop());
        recRef.current = null;
        const blob = new Blob(chunks, { type: rec.mimeType || mime || "audio/webm" });
        if (blob.size < 800) {
          toast.error("Слишком коротко. Зажми и поговори.");
          return;
        }
        if (blob.size > 120000) {
          toast.error("Голос длиннее 15 секунд не влезает.");
          return;
        }
        const reader = new FileReader();
        reader.onload = () => onClip(String(reader.result || ""));
        reader.readAsDataURL(blob);
      };
      recRef.current = rec;
      rec.start(200);
      if (!holdRef.current) {
        rec.stop();
        return;
      }
      setOn(true);
      try {
        button.setPointerCapture(event.pointerId);
      } catch {
        /* палец уже отпущен */
      }
      window.setTimeout(() => {
        if (rec.state === "recording") rec.stop();
      }, 15000);
    } catch {
      holdRef.current = false;
      toast.error("Микрофон не дался. Разреши его браузеру и зажми кнопку ещё раз.");
    }
  }

  return (
    <button
      type="button"
      aria-label={on ? "Записываю" : "Голосовое, зажми"}
      className={`grid size-11 shrink-0 place-items-center rounded-full ${on ? "bg-red-600 text-white" : "bg-[#2a6f4e] text-white"}`}
      style={{ touchAction: "none" }}
      onContextMenu={(event) => event.preventDefault()}
      onPointerDown={(event) => void start(event)}
      onPointerUp={stop}
      onPointerCancel={stop}
    >
      <MicIcon />
    </button>
  );
}

function ClipIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <path d="M8 12.5 14.2 6.3a3.2 3.2 0 0 1 4.5 4.5l-7.8 7.8a4.4 4.4 0 0 1-6.2-6.2l7.2-7.2" strokeLinecap="round" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden>
      <circle cx="12" cy="12" r="8" />
      <path d="M8.5 13.5c.8 1.4 2 2.1 3.5 2.1s2.7-.7 3.5-2.1" strokeLinecap="round" />
      <circle cx="9" cy="10" r="0.8" fill="currentColor" stroke="none" />
      <circle cx="15" cy="10" r="0.8" fill="currentColor" stroke="none" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-6" fill="currentColor" aria-hidden>
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M7 11a5 5 0 0 0 10 0" fill="none" stroke="currentColor" strokeWidth="1.8" />
      <path d="M12 16v4M8 20h8" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
    </svg>
  );
}

function SendIcon() {
  return (
    <svg viewBox="0 0 24 24" className="size-5" fill="currentColor" aria-hidden>
      <path d="M3.4 11.2 20.2 4.2c.7-.3 1.4.4 1.1 1.1l-7 16.8c-.3.8-1.4.8-1.7 0l-2.4-6.3-6.3-2.4c-.8-.3-.8-1.4 0-1.7Z" />
    </svg>
  );
}

function ChatDock({
  text,
  onText,
  shot,
  onShot,
  placeholder,
  onSubmit,
  onVoice,
}: {
  text: string;
  onText: (value: string) => void;
  shot: string;
  onShot: (value: string) => void;
  placeholder: string;
  onSubmit: () => void;
  onVoice: (data: string) => void;
}) {
  const [pane, setPane] = useState<"" | "smile" | "clip">("");
  const [wish, setWish] = useState("");
  const [drawing, setDrawing] = useState(false);
  const box = useRef<HTMLTextAreaElement>(null);
  const photoRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLInputElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const ready = Boolean(text.trim() || shot);

  useEffect(() => {
    const node = box.current;
    if (!node) return;
    node.style.height = "0px";
    node.style.height = `${Math.min(node.scrollHeight, 156)}px`;
  }, [text]);

  function takeImage(file: File | undefined) {
    if (!file) return;
    if (!file.type.startsWith("image/")) {
      toast.error("В чат пока влезает только фото. Видео и чужие файлы слишком тяжёлые.");
      return;
    }
    void shrinkShot(file).then(onShot).catch(() => toast.error("Картинка не влезла."));
  }

  async function drawSticker() {
    const phrase = wish.trim();
    if (phrase.length < 2 || drawing) return;
    setDrawing(true);
    try {
      const prompt = `Стикер для чата, один герой крупно по центру, жирный контур, плоские яркие цвета, простой белый фон, без надписей, без букв, без водяных знаков. ${phrase}`;
      const res = await fetch(`/api/paint?model=art&w=512&h=512&aspect=1:1&prompt=${encodeURIComponent(prompt)}`, {
        credentials: "same-origin",
      });
      const notes = Number(res.headers.get("X-Notes"));
      if (Number.isFinite(notes)) useWallet.getState().apply({ notes });
      if (!res.ok) {
        toast.error((await res.text()) || "Стикер не вышел.");
        return;
      }
      const blob = await res.blob();
      const file = new File([blob], "sticker.jpg", { type: blob.type || "image/jpeg" });
      onShot(await shrinkShot(file));
      setWish("");
      setPane("");
      toast.success("Стикер готов. Жми кружок отправки.");
    } catch {
      toast.error("Стикер не вышел.");
    } finally {
      setDrawing(false);
    }
  }

  return (
    <div className="relative mt-2">
      {pane === "clip" ? (
        <div className="absolute bottom-full left-0 z-10 mb-2 flex flex-col overflow-hidden rounded-2xl bg-[#1a120c] text-sm text-[#f4e4c4] shadow-xl">
          <button type="button" className="px-4 py-3 text-left hover:bg-white/10" onClick={() => photoRef.current?.click()}>
            Фото
          </button>
          <button type="button" className="px-4 py-3 text-left hover:bg-white/10" onClick={() => videoRef.current?.click()}>
            Видео
          </button>
          <button type="button" className="px-4 py-3 text-left hover:bg-white/10" onClick={() => fileRef.current?.click()}>
            Файл
          </button>
        </div>
      ) : null}
      {pane === "smile" ? (
        <div className="absolute bottom-full right-0 left-0 z-10 mb-2 max-h-72 overflow-auto rounded-2xl border border-border bg-bg p-2 shadow-xl">
          <div className="mb-2 flex gap-1">
            <p className="px-2 py-1 text-xs text-muted">Смайлы цветные. Стикеры ниже. Свой рисует Яндекс, {NOTE_PRICE.art} нот.</p>
          </div>
          <div className="grid grid-cols-8 gap-1" style={{ fontFamily: EMOJI_FONT }}>
            {SMILES.map((smile) => (
              <button
                key={smile}
                type="button"
                className="grid h-10 place-items-center rounded-lg text-2xl hover:bg-surface"
                onClick={() => onText((text + smile).slice(0, 300))}
              >
                {smile}
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            {STICKERS.map((sticker) => (
              <button key={sticker.token} type="button" className="rounded-lg bg-surface p-1" onClick={() => onText((text + sticker.token).slice(0, 300))}>
                <Sticker src={sticker.src} label={sticker.label} />
              </button>
            ))}
          </div>
          <div className="mt-2 flex gap-2">
            <input
              value={wish}
              maxLength={180}
              placeholder="Хочу стикер с котиком"
              className="min-w-0 flex-1 rounded-xl bg-surface px-3 py-2 text-sm text-fg outline-none"
              onChange={(event) => setWish(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  void drawSticker();
                }
              }}
            />
            <Button className="shrink-0 rounded-xl" disabled={drawing || wish.trim().length < 2} onClick={() => void drawSticker()}>
              {drawing ? "Рисует…" : "Стикер"}
            </Button>
          </div>
        </div>
      ) : null}
      <input
        ref={photoRef}
        className="hidden"
        type="file"
        accept="image/*"
        onChange={(event) => {
          takeImage(event.target.files?.[0]);
          event.target.value = "";
          setPane("");
        }}
      />
      <input
        ref={videoRef}
        className="hidden"
        type="file"
        accept="video/*"
        onChange={(event) => {
          event.target.value = "";
          setPane("");
          toast.error("Видео и кружки в чат не кладём. Фото и голос — да.");
        }}
      />
      <input
        ref={fileRef}
        className="hidden"
        type="file"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = "";
          setPane("");
          takeImage(file);
        }}
      />
      <div className="flex items-end gap-1.5">
        <button
          type="button"
          aria-label="Прикрепить"
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg"
          onClick={() => setPane((cur) => (cur === "clip" ? "" : "clip"))}
        >
          <ClipIcon />
        </button>
        <textarea
          ref={box}
          value={text}
          rows={1}
          maxLength={300}
          placeholder={placeholder}
          className="max-h-[156px] min-h-11 w-full resize-none overflow-x-hidden overflow-y-auto rounded-2xl bg-surface px-3 py-2.5 text-base leading-6 break-words whitespace-pre-wrap text-fg outline-none"
          style={{ fontFamily: EMOJI_FONT }}
          onChange={(event) => onText(event.target.value)}
        />
        <button
          type="button"
          aria-label="Смайлы и стикеры"
          className="grid size-11 shrink-0 place-items-center rounded-full text-fg"
          onClick={() => setPane((cur) => (cur === "smile" ? "" : "smile"))}
        >
          <SmileIcon />
        </button>
        {ready ? (
          <button
            type="button"
            aria-label="Отправить"
            className="grid size-11 shrink-0 place-items-center rounded-full bg-[#2a6f4e] text-white"
            onClick={onSubmit}
          >
            <SendIcon />
          </button>
        ) : (
          <HoldMic onClip={onVoice} />
        )}
      </div>
    </div>
  );
}

function Sticker({ src, label, big }: { src: string; label: string; big?: boolean }) {
  return <img src={src} alt={label} className={`mx-0.5 inline-block align-middle object-contain ${big ? "h-28 w-28" : "h-14 w-14"}`} />;
}

function ChatBits({ text }: { text: string }) {
  if (text.startsWith("{{invite}}")) {
    return (
      <p className="my-1 rounded-xl border-2 border-[#c4a574] bg-[#fff6e8] px-3 py-2 text-center text-sm font-medium text-[#1a120c]">
        {text.slice("{{invite}}".length)}
      </p>
    );
  }
  const parts = text.split(/(\{\{bra\}\}|\{\{guy\}\}|\{\{bloom\}\})/g);
  return (
    <p className="text-base leading-snug text-fg" style={{ fontFamily: EMOJI_FONT }}>
      {parts.map((part, index) => {
        if (part === "{{bra}}") return <Sticker key={index} big src="/sticker-girl.jpg" label="девушка" />;
        if (part === "{{guy}}") return <Sticker key={index} big src="/sticker-guy.jpg" label="качок" />;
        if (part === "{{bloom}}") return <Sticker key={index} big src="/sticker-bloom.jpg" label="букет" />;
        return <span key={index}>{part}</span>;
      })}
    </p>
  );
}

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

function ScrollBox({ dep, children }: { dep: unknown; children: ReactNode }) {
  const box = useRef<HTMLDivElement>(null);
  const [follow, setFollow] = useState(true);

  useEffect(() => {
    if (follow && box.current) box.current.scrollTop = box.current.scrollHeight;
  }, [dep, follow]);

  return (
    <div className="relative min-h-0 flex-1">
      <div
        ref={box}
        className="flex h-full flex-col gap-2 overflow-auto text-sm"
        onScroll={(event) => {
          const node = event.currentTarget;
          setFollow(node.scrollHeight - node.scrollTop - node.clientHeight < 64);
        }}
      >
        {children}
      </div>
      {follow ? null : (
        <button
          type="button"
          className="absolute right-2 bottom-2 rounded-full bg-black/75 px-2.5 py-1 text-sm text-white"
          onClick={() => {
            setFollow(true);
            if (box.current) box.current.scrollTop = box.current.scrollHeight;
          }}
        >
          ↓
        </button>
      )}
    </div>
  );
}

function PrivatePane({
  focusId,
  pingPeople,
  onOpenPerson,
  onZoom,
}: {
  focusId?: string;
  pingPeople: string[];
  onOpenPerson: (id: string) => void;
  onZoom: (src: string) => void;
}) {
  const [people, setPeople] = useState<Face[]>([]);
  const [me, setMe] = useState("");
  const [withId, setWithId] = useState(focusId || "");
  const [lines, setLines] = useState<WhisperLine[]>([]);
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [typing, setTyping] = useState("");
  const mine = people.find((person) => person.id === me);
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

  async function send(audioNow = "") {
    const row = await postDoor({
      action: "whisper",
      to: withId,
      text: audioNow ? "" : text,
      image: audioNow ? "" : shot,
      audio: audioNow,
    });
    if (!row.ok) {
      toast.error(row.error || "Не ушло.");
      return;
    }
    if (!audioNow) {
      setText("");
      setShot("");
    }
    setTyping("");
    typedAt.current = 0;
    blip();
    setLines(row.lines || []);
  }

  return (
    <div className="flex min-h-0 flex-1 flex-col">
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
        {withId ? null : others.map((person) => (
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
          <button type="button" className="mb-2 flex items-center gap-2 text-sm text-fg" onClick={() => setWithId("")}>
            <span aria-hidden>←</span>
            <FaceDot photo={talk?.photo} name={talk?.name} />
            {talk?.name || "Назад к чатам"}
          </button>
          <ScrollBox dep={lines.length + lines[lines.length - 1]?.id}>
            {lines.map((line) => {
              const own = line.from === me;
              const face = people.find((person) => person.id === line.from);
              return (
                <div key={line.id} className={own ? "flex flex-row-reverse gap-2" : "flex gap-2"}>
                  <FaceDot photo={face?.photo} name={face?.name} />
                  <div className={own ? "max-w-[75%] rounded-2xl bg-[#fff8ee]/90 px-2 py-1 text-right" : "max-w-[75%] rounded-2xl bg-[#fff8ee]/90 px-2 py-1"}>
                    {line.image ? (
                      <button type="button" onClick={() => onZoom(line.image || "")}>
                        <img src={line.image} alt="" className="mb-1 max-h-40 cursor-zoom-in rounded-lg" />
                      </button>
                    ) : null}
                    {line.audio ? <audio controls src={line.audio} className="mb-1 w-full" /> : null}
                    {line.text ? <ChatBits text={line.text} /> : null}
                    {own ? <p className="text-xs text-accent">{line.seen ? "✓✓" : "✓"}</p> : null}
                  </div>
                </div>
              );
            })}
            {lines.length === 0 ? <p className="text-sm text-muted">Это видите только вы двое. {talk ? talk.name : ""}</p> : null}
          </ScrollBox>
          {typing ? <p className="mt-1 text-xs text-muted">{typing} печатает…</p> : null}
          {shot ? (
            <button type="button" onClick={() => onZoom(shot)}>
              <img src={shot} alt="" className="mt-2 max-h-24 cursor-zoom-in rounded-lg" />
            </button>
          ) : null}
          <ChatDock
            text={text}
            onText={(value) => {
              setText(value);
              poke(value, withId);
            }}
            shot={shot}
            onShot={setShot}
            placeholder="Только ему"
            onSubmit={() => void send()}
            onVoice={(audio) => void send(audio)}
          />
        </>
      ) : null}
    </div>
  );
}

function ChatWallpaper() {
  return (
    <svg className="pointer-events-none absolute inset-0 h-full w-full" aria-hidden>
      <defs>
        <pattern id="kadr-doodles" width="220" height="220" patternUnits="userSpaceOnUse">
          <g fill="none" stroke="#b85c38" strokeWidth="1.6" strokeLinecap="round" opacity="0.55">
            <path d="M28 18l2.2 6.4 6.6.2-5.2 4.2 1.8 6.4L28 31.2 22.6 35.2l1.8-6.4-5.2-4.2 6.6-.2z" />
            <path d="M168 36c0-8 6-14 14-14 4 0 6 3 8 3s4-3 8-3c8 0 14 6 14 14 0 12-14 20-22 26-8-6-22-14-22-26z" />
            <circle cx="40" cy="78" r="7" />
            <circle cx="54" cy="78" r="7" />
            <path d="M40 84c2 4 12 4 14 0" />
            <path d="M118 70c8-16 22-16 22 0 0 10-11 16-11 16s-11-6-11-16z" />
            <circle cx="124" cy="66" r="1.4" fill="#b85c38" />
            <circle cx="134" cy="66" r="1.4" fill="#b85c38" />
            <path d="M186 92c6-14 16-8 16 2 0 8-6 10-8 16-2-6-8-8-8-16 0-6 4-10 0-2z" />
            <path d="M96 16v18M90 24h12" />
            <path d="M70 150c8 0 10-8 10-8s2 8 10 8-6 10-10 16c-4-6-12-8-10-16 0 0 2-8 0 0z" />
            <path d="M150 150l8 18h-6l-2 10-2-10h-6z" />
            <circle cx="154" cy="146" r="4" />
            <path d="M20 160c6-10 16-10 16 2 0 8-8 10-8 16 0-6-8-8-8-16 0-6 4-8 0-2z" />
            <path d="M40 188h16M48 180v16M44 184c6 4 8 4 14 0" />
            <path d="M100 120c10-2 14 8 8 14-8 8-18 2-16-6 1-4 4-8 8-8z" />
            <path d="M108 112c2 4 2 8 0 10" />
            <path d="M190 170c0-8 8-12 12-6 4-8 12-2 10 6 6 2 8 10 2 14-2 8-12 8-16 2-8 2-12-6-8-16z" />
          </g>
          <g fill="none" stroke="#6b4c7a" strokeWidth="1.6" strokeLinecap="round" opacity="0.5">
            <path d="M78 40l14 22h-28z" />
            <path d="M78 62v16M70 70h16" />
            <circle cx="78" cy="54" r="3" />
            <path d="M78 78c-4 6-2 10 0 14 2-4 4-8 0-14z" fill="#e07a3d" stroke="#e07a3d" />
            <path d="M130 168c-8 0-10 8-4 12 6 4 14 0 12-6 4 2 10-2 8-8-4-2-10 0-16 2z" />
            <circle cx="126" cy="164" r="2" />
            <path d="M176 120c8 0 12 6 10 12-6 2-12-2-14-8 2-4 2-4 4-4z" />
            <path d="M186 112v8M182 120c6 8 10 8 14 2" />
            <path d="M48 118c6-8 16-6 16 4 0 8-8 10-8 16 0-6-8-8-8-16 0-4 2-6 0-4z" />
            <circle cx="200" cy="48" r="8" />
            <path d="M200 40a5 5 0 0 0 0 16" />
          </g>
        </pattern>
      </defs>
      <rect width="100%" height="100%" fill="url(#kadr-doodles)" />
    </svg>
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
  plot = "",
  half = false,
}: {
  onClose: () => void;
  focusId?: string;
  pingYard: boolean;
  pingPeople: string[];
  myId: string;
  onSeenYard: (id: string) => void;
  onOpenPerson: (id: string) => void;
  plot?: string;
  half?: boolean;
}) {
  const [lines, setLines] = useState<YardLine[]>([]);
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [typers, setTypers] = useState<{ id: string; name: string }[]>([]);
  const [tab, setTab] = useState<"yard" | "private">(focusId ? "private" : "yard");
  const [tray, setTray] = useState(false);
  const [wide, setWide] = useState(false);
  const [zoom, setZoom] = useState("");
  const typedAt = useRef(0);

  function poke(value: string) {
    const now = Date.now();
    if (value.trim()) {
      if (now - typedAt.current < 2000) return;
      typedAt.current = now;
    } else if (!typedAt.current) return;
    else typedAt.current = 0;
    void yardBoard({ data: { action: "type", text: value.trim() ? "1" : "", plot, ...caller() } });
  }

  async function say(audioNow = "") {
    const res = await yardBoard({
      data: {
        action: "say",
        text: audioNow ? "" : text,
        image: audioNow ? "" : shot,
        audio: audioNow,
        plot,
        ...caller(),
      },
    });
    if (!res.ok) {
      toast.error(res.error || "Не ушло.");
      return;
    }
    if (!audioNow) {
      setText("");
      setShot("");
    }
    typedAt.current = 0;
    blip();
    const next = res.chat || [];
    setLines(next);
    const last = next[next.length - 1];
    if (last) onSeenYard(last.id);
  }

  async function pull() {
    const row = await loadBoard(plot);
    setLines(row.chat);
    setTypers(row.typing);
    const last = row.chat[row.chat.length - 1];
    if (last) onSeenYard(last.id);
  }

  useEffect(() => {
    if (focusId) setTab("private");
  }, [focusId]);

  useEffect(() => {
    const query = window.matchMedia("(min-width: 800px)");
    const apply = () => setWide(query.matches);
    apply();
    query.addEventListener("change", apply);
    return () => query.removeEventListener("change", apply);
  }, []);

  useEffect(() => {
    if (tab !== "yard") return;
    void pull();
    const timer = window.setInterval(() => void pull(), 4000);
    return () => window.clearInterval(timer);
  }, [tab, plot]);

  if (tray) {
    return (
      <button
        type="button"
        className={`absolute right-4 bottom-[max(1rem,env(safe-area-inset-bottom))] z-40 rounded-full bg-[#1a120c] px-4 py-3 text-sm text-[#f4e4c4] shadow-lg ${pingYard || pingPeople.length ? "kadr-blink" : ""}`}
        onClick={() => setTray(false)}
      >
        Чат
      </button>
    );
  }

  return (
    <div
      className={
        half
          ? "absolute inset-x-0 bottom-0 z-40 flex h-full flex-col overflow-hidden bg-[#fff8ee]"
          : wide
          ? "absolute right-4 bottom-4 z-40 flex h-[min(680px,82dvh)] w-[400px] flex-col overflow-hidden rounded-2xl bg-[#fff8ee] shadow-2xl"
          : "absolute inset-0 z-40 flex flex-col overflow-hidden bg-[#fff8ee] pt-[max(0.5rem,env(safe-area-inset-top))]"
      }
    >
      <ChatWallpaper />
      <div className="relative z-10 flex min-h-0 flex-1 flex-col px-4 pt-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl text-fg">Чат</h2>
          <div className="flex gap-1">
            <Button variant="ghost" onClick={() => setTray(true)}>
              Свернуть
            </Button>
            <Button variant="ghost" onClick={onClose}>
              Закрыть
            </Button>
          </div>
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
        {tab === "private" ? <PrivatePane focusId={focusId} pingPeople={pingPeople} onOpenPerson={onOpenPerson} onZoom={setZoom} /> : null}
        {tab === "yard" ? (
          <>
            <ScrollBox dep={lines.length ? lines[lines.length - 1]?.id : 0}>
              {lines.map((line) => {
                const own = Boolean(myId && line.who === myId);
                return (
                  <div key={line.id} className={own ? "flex flex-row-reverse gap-2" : "flex gap-2"}>
                    <FaceDot photo={line.photo} name={line.name} />
                    <div className={own ? "max-w-[75%] rounded-2xl bg-[#fff8ee]/90 px-2 py-1 text-right" : "max-w-[75%] rounded-2xl bg-[#fff8ee]/90 px-2 py-1"}>
                      {!own ? <p className="text-xs font-medium text-fg">{line.name}</p> : null}
                      {line.image ? (
                        <button type="button" onClick={() => setZoom(line.image || "")}>
                          <img src={line.image} alt="" className="mb-1 max-h-40 cursor-zoom-in rounded-lg" />
                        </button>
                      ) : null}
                      {line.audio ? <audio controls src={line.audio} className="mb-1 w-full" /> : null}
                      {line.text ? <ChatBits text={line.text} /> : null}
                      {own ? <p className="text-xs text-accent">✓</p> : null}
                    </div>
                  </div>
                );
              })}
            </ScrollBox>
            {typers.length ? <p className="mt-1 text-xs text-muted">{typers.map((person) => person.name).join(", ")} печатает…</p> : null}
            {shot ? (
              <button type="button" onClick={() => setZoom(shot)}>
                <img src={shot} alt="" className="mt-2 max-h-24 cursor-zoom-in rounded-lg" />
              </button>
            ) : null}
            <ChatDock
              text={text}
              onText={(value) => {
                setText(value);
                poke(value);
              }}
              shot={shot}
              onShot={setShot}
              placeholder="Реплика двору"
              onSubmit={() => void say()}
              onVoice={(audio) => void say(audio)}
            />
          </>
        ) : null}
      </div>
      {zoom ? (
        <button type="button" className="absolute inset-0 z-50 flex items-center justify-center bg-black/92 p-4" onClick={() => setZoom("")}>
          <img src={zoom} alt="" className="max-h-full max-w-full object-contain" />
        </button>
      ) : null}
    </div>
  );
}

function axis(sum: number, votes: number) {
  if (!votes) return "—";
  return (sum / votes).toFixed(1);
}

export function FameCard({ onClose, plot = "" }: { onClose: () => void; plot?: string }) {
  const [rows, setRows] = useState<Hero[]>([]);
  const [shared, setShared] = useState(true);
  const me = useWallet((s) => s.vkId) || caller().heroId;

  useEffect(() => {
    void (async () => {
      const res = await yardBoard({ data: { action: "glory", frames: readFrames(), plot, ...caller() } });
      if (!res.ok) return;
      setRows(res.heroes || []);
      setShared(Boolean(res.shared));
    })();
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[78%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">{plot ? "Слава двора" : "Слава"}</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="text-sm text-muted">
          {plot ? "Только черновики этого двора. Общий зал славы в главном городе." : "Ноты и кадры — кошель. Слава — как двор оценил черновики у шарманщика. Деньги славу не покупают."}
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

export function ContestHall({ onClose }: { onClose: () => void }) {
  const [rows, setRows] = useState<ContestRow[]>([]);
  const [taken, setTaken] = useState(0);
  const [admin, setAdmin] = useState(false);

  function take(data: { entries?: ContestRow[]; taken?: number; admin?: boolean }) {
    if (Array.isArray(data.entries)) setRows(data.entries);
    if (typeof data.taken === "number") setTaken(data.taken);
    if (typeof data.admin === "boolean") setAdmin(data.admin);
  }

  useEffect(() => {
    void fetch("/api/contest")
      .then((res) => res.json())
      .then((data) => {
        if (data?.ok) take(data);
      })
      .catch(() => undefined);
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[78%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Конкурс</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="text-sm text-muted">
          Треки, которые идут в сборник HoldingMusic Матрёшка. В сборник месяца проходят 10 лучших. Сейчас подано {taken}. Свой черновик отправляют кнопкой у шарманщика.
        </p>
        <div className="mt-3 flex flex-col gap-2">
          {rows.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface px-3 py-2 text-sm">
              <p className="font-medium text-fg">
                {row.place}. {row.artist} — {row.title}{" "}
                <span className="text-xs text-muted">{row.passed ? "идёт в сборник" : "на конкурсе"}{row.guest ? " · гость" : ""}</span>
              </p>
              <img src={`/api/contest?id=${row.id}&part=cover`} alt="" className="mt-2 size-16 rounded-lg object-cover" />
              {row.url ? (
                <a className="mt-2 block text-xs underline" href={row.url} target="_blank" rel="noreferrer">
                  Слушать трек
                </a>
              ) : (
                <audio className="mt-2 w-full" controls src={`/api/contest?id=${row.id}&part=audio`} />
              )}
              <p className="mt-1 text-xs text-muted">голосов {row.votes}</p>
              {admin && row.voters?.length ? <p className="mt-1 text-xs text-muted">кто голосовал: {row.voters.join(", ")}</p> : null}
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
                      toast.error(data?.error || "Голос не засчитан.");
                      return;
                    }
                    take(data);
                    toast.success("Голос есть. Статус +1.");
                  })();
                }}
              >
                {row.mine ? "Твой трек" : row.voted ? "Уже голосовал" : "Голос"}
              </Button>
            </div>
          ))}
          {!rows.length ? <p className="text-sm text-muted">Пока пусто. Первые треки появятся, когда их подадут у шарманщика.</p> : null}
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
