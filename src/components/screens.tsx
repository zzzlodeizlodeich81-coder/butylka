import type { ReactNode } from "react";
import { useEffect, useRef, useState } from "react";
import { Flower2, Heart, Music, Plus, Smile, Volume2, VolumeX, X } from "lucide-react";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChatButton, ChatDrawer } from "@/components/chat-drawer";
import { ChavoButton } from "@/components/chavo";
import { PersonAvatar } from "@/components/person-avatar";
import { TrackTakes } from "@/components/track-takes";
import { playUiTick, setMixer, unlockAudio } from "@/lib/audio";
import { getSavedTrack, type SavedTrack } from "@/lib/library";
import { fileToAvatar } from "@/lib/stems";
import {
  GIFT_CATALOG,
  SKIP_COST,
  formatChallenge,
  gradeFor,
  playerById,
  useGame,
  type GiftKind,
  type SkipKind,
} from "@/lib/store";
import { cn } from "@/lib/utils";

export function Wordmark({ large = false }: { large?: boolean }) {
  return (
    <div className={cn("flex items-center gap-2.5", large && "flex-col gap-5")}>
      <svg
        viewBox="0 0 32 32"
        className={large ? "size-14 text-glass" : "size-7 text-glass"}
        aria-hidden="true"
      >
        <path
          fill="currentColor"
          d="M15.4 3.2h1.2c.4 0 .7.3.7.7v10.2l6.2 11.4c.2.4 0 .9-.5.9H8.8c-.5 0-.7-.5-.5-.9l6.2-11.4V3.9c0-.4.3-.7.7-.7Z"
        />
        <rect x="14.6" y="2.2" width="2.8" height="2.2" rx="0.6" className="fill-accent" />
        <circle cx="16" cy="19.4" r="1.4" className="fill-accent" />
      </svg>
      <p className={cn("font-display tracking-wide text-fg", large ? "text-4xl" : "text-base")}>
        БАЛАЛАЕЧКА
      </p>
    </div>
  );
}

export function GateScreen() {
  const enter = useGame((s) => s.enter);
  return (
    <div className="flex min-h-dvh flex-col items-center justify-between px-6 py-[max(2rem,env(safe-area-inset-top))]">
      <div />
      <div className="flex flex-col items-center text-center">
        <Wordmark large />
        <p className="mt-5 max-w-xs text-base leading-relaxed text-muted">
          Свои треки с Suno. Балалайка выбирает кто поёт. Хиты не кладём.
        </p>
        <div className="mt-5">
          <ChavoButton />
        </div>
      </div>
      <Button
        size="lg"
        className="mb-[max(1.5rem,env(safe-area-inset-bottom))] h-14 w-full max-w-sm rounded-xl"
        onClick={() => {
          unlockAudio();
          playUiTick();
          enter();
        }}
      >
        Войти
      </Button>
    </div>
  );
}

export function ProfileScreen() {
  const youId = useGame((s) => s.youId);
  const you = useGame((s) => s.players.find((p) => p.id === s.youId));
  const setPlayerName = useGame((s) => s.setPlayerName);
  const setAvatar = useGame((s) => s.setAvatar);
  const toLobby = useGame((s) => s.toLobby);
  const fileRef = useRef<HTMLInputElement>(null);

  async function onPhoto(file: File | undefined) {
    if (!file) return;
    try {
      const url = await fileToAvatar(file);
      setAvatar(youId, url);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Не вышло загрузить фото.");
    }
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <Wordmark />
      <h1 className="mt-8 font-display text-3xl text-fg">Это ты</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Фото рядом с именем. Можно не загружать — тогда будет микрофон.
      </p>
      <button
        type="button"
        className="mx-auto mt-8"
        onClick={() => fileRef.current?.click()}
        aria-label="Загрузить фото"
      >
        <PersonAvatar url={you?.avatarUrl ?? null} name={you?.name ?? ""} size="xl" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => onPhoto(e.target.files?.[0])}
      />
      <p className="mt-3 text-center text-sm text-subtle">Нажми на круг, чтобы загрузить фото</p>
      <Input
        className="mt-6"
        value={you?.name ?? ""}
        onChange={(e) => setPlayerName(youId, e.target.value)}
        maxLength={16}
        placeholder="Имя"
        aria-label="Имя"
      />
      <div className="mt-auto flex flex-1 flex-col justify-end gap-2 pt-8">
        {you?.avatarUrl ? (
          <Button variant="ghost" onClick={() => setAvatar(youId, null)}>
            Убрать фото
          </Button>
        ) : null}
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onClick={() => {
            playUiTick();
            toLobby();
          }}
        >
          Дальше
        </Button>
      </div>
    </div>
  );
}

