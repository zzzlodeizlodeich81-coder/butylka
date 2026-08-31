import { useCallback, useEffect, useRef, useState } from "react";
import { Mic, MicOff, Volume2 } from "lucide-react";
import { PersonAvatar } from "@/components/person-avatar";
import { Button } from "@/components/ui/button";
import {
  audioRunning,
  now,
  startMic,
  startTrack,
  stopTrack,
  unlockAudio,
  type MicHandle,
} from "@/lib/audio";
import { songDuration, type Song } from "@/lib/songs";
import { formatChallenge, playerById, useGame } from "@/lib/store";

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
  const partner = playerById(players, useGame((s) => s.partnerId));
  const challenge = useGame((s) => s.challenge);
  const finishKaraoke = useGame((s) => s.finishKaraoke);

  const [count, setCount] = useState(3);
  const [elapsed, setElapsed] = useState(0);
  const [level, setLevel] = useState(0);
  const [hadMic, setHadMic] = useState(false);
  const [needsTap, setNeedsTap] = useState(false);
  const startedAtRef = useRef(0);
  const durationRef = useRef(40);
  const elapsedRef = useRef(0);
  const doneRef = useRef(false);
  const startedRef = useRef(false);
  const micRef = useRef<MicHandle | null>(null);
  const energyRef = useRef({
    sum: 0,
    n: 0,
    lineEnergy: 0,
    lineN: 0,
    scored: new Set<number>(),
  });

  function settle() {
    if (doneRef.current || !song) return;
    doneRef.current = true;
    stopTrack();
    micRef.current?.stop();
    const e = energyRef.current;
    const hits = e.scored.size;
    const avg = e.n ? e.sum / e.n : 0;
    const usedMic = Boolean(micRef.current);
    let score: number;
    if (usedMic) {
      score = Math.round(
        (hits / Math.max(1, song.lines.length)) * 7800 + Math.min(1, avg * 4) * 2200,
      );
    } else {
      const stay = Math.min(1, elapsedRef.current / durationRef.current);
      score = Math.round(2400 + stay * 1800);
    }
    finishKaraoke(Math.min(9999, score), usedMic);
  }

  const begin = useCallback(() => {
    if (!song || startedRef.current || doneRef.current) return false;
    unlockAudio();
    const handle = startTrack(song);
    if (!handle) {
      setNeedsTap(true);
      return false;
    }
    startedRef.current = true;
    setNeedsTap(false);
    startedAtRef.current = handle.startedAt;
    durationRef.current = handle.duration;
    void startMic().then((mic) => {
      if (doneRef.current) {
        mic?.stop();
        return;
      }
      micRef.current = mic;
      setHadMic(Boolean(mic));
    });
    window.setTimeout(() => {
      if (!audioRunning() && !useGame.getState().muted) setNeedsTap(true);
    }, 180);
    return true;
  }, [song]);

  useEffect(() => {
    if (!song) return;
    startedRef.current = false;
    doneRef.current = false;
    let live = true;
    const timers = [1, 2, 3].map((s) =>
      window.setTimeout(() => {
        if (live) setCount(3 - s);
      }, s * 700),
    );
    const startTimer = window.setTimeout(() => {
      if (!live) return;
      if (!begin()) setNeedsTap(true);
    }, 2100);

    return () => {
      live = false;
      timers.forEach(clearTimeout);
      clearTimeout(startTimer);
      startedRef.current = false;
      stopTrack();
      micRef.current?.stop();
    };
  }, [song, begin]);

  useEffect(() => {
    if (count > 0 || !song) return;
    let raf = 0;
    const tick = () => {
      const t = Math.max(0, now() - startedAtRef.current);
      elapsedRef.current = t;
      setElapsed(t);
      const mic = micRef.current;
      const lvl = mic?.level() ?? 0;
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
      if (t >= durationRef.current) {
        settle();
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [count, song]);

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
        if (count <= 0 && !startedRef.current) begin();
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
              begin();
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

      <Button variant="secondary" className="w-full rounded-xl" onClick={settle}>
        Дальше
      </Button>
    </div>
  );
}
