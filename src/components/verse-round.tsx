import { useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { PersonAvatar } from "@/components/person-avatar";
import { playUiTick } from "@/lib/audio";
import { LATE_COST, VERSE_SECONDS, useGame } from "@/lib/store";

export function VerseRound() {
  const players = useGame((s) => s.players);
  const verseIndex = useGame((s) => s.verseIndex);
  const verseLines = useGame((s) => s.verseLines);
  const submitVerse = useGame((s) => s.submitVerse);
  const player = players[verseIndex];
  const [draft, setDraft] = useState("");
  const [left, setLeft] = useState(VERSE_SECONDS);
  const doneRef = useRef(false);
  const draftRef = useRef("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    draftRef.current = draft;
  }, [draft]);

  useEffect(() => {
    doneRef.current = false;
    setDraft("");
    draftRef.current = "";
    setLeft(VERSE_SECONDS);
    inputRef.current?.focus();
    const started = performance.now();
    let raf = 0;
    const tick = (now: number) => {
      const remain = Math.max(0, VERSE_SECONDS - (now - started) / 1000);
      setLeft(remain);
      if (remain <= 0) {
        if (!doneRef.current) {
          doneRef.current = true;
          playUiTick();
          submitVerse(draftRef.current, true);
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [verseIndex, submitVerse]);

  if (!player) return null;

  function send() {
    if (doneRef.current) return;
    doneRef.current = true;
    playUiTick();
    submitVerse(draft, false);
  }

  const danger = left <= 3;

  return (
    <div className="flex min-h-0 flex-1 flex-col px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
      <p className="text-sm text-muted">
        Круг бреда · {verseIndex + 1} из {players.length}
      </p>
      <h1 className="mt-1 font-display text-3xl text-fg">10 секунд. Строка.</h1>
      <p className="mt-2 text-sm leading-relaxed text-muted">
        Не обязательно в рифму. Не успел — минус {LATE_COST} нота. Потом кухня сварит из этого песню.
      </p>

      <div className="mt-6 flex items-center gap-3">
        <PersonAvatar url={player.avatarUrl} name={player.name} size="lg" />
        <div>
          <p className="font-display text-2xl text-fg">{player.name}</p>
          <p className="text-sm text-muted">пишет тему</p>
        </div>
        <p
          className={`ml-auto font-display text-5xl tabular-nums ${danger ? "text-wine" : "text-fg"}`}
        >
          {Math.ceil(left)}
        </p>
      </div>

      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") send();
        }}
        maxLength={42}
        placeholder="что угодно"
        className="mt-6 h-14 w-full rounded-xl border border-border bg-surface-2 px-4 text-xl text-fg placeholder:text-subtle outline-none"
      />

      {verseLines.length > 0 ? (
        <ul className="mt-4 min-h-0 flex-1 space-y-1 overflow-auto text-sm text-muted">
          {verseLines.map((l) => (
            <li key={l.playerId}>
              <span className="text-subtle">{l.name}</span>
              {": "}
              {l.text}
              {l.late ? " · поздно" : ""}
            </li>
          ))}
        </ul>
      ) : (
        <div className="flex-1" />
      )}

      <Button type="button" size="lg" className="mt-4 h-14 rounded-xl" onClick={send}>
        Дальше
      </Button>
    </div>
  );
}