function AvatarPicker({ id, url, name }: { id: string; url: string | null; name: string }) {
  const setAvatar = useGame((s) => s.setAvatar);
  const fileRef = useRef<HTMLInputElement>(null);
  return (
    <>
      <button type="button" onClick={() => fileRef.current?.click()} aria-label={`Фото ${name}`}>
        <PersonAvatar url={url} name={name} size="md" />
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={async (e) => {
          const file = e.target.files?.[0];
          if (!file) return;
          try {
            setAvatar(id, await fileToAvatar(file));
          } catch (err) {
            toast.error(err instanceof Error ? err.message : "Не вышло загрузить фото.");
          }
        }}
      />
    </>
  );
}

export function Lobby() {
  const players = useGame((s) => s.players);
  const youId = useGame((s) => s.youId);
  const mode = useGame((s) => s.mode);
  const roomCode = useGame((s) => s.roomCode);
  const setPlayerName = useGame((s) => s.setPlayerName);
  const addPlayer = useGame((s) => s.addPlayer);
  const removePlayer = useGame((s) => s.removePlayer);
  const toBring = useGame((s) => s.toBring);
  const createRoom = useGame((s) => s.createRoom);
  const joinRoom = useGame((s) => s.joinRoom);
  const playLocal = useGame((s) => s.playLocal);
  const [code, setCode] = useState("");

  function shareLink(next: string) {
    const url = `${window.location.origin}/r/${next}`;
    void navigator.clipboard?.writeText(url).then(
      () => toast.success("Ссылка скопирована."),
      () => toast.message(url),
    );
    window.history.replaceState(null, "", `/r/${next}`);
  }

  if (mode === "net" && roomCode) {
    return (
      <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
        <Wordmark />
        <h1 className="mt-8 font-display text-3xl text-fg">Стол {roomCode}</h1>
        <p className="mt-2 text-sm leading-relaxed text-muted">
          Ссылка на стол. До 8 человек, хоть из разных городов. Каждый кидает свой Suno.
        </p>
        <ul className="mt-6 flex flex-1 flex-col gap-2">
          {players.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <PersonAvatar url={p.avatarUrl} name={p.name} size="md" />
              <p className="font-medium text-fg">{p.name}</p>
              {p.id === youId ? <span className="text-xs text-subtle">ты</span> : null}
            </li>
          ))}
        </ul>
        <div className="mt-4 flex flex-col gap-2">
          <Button variant="secondary" onClick={() => shareLink(roomCode)}>
            Скопировать ссылку
          </Button>
          <Button
            size="lg"
            className="h-14 rounded-xl"
            disabled={players.length < 2}
            onClick={() => {
              playUiTick();
              toBring();
            }}
          >
            {players.length < 2 ? "Ждём ещё человека" : "Дальше — колода"}
          </Button>
          <Button variant="ghost" onClick={() => playLocal()}>
            Один телефон
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto flex min-h-dvh w-full max-w-lg flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-[max(1rem,env(safe-area-inset-top))]">
      <Wordmark />
      <h1 className="mt-8 font-display text-3xl text-fg">Кто за столом</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        По сети — свои телефоны. На одном телефоне — как раньше.
      </p>

      <ul className="mt-6 flex flex-1 flex-col gap-2">
        {players.map((p) => (
          <li key={p.id} className="flex items-center gap-2">
            <AvatarPicker id={p.id} url={p.avatarUrl} name={p.name} />
            <Input
              value={p.name}
              onChange={(e) => setPlayerName(p.id, e.target.value)}
              maxLength={16}
              aria-label="Имя"
            />
            <span className="flex w-10 items-center justify-end gap-0.5 tabular-nums text-xs text-muted">
              <Music className="size-3" />
              {p.notes}
            </span>
            <Button
              variant="ghost"
              size="icon"
              aria-label="Убрать"
              disabled={players.length <= 2 || p.id === youId}
              onClick={() => removePlayer(p.id)}
            >
              <X />
            </Button>
          </li>
        ))}
      </ul>

      <div className="mt-4 flex flex-col gap-2">
        <Button variant="secondary" onClick={addPlayer} disabled={players.length >= 8}>
          <Plus />
          Ещё человек на этом телефоне
        </Button>
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onClick={() => {
            playUiTick();
            const next = createRoom();
            shareLink(next);
          }}
        >
          Стол по сети
        </Button>
        <div className="flex gap-2">
          <Input
            placeholder="код стола"
            value={code}
            onChange={(e) => setCode(e.target.value)}
            maxLength={16}
          />
          <Button
            variant="secondary"
            onClick={() => {
              joinRoom(code);
              playUiTick();
            }}
          >
            Войти
          </Button>
        </div>
        <Button
          variant="ghost"
          onClick={() => {
            playUiTick();
            playLocal();
            toBring();
          }}
        >
          Один телефон — колода
        </Button>
      </div>
    </div>
  );
}

function KissMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <path
        d="M5 10c2-3 5-3 7 0 2-3 5-3 7 0 1 1.5-1 4-7 7-6-3-8-5.5-7-7Z"
        fill="currentColor"
      />
    </svg>
  );
}

function BearMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden>
      <circle cx="7" cy="7" r="3.2" fill="currentColor" />
      <circle cx="17" cy="7" r="3.2" fill="currentColor" />
      <circle cx="12" cy="13.5" r="7" fill="currentColor" />
      <circle cx="10" cy="13" r="1.1" className="fill-bg" />
      <circle cx="14" cy="13" r="1.1" className="fill-bg" />
    </svg>
  );
}

export function Reveal() {
  const players = useGame((s) => s.players);
  const singer = playerById(players, useGame((s) => s.singerId));
  const partner = playerById(players, useGame((s) => s.partnerId));
  const challenge = useGame((s) => s.challenge);
  const toSongPick = useGame((s) => s.toSongPick);
  const skipTurn = useGame((s) => s.skipTurn);
  const omen = useGame((s) => s.omen);
  const omenSong = useGame((s) => s.omenSong);
  const [skipOpen, setSkipOpen] = useState(false);
  const [toId, setToId] = useState<string | null>(null);
  if (!singer || !challenge) return null;
  const others = players.filter((p) => p.id !== singer.id);

  function skip(kind: SkipKind) {
    const target = toId ?? others[0]?.id;
    if (!target) return;
    const ok = skipTurn(target, kind);
    if (!ok) {
      toast.error("Нужна 1 нота, чтобы пропустить.");
      return;
    }
    playUiTick();
    const to = playerById(useGame.getState().players, target);
    toast.success(
      kind === "kiss"
        ? `${singer!.name} отправил поцелуй ${to?.name}`
        : `${singer!.name} отправил смайл ${to?.name}`,
    );
  }

  return (
    <div className="mx-auto flex min-h-0 flex-1 flex-col items-center justify-between px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] text-center">
      <div />
      <div>
        <PersonAvatar url={singer.avatarUrl} name={singer.name} size="lg" className="mx-auto" />
        <p className="mt-3 text-sm tracking-wide text-muted">{omen ? "Чёрная балалайка выбрала" : "Поёт"}</p>
        <p className="mt-2 font-display text-5xl text-fg">{singer.name}</p>
        {partner ? <p className="mt-3 text-lg text-muted">вместе с {partner.name}</p> : null}
        <p className="mx-auto mt-6 max-w-sm text-base leading-relaxed text-fg">
          {formatChallenge(challenge, partner?.name)}
        </p>
        {omen && omenSong ? (
          <p className="mt-4 text-sm text-muted">
            {omenSong.title} · {omenSong.artist}
          </p>
        ) : null}
      </div>
      <div className="flex w-full flex-col gap-2">
        {!omen && skipOpen ? (
          <div className="rounded-xl border border-border bg-surface p-4 text-left">
            <p className="text-sm text-muted">Кому отправить и пропустить — {SKIP_COST} нота</p>
            <div className="mt-3 flex flex-wrap gap-2">
              {others.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setToId(p.id)}
                  className={cn(
                    "flex items-center gap-2 rounded-full border px-2 py-1.5 text-sm",
                    toId === p.id ? "border-accent bg-accent text-accent-fg" : "border-border text-fg",
                  )}
                >
                  <PersonAvatar url={p.avatarUrl} name={p.name} size="sm" />
                  {p.name}
                </button>
              ))}
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button variant="secondary" onClick={() => skip("kiss")} disabled={singer.notes < SKIP_COST}>
                <KissMark className="size-4" />
                Поцелуй
              </Button>
              <Button variant="secondary" onClick={() => skip("smile")} disabled={singer.notes < SKIP_COST}>
                <Smile />
                Смайл
              </Button>
            </div>
          </div>
        ) : !omen ? (
          <Button variant="outline" onClick={() => setSkipOpen(true)}>
            Не хочу петь
          </Button>
        ) : null}
        <Button
          size="lg"
          className="h-14 w-full rounded-xl"
          onClick={() => {
            unlockAudio();
            playUiTick();
            toSongPick();
          }}
        >
          {omen ? "Петь это" : "Выбрать песню"}
        </Button>
      </div>
    </div>
  );
}

