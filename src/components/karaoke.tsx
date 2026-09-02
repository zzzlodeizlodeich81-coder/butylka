import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { toast } from "sonner";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
  now,
  playUiTick,
  startMic,
  startMixedTake,
  startTrack,
  stopTrack,
  trackTime,
  unlockAudio,
  type MicHandle,
  type MixedTake,
} from "@/lib/audio";
import { getSavedTrack, listSavedTracks, saveTrack, songFromSaved } from "@/lib/library";
import { songDuration, type Song } from "@/lib/songs";
import { COVER_COST, TAKE_COST, formatChallenge, playerById, useGame } from "@/lib/store";
import { useNet } from "@/components/net-sync";

function currentLine(song: Song, t: number) {
  if (t < (song.lines[0]?.t ?? 0)) return { i: -1, line: null };
  for (let i = 0; i < song.lines.length; i++) {
    const line = song.lines[i];
    if (t < line.t + line.duration) return { i, line };
  }
  return { i: song.lines.length, line: null };
}

export function KaraokeStage() {
  const song = useGame((s) => s.song);
  const players = useGame((s) => s.players);
  const singer = playerById(players, useGame((s) => s.singerId));
  const youId = useGame((s) => s.youId);
  const net = useNet();
  const mine = singer?.id === youId;
  const partner = playerById(players, useGame((s) => s.partnerId));
  const challenge = useGame((s) => s.challenge);
  const finishKaraoke = useGame((s) => s.finishKaraoke);
  const setLastTake = useGame((s) => s.setLastTake);
  const spendNotes = useGame((s) => s.spendNotes);
  const replaceCustomSongs = useGame((s) => s.replaceCustomSongs);
  const singerNotes = singer?.notes ?? 0;
  const [lane, setLane] = useState<"ask" | "live" | "take" | "cover" | null>(null);
  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [hadMic, setHadMic] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const [armed, setArmed] = useState(false);
  const startedAtRef = useRef(0);
  const durationRef = useRef(40);
  const elapsedRef = useRef(0);
  const doneRef = useRef(false);
  const startedRef = useRef(false);
  const armedRef = useRef(false);
  const micRef = useRef<MicHandle | null>(null);
  const recRef = useRef<MixedTake | null>(null);
  const energyRef = useRef({
    sum: 0,
    n: 0,
    lineEnergy: 0,
    lineN: 0,
    scored: new Set<number>(),
  });

  async function settle() {
    if (doneRef.current || !song) return;
    doneRef.current = true;
    net?.setLocalAudio(null);
    const rec = recRef.current;
    recRef.current = null;
    const hadFallbackMic = Boolean(micRef.current);
    let blob: Blob | null = null;
    if (rec) {
      try {
        blob = await rec.stop();
      } catch {
        blob = null;
      }
    }
    stopTrack();
    micRef.current?.stop();
    micRef.current = null;
    const e = energyRef.current;
    const hits = e.scored.size;
    const avg = e.n ? e.sum / e.n : 0;
    const usedMic = hadFallbackMic || Boolean(blob && blob.size > 2000);
    let score: number;
    if (usedMic) {
      score = Math.round(
        (hits / Math.max(1, song.lines.length)) * 7800 + Math.min(1, avg * 4) * 2200,
      );
    } else {
      const stay = Math.min(1, elapsedRef.current / durationRef.current);
      score = Math.round(2400 + stay * 1800);
    }
    if (blob && blob.size > 2000) {
      setLastTake(blob);
      if (song.pack === "mine") {
        try {
          const saved = await getSavedTrack(song.id);
          if (saved) {
            await saveTrack({ ...saved, takeBlob: blob });
            const all = await listSavedTracks();
            replaceCustomSongs(all.map((t) => songFromSaved(t, singer?.name ?? saved.title)));
          }
        } catch {
          /* keep lastTake in memory */
        }
      }
    }
    finishKaraoke(Math.min(9999, score), usedMic);
  }

  const begin = useCallback((play: Song, withMic: boolean) => {
    if (!play || startedRef.current || doneRef.current) return false;
    unlockAudio();
    startedRef.current = true;
    armedRef.current = false;
    setArmed(false);
    setNeedsTap(false);
    durationRef.current = Math.max(12, songDuration(play));

    const arm = (startedAt: number, duration?: number) => {
      startedAtRef.current = startedAt;
      if (duration && duration > 8) durationRef.current = duration;
      armedRef.current = true;
      setArmed(true);
    };

    if (withMic && play.audioUrl) {
      void startMixedTake(play.audioUrl).then((rec) => {
        if (doneRef.current) {
          void rec?.stop();
          return;
        }
        if (rec) {
          recRef.current = rec;
          arm(now(), rec.duration() || songDuration(play));
          setHadMic(true);
          if (useGame.getState().mode === "net") {
            void navigator.mediaDevices
              .getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true } })
              .then((stream) => {
                net?.setLocalAudio(stream);
              })
              .catch(() => {
                /* peers hear minus only */
              });
          }
          return;
        }
        const handle = startTrack(play);
        if (handle) {
          arm(handle.startedAt, handle.duration);
        } else {
          startedRef.current = false;
          setNeedsTap(true);
          return;
        }
        void startMic().then((mic) => {
          if (doneRef.current) {
            mic?.stop();
            return;
          }
          micRef.current = mic;
          setHadMic(Boolean(mic));
        });
      });
    } else {
      const handle = startTrack(play);
      if (!handle) {
        startedRef.current = false;
        setNeedsTap(true);
        return false;
      }
      arm(handle.startedAt, handle.duration);
      setHadMic(false);
    }

    window.setTimeout(() => {
      if (!armedRef.current && !useGame.getState().muted) setNeedsTap(true);
    }, 4000);
    return true;
  }, []);

  function playSongFor(kind: "live" | "take" | "cover"): Song | null {
    if (!song) return null;
    if (kind === "take" && song.takeUrl) return { ...song, audioUrl: song.takeUrl, minus: false };
    if (kind === "cover" && song.coverUrl) return { ...song, audioUrl: song.coverUrl, minus: false };
    return song;
  }

  function pickLane(kind: "live" | "take" | "cover") {
    if (!singer) return;
    if (kind === "take") {
      if (!song?.takeUrl) {
        toast.error("Нет записи. Спой в студии до стола.");
        return;
      }
      if (!spendNotes(singer.id, TAKE_COST)) {
        toast.error(`Нужно ${TAKE_COST} ноты.`);
        return;
      }
    }
    if (kind === "cover") {
      if (!song?.coverUrl) {
        toast.error("Нет кавера. Свари в студии.");
        return;
      }
      if (!spendNotes(singer.id, COVER_COST)) {
        toast.error(`Нужно ${COVER_COST} ноты.`);
        return;
      }
    }
    const play = playSongFor(kind);
    if (!play) return;
    setLane(kind);
    playUiTick();
    if (!begin(play, kind === "live")) setNeedsTap(true);
  }

  useEffect(() => {
    if (!song) return;
    startedRef.current = false;
    doneRef.current = false;
    armedRef.current = false;
    setArmed(false);
    setLane(null);
    let live = true;
    const timers = [1, 2, 3].map((s) =>
      window.setTimeout(() => {
        if (live) setCount(3 - s);
      }, s * 700),
    );
    const startTimer = window.setTimeout(() => {
      if (!live) return;
      const me = useGame.getState().youId === useGame.getState().singerId;
      if ((song.hasTake || song.hasCover) && me) {
        setLane("ask");
        return;
      }
      setLane("live");
      if (!begin(song, me)) setNeedsTap(true);
    }, 2100);

    return () => {
      live = false;
      timers.forEach(clearTimeout);
      clearTimeout(startTimer);
      startedRef.current = false;
      armedRef.current = false;
      stopTrack();
      micRef.current?.stop();
      void recRef.current?.stop();
      recRef.current = null;
    };
  }, [song, begin]);

  useEffect(() => {
    if (count > 0 || !song || !lane || lane === "ask") return;
    let raf = 0;
    const tick = () => {
      if (!armedRef.current) {
        raf = requestAnimationFrame(tick);
        return;
      }
      const recT = recRef.current?.time();
      const fileT = recT != null ? recT : trackTime();
      const t = fileT != null ? fileT : Math.max(0, now() - startedAtRef.current);
      elapsedRef.current = t;
      setElapsed(t);
      const recDur = recRef.current?.duration() ?? 0;
      if (recDur > 8) durationRef.current = recDur;
      const lvl = recRef.current?.level() ?? micRef.current?.level() ?? 0;
      setLevel(lvl);
      const { i } = currentLine(song, t);
      const e = energyRef.current;
      if (i >= 0 && i < song.lines.length) {
        e.lineEnergy += lvl;
        e.lineN += 1;
        if (lvl > 0.08) e.sum += lvl;
        e.n += 1;
        if (e.lineN > 6 && e.lineEnergy / e.lineN > 0.07) e.scored.add(i);
      }
      if (t >= durationRef.current && t > 2) {
        const s = useGame.getState();
        if (s.mode === "net" && s.singerId !== s.youId) {
          raf = requestAnimationFrame(tick);
          return;
        }
        settle();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, song, lane]);

  if (!song || !singer) return null;

  const t = elapsed;
  const { i, line } = currentLine(song, t);
  const prev = i > 0 ? song.lines[i - 1] : null;
  const next = i >= 0 && i < song.lines.length - 1 ? song.lines[i + 1] : song.lines[0];
  const progress = Math.min(1, t / durationRef.current);
  const lineP = line != null ? Math.min(1, Math.max(0, (t - line.t) / line.duration)) : 0;

  return (
    <div
      className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]"
      onPointerDown={() => {
        unlockAudio();
        if (count <= 0 && !startedRef.current && lane && lane !== "ask") {
          const play = playSongFor(lane);
          if (play) begin(play, lane === "live");
        }
      }}
    >
      <div className="flex items-start justify-between gap-3 pt-1">
        <div>
          <p className="font-display text-lg leading-tight text-fg">{song.title}</p>
          <p className="text-sm text-muted">
            {song.artist}
            {song.generated ? " · только что" : ""}
          </p>
        </div>
        <div className="flex items-center gap-2 text-muted">
          {hadMic ? <Mic className="size-4" /> : <MicOff className="size-4" />}
          <span className="tabular-nums text-sm">
            {Math.max(0, Math.round((1 - progress) * durationRef.current))}с
          </span>
        </div>
      </div>

      <p className="mt-2 flex items-center gap-2 text-sm text-muted">
        <PersonAvatar url={singer.avatarUrl} name={singer.name} size="sm" />
        {singer.name}
        {partner ? ` + ${partner.name}` : ""}
        {challenge ? ` · ${formatChallenge(challenge, partner?.name)}` : ""}
      </p>

      <div className="relative mt-3 h-1 overflow-hidden rounded-full bg-surface-2">
        <div className="h-full bg-accent" style={{ width: `${progress * 100}%` }} />
      </div>

      <div className="flex min-h-0 flex-1 flex-col items-center justify-center py-6 text-center">
        {needsTap ? (
          <button
            type="button"
            className="flex flex-col items-center gap-3 text-fg"
            onClick={() => {
              unlockAudio();
              startedRef.current = false;
              const kind = lane && lane !== "ask" ? lane : "live";
              const play = playSongFor(kind) ?? song;
              begin(play, kind === "live");
            }}
          >
            <Volume2 className="size-10 text-accent" />
            <span className="font-display text-2xl">Нажми — звук</span>
            <span className="max-w-xs text-sm text-muted">
              Ноут часто глушит музыку, пока не ткнёшь экран.
            </span>
          </button>
        ) : count > 0 ? (
          <p className="font-display text-7xl text-fg">{count}</p>
        ) : lane === "ask" ? (
          <div className="flex w-full max-w-sm flex-col gap-2">
            <p className="font-display text-2xl text-fg">Как поёшь?</p>
            <p className="mb-2 text-sm text-muted">
              Живьём бесплатно. Запись и кавер — ноты. У {singer.name} {singerNotes}.
            </p>
            <Button className="rounded-xl" onClick={() => pickLane("live")}>
              Петь живьём · 0
            </Button>
            <Button
              variant="secondary"
              className="rounded-xl"
              disabled={!song.hasTake}
              onClick={() => pickLane("take")}
            >
              Моя запись · {TAKE_COST} ноты
            </Button>
            <Button
              variant="secondary"
              className="rounded-xl"
              disabled={!song.hasCover}
              onClick={() => pickLane("cover")}
            >
              Кавер · {COVER_COST} ноты
            </Button>
          </div>
        ) : !armed ? (
          <p className="font-display text-2xl text-fg">Микрофон…</p>
        ) : (
          <>
            <p className="min-h-6 text-sm text-subtle">
              {prev?.text ?? (i < 0 ? "инструментал" : "")}
            </p>
            <p className="mt-3 font-display text-3xl leading-snug text-fg sm:text-4xl">
              {line?.text ?? (i >= song.lines.length ? "—" : "…")}
            </p>
            <div className="mt-4 h-1 w-40 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full bg-wine" style={{ width: `${lineP * 100}%` }} />
            </div>
            <p className="mt-4 min-h-6 text-sm text-muted">{i >= 0 ? next?.text : song.lines[0]?.text}</p>
          </>
        )}
      </div>

      <div className="mb-4 flex h-10 items-end justify-center gap-1">
        {Array.from({ length: 12 }).map((_, idx) => {
          const on = level > idx / 14;
          return (
            <span
              key={idx}
              className={`w-1.5 rounded-full ${on ? (idx > 8 ? "bg-wine" : "bg-accent") : "bg-surface-2"}`}
              style={{ height: `${10 + idx * 2}px` }}
            />
          );
        })}
      </div>

      {useGame.getState().mode !== "net" || mine ? (
        <Button variant="secondary" className="w-full rounded-xl" onClick={settle}>
          Дальше
        </Button>
      ) : (
        <p className="h-11 text-center text-sm leading-[2.75rem] text-muted">Слушаем</p>
      )}
    </div>
  );
}
