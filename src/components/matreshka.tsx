import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";

const STREAM = "https://myradio24.org/matreshka";
const STATUS = "https://myradio24.com/users/matreshka/status.json";

type Air = {
  song?: string;
  listeners?: number;
  kbps?: number;
  songs?: { time?: string; song?: string; img?: string }[];
};

export function Matreshka({ open, onClose }: { open: boolean; onClose: () => void }) {
  const audio = useRef<HTMLAudioElement>(null);
  const [live, setLive] = useState(false);
  const [song, setSong] = useState("эфир поднимается");
  const [listeners, setListeners] = useState("—");
  const [kbps, setKbps] = useState("128");
  const [songs, setSongs] = useState<{ time: string; song: string; img: string }[]>([]);

  useEffect(() => {
    let stop = false;
    async function pull() {
      try {
        const res = await fetch(`${STATUS}?${Date.now()}`);
        if (!res.ok) return;
        const info = (await res.json()) as Air;
        if (stop) return;
        if (info.song) setSong(info.song);
        setListeners(String(info.listeners ?? "—"));
        setKbps(String(info.kbps ?? "128"));
        setSongs(
          (info.songs ?? [])
            .slice(0, 8)
            .map((row) => ({
              time: String(row.time ?? "").slice(0, 5),
              song: String(row.song ?? ""),
              img: row.img ? `https://myradio24.com/${row.img}` : "",
            }))
            .filter((row) => row.song),
        );
      } catch {
        /* эфирная сводка подождёт */
      }
    }
    void pull();
    const timer = window.setInterval(() => void pull(), 15000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  function toggle() {
    const el = audio.current;
    if (!el) return;
    if (live) {
      el.pause();
      setLive(false);
      return;
    }
    el.src = STREAM;
    el.volume = 0.7;
    void el.play().then(
      () => setLive(true),
      () => toast.error("Эфир не открылся. Нажми ещё раз."),
    );
  }

  return (
    <div className={open ? "absolute inset-0 z-30 flex items-end bg-black/45" : "hidden"}>
      <audio ref={audio} preload="none" />
      <div className="max-h-[86%] w-full overflow-auto rounded-t-3xl bg-[#2a1a0c] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Матрёшка</h2>
          <Button variant="ghost" className="text-[#f4e4c4]" onClick={onClose}>
            На двор
          </Button>
        </div>
        <div className="flex items-center gap-3">
          <button
            type="button"
            aria-label={live ? "Стоп" : "Эфир"}
            className="relative grid size-14 shrink-0 place-items-center rounded-full bg-[#f4e4c4]"
            onClick={toggle}
          >
            {live ? (
              <span className="flex gap-1">
                <span className="h-5 w-1.5 bg-[#2a1a0c]" />
                <span className="h-5 w-1.5 bg-[#2a1a0c]" />
              </span>
            ) : (
              <span className="ml-1 border-y-[0.55rem] border-l-[0.85rem] border-y-transparent border-l-[#2a1a0c]" />
            )}
          </button>
          <p className="min-w-0 flex-1 text-sm">
            <span className="block text-xs tracking-widest text-[#c4a574]">СЕЙЧАС</span>
            <b className="block truncate">{song}</b>
          </p>
          <span className="flex h-10 items-end gap-1" aria-hidden>
            {[0, 1, 2, 3].map((bar) => (
              <span
                key={bar}
                className={`w-1.5 rounded-sm bg-[#c45a3a] ${live ? "animate-pulse" : "h-1.5"}`}
                style={live ? { height: `${12 + ((bar * 7) % 18)}px`, animationDelay: `${bar * 120}ms` } : undefined}
              />
            ))}
          </span>
        </div>
        <p className="mt-2 text-xs text-[#c4a574]">
          {listeners} слушают · {kbps} kbps
        </p>
        <p className="mt-4 text-xs tracking-widest text-[#c4a574]">ПОСЛЕДНИЕ</p>
        <div className="mt-2 flex max-h-40 flex-col gap-1 overflow-auto text-sm">
          {songs.map((row) => (
            <a
              key={`${row.time}-${row.song}`}
              className="flex items-center gap-2 py-1 text-[#f4e4c4]"
              href={`https://www.youtube.com/results?search_query=${encodeURIComponent(row.song)}`}
              target="_blank"
              rel="noreferrer"
            >
              {row.img ? <img src={row.img} alt="" className="size-9 rounded object-cover" /> : null}
              <span className="text-xs text-[#c4a574]">{row.time}</span>
              <span className="truncate underline">{row.song}</span>
            </a>
          ))}
        </div>
        <a
          className="mt-4 inline-block text-sm text-[#f4e4c4] underline"
          href="https://myradio24.com/ru/table/matreshka"
          target="_blank"
          rel="noreferrer"
        >
          Заказать песню
        </a>
      </div>
    </div>
  );
}