function giftIcon(kind: GiftKind) {
  if (kind === "flowers") return <Flower2 className="size-4" />;
  if (kind === "bear") return <BearMark className="size-4" />;
  return <Music className="size-4" />;
}

export function Result() {
  const lastScore = useGame((s) => s.lastScore);
  const lastHadMic = useGame((s) => s.lastHadMic);
  const song = useGame((s) => s.song);
  const players = useGame((s) => s.players);
  const nextRound = useGame((s) => s.nextRound);
  const backToLobby = useGame((s) => s.backToLobby);
  const toVerse = useGame((s) => s.toVerse);
  const singer = playerById(players, useGame((s) => s.singerId));
  const youId = useGame((s) => s.youId);
  const lastGifts = useGame((s) => s.lastGifts);
  const lastHearts = useGame((s) => s.lastHearts);
  const lastTake = useGame((s) => s.lastTake);
  const sendHeart = useGame((s) => s.sendHeart);
  const sendGift = useGame((s) => s.sendGift);
  const grade = gradeFor(lastScore);
  const ranked = [...players].sort((a, b) => b.score - a.score);
  const givers = players.filter((p) => p.id !== singer?.id);
  const [giverId, setGiverId] = useState(givers.find((p) => p.id === youId)?.id ?? givers[0]?.id ?? "");
  const giver = playerById(players, giverId);
  const [take, setTake] = useState<SavedTrack | null>(null);

  useEffect(() => {
    if (!song || song.pack !== "mine") {
      setTake(null);
      return;
    }
    void getSavedTrack(song.id).then(setTake).catch(() => setTake(null));
  }, [song, lastTake]);

  const downloadTrack =
    take || lastTake
      ? {
          ...(take ?? {
            id: song?.id ?? "take",
            title: song?.title ?? "запись",
            lyrics: "",
            duration: song?.audioDuration ?? 0,
            mime: lastTake?.type || "audio/webm",
            addedAt: Date.now(),
            blob: lastTake ?? new Blob(),
          }),
          takeBlob: lastTake ?? take?.takeBlob,
        }
      : null;

  return (
    <div className="mx-auto flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <div className="flex items-center gap-3">
        <PersonAvatar url={singer?.avatarUrl ?? null} name={singer?.name ?? ""} size="lg" />
        <div>
          <p className="text-sm text-muted">{singer?.name}</p>
          <p className="font-display text-4xl tabular-nums text-fg">{lastScore}</p>
        </div>
      </div>
      <p className="mt-1 text-lg text-fg">{grade.title}</p>
      <p className="text-sm text-muted">
        {lastHadMic ? grade.hint : "Без микрофона — засчитали присутствие."}
      </p>
      {song ? (
        <p className="mt-2 text-sm text-subtle">
          {song.title} · {song.artist}
          {song.minus ? " · минус" : ""}
        </p>
      ) : null}
      {downloadTrack ? <TrackTakes track={downloadTrack} className="mt-3" /> : null}

      <div className="mt-4 rounded-xl border border-border bg-surface p-3">
        <p className="text-xs text-muted">Оценить. Сердце бесплатно, подарки — за ноты.</p>
        {givers.length > 1 ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {givers.map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => setGiverId(p.id)}
                className={cn(
                  "flex items-center gap-1.5 rounded-full border px-2 py-1 text-xs",
                  giverId === p.id ? "border-accent bg-accent text-accent-fg" : "border-border text-muted",
                )}
              >
                <PersonAvatar url={p.avatarUrl} name={p.name} size="sm" />
                {p.name}
                <span className="tabular-nums">{p.notes}</span>
              </button>
            ))}
          </div>
        ) : null}
        <div className="mt-3 grid grid-cols-4 gap-2">
          <Button
            variant="secondary"
            className="h-auto flex-col py-2 text-xs"
            onClick={() => {
              if (!giverId) return;
              sendHeart(giverId);
              playUiTick();
            }}
          >
            <Heart className="size-4" />
            Сердце
            <span className="text-subtle">0</span>
          </Button>
          {GIFT_CATALOG.map((g) => (
            <Button
              key={g.id}
              variant="secondary"
              className="h-auto flex-col py-2 text-xs"
              disabled={!giver || giver.notes < g.cost}
              onClick={() => {
                const ok = sendGift(giverId, g.id);
                if (!ok) toast.error("Не хватает нот.");
                else playUiTick();
              }}
            >
              {giftIcon(g.id)}
              {g.label}
              <span className="text-subtle">{g.cost}</span>
            </Button>
          ))}
        </div>
        <p className="mt-2 text-xs text-muted">
          Сердец за этот круг: {lastHearts}
          {lastGifts.length
            ? ` · подарки: ${lastGifts.map((g) => GIFT_CATALOG.find((x) => x.id === g.kind)?.label).join(", ")}`
            : ""}
        </p>
      </div>

      <ol className="mt-4 flex min-h-0 flex-1 flex-col gap-2 overflow-auto">
        {ranked.map((p, i) => (
          <li key={p.id} className="flex items-center justify-between rounded-lg bg-surface px-3 py-2">
            <span className="flex items-center gap-2 text-sm text-fg">
              <span className="w-5 tabular-nums text-muted">{i + 1}</span>
              <PersonAvatar url={p.avatarUrl} name={p.name} size="sm" />
              {p.name}
            </span>
            <span className="flex items-center gap-3 tabular-nums text-sm text-muted">
              <span className="flex items-center gap-1">
                <Heart className="size-3" />
                {p.hearts}
              </span>
              <span className="flex items-center gap-1">
                <Music className="size-3" />
                {p.notes}
              </span>
              {p.score}
            </span>
          </li>
        ))}
      </ol>

      <div className="mt-4 flex flex-col gap-2">
        <Button
          size="lg"
          className="h-14 rounded-xl"
          onClick={() => {
            playUiTick();
            nextRound();
          }}
        >
          Ещё круг
        </Button>
        <Button variant="ghost" onClick={toVerse}>
          Ещё круг строк
        </Button>
        <Button variant="ghost" onClick={backToLobby}>
          Сменить компанию
        </Button>
      </div>
    </div>
  );
}

export function Chrome({ children }: { children: ReactNode }) {
  const phase = useGame((s) => s.phase);
  const muted = useGame((s) => s.muted);
  const toggleMute = useGame((s) => s.toggleMute);
  const musicGain = useGame((s) => s.musicGain);
  const sfxGain = useGame((s) => s.sfxGain);
  const setMusicGain = useGame((s) => s.setMusicGain);
  const setSfxGain = useGame((s) => s.setSfxGain);
  const players = useGame((s) => s.players);
  const round = useGame((s) => s.round);
  const you = useGame((s) => s.players.find((p) => p.id === s.youId));
  const lastSkip = useGame((s) => s.lastSkip);
  const omen = useGame((s) => s.omen);
  const cookStatus = useGame((s) => s.cookStatus);

  return (
    <div className="relative mx-auto flex min-h-dvh w-full max-w-lg flex-col bg-bg">
      <header className="flex items-center justify-between gap-3 px-5 pt-[max(0.85rem,env(safe-area-inset-top))] pb-2">
        <Wordmark />
        <div className="flex items-center gap-1">
          {you ? (
            <span className="mr-1 flex items-center gap-1.5 text-sm text-muted">
              <PersonAvatar url={you.avatarUrl} name={you.name} size="sm" />
              <Music className="size-3.5" />
              <span className="tabular-nums">{you.notes}</span>
            </span>
          ) : null}
          {phase !== "lobby" && phase !== "bring" && phase !== "profile" ? (
            <Badge className="tabular-nums">
              {omen ? "тёмная" : cookStatus === "cooking" ? "сборка" : `раунд ${round}`}
            </Badge>
          ) : null}
          <ChatButton />
          <ChavoButton compact />
          <Button
            variant="ghost"
            size="icon"
            aria-label={muted ? "Включить звук" : "Выключить звук"}
            onClick={() => {
              toggleMute();
              const next = useGame.getState();
              setMixer({ muted: next.muted, music: next.musicGain, sfx: next.sfxGain });
            }}
          >
            {muted ? <VolumeX /> : <Volume2 />}
          </Button>
        </div>
      </header>
      {lastSkip && phase === "table" ? (
        <p className="px-5 pb-1 text-center text-sm text-muted">
          {playerById(players, lastSkip.fromId)?.name}{" "}
          {lastSkip.kind === "kiss" ? "отправил поцелуй" : "отправил смайл"}{" "}
          {playerById(players, lastSkip.toId)?.name} и пропустил круг
        </p>
      ) : null}
      {phase === "table" ? (
        <div className="px-5 pb-1">
          <div className="flex gap-3 text-xs text-subtle">
            <label className="flex flex-1 items-center gap-2">
              музыка
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={musicGain}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setMusicGain(v);
                  setMixer({ music: v });
                }}
                className="w-full accent-accent"
              />
            </label>
            <label className="flex flex-1 items-center gap-2">
              стол
              <input
                type="range"
                min={0}
                max={1}
                step={0.01}
                value={sfxGain}
                onChange={(e) => {
                  const v = Number(e.target.value);
                  setSfxGain(v);
                  setMixer({ sfx: v });
                }}
                className="w-full accent-accent"
              />
            </label>
          </div>
        </div>
      ) : null}
      {children}
      <ChatDrawer />
    </div>
  );
}
