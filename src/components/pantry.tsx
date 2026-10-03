import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { playRoom } from "@/lib/rooms";
import { useWallet } from "@/lib/wallet";

type RiddleId = "key" | "bird" | "apple" | "soldier" | "feather";

const RIDDLES: { id: RiddleId; say: string; left: string; top: string; width: string; height: string }[] = [
  { id: "key", say: "Им можно открыть или открутить.", left: "28%", top: "56%", width: "14%", height: "18%" },
  { id: "bird", say: "Он летает. На нём играют.", left: "46%", top: "24%", width: "16%", height: "18%" },
  { id: "apple", say: "Оно круглое. Оно съедобное.", left: "38%", top: "60%", width: "14%", height: "16%" },
  { id: "soldier", say: "Инвалид.", left: "54%", top: "32%", width: "16%", height: "22%" },
  { id: "feather", say: "И пишут, и режут, и летают.", left: "50%", top: "62%", width: "14%", height: "16%" },
];

const CAKE = [
  { id: "cup", mark: "бокал" },
  { id: "bed", mark: "кровать" },
  { id: "gone", mark: "пусто" },
  { id: "axe", mark: "топор" },
  { id: "bee", mark: "шмель" },
  { id: "court", mark: "суд" },
  { id: "fish", mark: "рыба" },
  { id: "bear", mark: "медведь" },
  { id: "fire", mark: "огонь" },
];

const FACES = [
  { id: "note", mark: "♪" },
  { id: "clef", mark: "𝄞" },
  { id: "harp", mark: "арфа" },
  { id: "cat", mark: "кот" },
  { id: "happy", mark: "☺" },
  { id: "sad", mark: "☹" },
  { id: "apple", mark: "яблоко" },
  { id: "house", mark: "дом" },
  { id: "banana", mark: "банан" },
];

function shuffle<T>(list: T[]) {
  const bag = [...list];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }
  return bag;
}

function applyNotes(notes?: number) {
  if (typeof notes === "number") useWallet.getState().apply({ notes });
}

function Bricks({ onWin }: { onWin: () => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const won = useRef(false);
  const winRef = useRef(onWin);
  winRef.current = onWin;
  useEffect(() => {
    const canvas = ref.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    const w = canvas.width;
    const h = canvas.height;
    let x = w / 2;
    let y = h - 46;
    let vx = 2.1;
    let vy = -2.5;
    let pad = w / 2;
    const cols = 6;
    const bw = (w - 16) / cols;
    const alive = Array.from({ length: 24 }, () => true);
    let raf = 0;
    const aim = (clientX: number) => {
      const box = canvas.getBoundingClientRect();
      pad = ((clientX - box.left) / box.width) * w;
    };
    const move = (event: PointerEvent) => aim(event.clientX);
    canvas.addEventListener("pointermove", move);
    canvas.addEventListener("pointerdown", move);
    const tick = () => {
      x += vx;
      y += vy;
      if (x < 6 || x > w - 6) vx *= -1;
      if (y < 6) vy *= -1;
      if (y > h - 22 && Math.abs(x - pad) < 34) {
        vy = -Math.abs(vy);
        vx += (x - pad) / 24;
      } else if (y > h + 8) {
        x = w / 2;
        y = h - 46;
        vx = 2.1;
        vy = -2.5;
      }
      for (let i = 0; i < alive.length; i++) {
        if (!alive[i]) continue;
        const cx = 8 + (i % cols) * bw;
        const cy = 10 + Math.floor(i / cols) * 18;
        if (x > cx && x < cx + bw - 2 && y > cy && y < cy + 14) {
          alive[i] = false;
          vy *= -1;
          break;
        }
      }
      ctx.fillStyle = "#140e0a";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#f4e4c4";
      alive.forEach((on, i) => {
        if (!on) return;
        ctx.fillRect(8 + (i % cols) * bw, 10 + Math.floor(i / cols) * 18, bw - 3, 14);
      });
      ctx.fillRect(pad - 28, h - 16, 56, 8);
      ctx.beginPath();
      ctx.arc(x, y, 5, 0, Math.PI * 2);
      ctx.fill();
      if (alive.every((on) => !on)) {
        if (!won.current) {
          won.current = true;
          winRef.current();
        }
        return;
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => {
      cancelAnimationFrame(raf);
      canvas.removeEventListener("pointermove", move);
      canvas.removeEventListener("pointerdown", move);
    };
  }, []);
  return <canvas ref={ref} width={300} height={190} className="w-full touch-none rounded-md" />;
}

export function HuntRoom({ onClose }: { onClose: () => void }) {
  const [order] = useState(() => shuffle(RIDDLES));
  const [at, setAt] = useState(0);
  const [ghost, setGhost] = useState(0);
  const [open, setOpen] = useState<RiddleId | null>(null);
  const [busy, setBusy] = useState(false);
  const [due, setDue] = useState(false);
  const [boxes, setBoxes] = useState<boolean[] | null>(null);
  const [cake, setCake] = useState(() => shuffle(CAKE));
  const [cakeStep, setCakeStep] = useState(0);
  const [hint, setHint] = useState("");
  const [faces, setFaces] = useState(() => shuffle(FACES));
  const [memoryOrder] = useState(() => shuffle(FACES));
  const [showFaces, setShowFaces] = useState(true);
  const [memoryStep, setMemoryStep] = useState(0);
  const [opened, setOpened] = useState<string[]>([]);
  const riddle = order[at % order.length];

  useEffect(() => {
    if (open !== "apple") return;
    setShowFaces(true);
    const timer = window.setTimeout(() => setShowFaces(false), 3500);
    return () => window.clearTimeout(timer);
  }, [open]);

  function nextRiddle() {
    setOpen(null);
    setBoxes(null);
    setDue(false);
    setCake(shuffle(CAKE));
    setCakeStep(0);
    setHint("");
    setFaces(shuffle(FACES));
    setMemoryStep(0);
    setOpened([]);
    setAt((n) => n + 1);
  }

  function takePrize(kind: "cake" | "cards" | "brick") {
    void (async () => {
      setBusy(true);
      try {
        const res = await playRoom({ data: { action: "prize", kind } });
        applyNotes(res.notes);
        if (!res.ok) toast.message(res.error);
        else toast.success(`+${res.pay} нот`);
        nextRiddle();
      } finally {
        setBusy(false);
      }
    })();
  }

  function openRiddle(id: RiddleId) {
    if (id !== riddle.id) {
      toast.message("Не то.");
      return;
    }
    if (id === "soldier") {
      void (async () => {
        setBusy(true);
        try {
          const res = await playRoom({ data: { action: "bandit" } });
          applyNotes(res.notes);
          if (!res.ok) toast.message(res.error);
          else toast.success("Инвалид отсыпал 10 нот.");
          nextRiddle();
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    if (id === "key") {
      void (async () => {
        setBusy(true);
        try {
          const res = await playRoom({ data: { action: "box", step: "deal" } });
          applyNotes(res.notes);
          if (!res.ok) {
            toast.error(res.error);
            return;
          }
          setBoxes([false, false, false]);
          setOpen("key");
        } finally {
          setBusy(false);
        }
      })();
      return;
    }
    setOpen(id);
  }

  function pickBox(index: number) {
    void (async () => {
      setBusy(true);
      try {
        const res = await playRoom({ data: { action: "box", step: "pick", pick: index } });
        applyNotes(res.notes);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        if (res.win) {
          toast.success("В шкатулке 2 ноты.");
          nextRiddle();
          return;
        }
        setDue(true);
        setBoxes(null);
        toast.message("Пусто. Ещё раз — 2 ноты.");
      } finally {
        setBusy(false);
      }
    })();
  }

  function buyHint() {
    void (async () => {
      setBusy(true);
      try {
        const res = await playRoom({ data: { action: "hint" } });
        applyNotes(res.notes);
        if (!res.ok) {
          toast.error(res.error);
          return;
        }
        setHint("Вспомни книгу «Десять негритят». Повтори ход событий.");
      } finally {
        setBusy(false);
      }
    })();
  }

  function tapCake(id: string) {
    if (id !== CAKE[cakeStep].id) {
      setCakeStep(0);
      toast.message("Не тот ход. Сначала.");
      return;
    }
    const step = cakeStep + 1;
    if (step >= CAKE.length) {
      takePrize("cake");
      return;
    }
    setCakeStep(step);
  }

  function tapCard(id: string) {
    if (showFaces || opened.includes(id)) return;
    if (id !== memoryOrder[memoryStep].id) {
      setMemoryStep(0);
      setOpened([]);
      toast.message("Не та карта.");
      return;
    }
    const next = [...opened, id];
    setOpened(next);
    if (next.length >= memoryOrder.length) {
      takePrize("cards");
      return;
    }
    setMemoryStep(memoryStep + 1);
  }

  return (
    <div className="absolute inset-0 z-30 bg-black">
      <div className="absolute inset-x-0 top-10 bottom-24 flex items-center justify-center [container-type:size] landscape:inset-0 landscape:bottom-16">
        <div className="relative" style={{ aspectRatio: "16 / 9", width: "min(100cqw, calc(100cqh * 16 / 9))" }}>
          <img src="/rooms/hunt.jpg" alt="Кладовая" className="absolute inset-0 h-full w-full object-fill" />
          {ghost ? (
            <img
              src={ghost === 1 ? "/rooms/lady.jpg" : "/rooms/bones.jpg"}
              alt=""
              className="pointer-events-none absolute mix-blend-screen"
              style={{ left: "0%", top: "6%", width: "30%", height: "88%", objectFit: "contain" }}
            />
          ) : null}
          <button
            type="button"
            aria-label="Тёмная стена"
            className="absolute"
            style={{ left: "0%", top: "12%", width: "24%", height: "70%" }}
            onClick={() => setGhost((n) => (n + 1) % 3)}
          />
          <button
            type="button"
            aria-label={riddle.say}
            className="absolute animate-pulse rounded-full border border-[#f6e7a8]/70"
            style={{ left: riddle.left, top: riddle.top, width: riddle.width, height: riddle.height }}
            onClick={() => openRiddle(riddle.id)}
          />
          {open && open !== "soldier" ? (
            <div className="absolute inset-x-2 bottom-2 z-20 rounded-xl border border-[#8a7044] bg-[#1a120c]/95 p-2 text-[#f4e4c4]">
              {open === "key" && boxes ? (
                <div className="flex gap-2">
                  {boxes.map((_, index) => (
                    <button
                      key={index}
                      type="button"
                      disabled={busy}
                      className="flex-1 rounded-lg bg-[#2a1a0c] px-2 py-3 text-sm"
                      onClick={() => pickBox(index)}
                    >
                      Шкатулка {index + 1}
                    </button>
                  ))}
                </div>
              ) : null}
              {open === "bird" ? (
                <>
                  <div className="mb-1 flex items-center justify-between gap-2">
                    <p className="text-xs tracking-widest text-[#c4a574]">ДЕВЯТЬ НЕГРИТЯТ</p>
                    <button type="button" className="text-[11px] underline" disabled={busy} onClick={buyHint}>
                      подсказка · 0.5
                    </button>
                  </div>
                  {hint ? <p className="mb-1 text-xs">{hint}</p> : null}
                  <div className="grid grid-cols-3 gap-1">
                    {cake.map((slice) => (
                      <button
                        key={slice.id}
                        type="button"
                        className="rounded-md bg-[#3a2414] px-1 py-2 text-xs"
                        onClick={() => tapCake(slice.id)}
                      >
                        {slice.mark}
                      </button>
                    ))}
                  </div>
                </>
              ) : null}
              {open === "apple" ? (
                <>
                  <p className="mb-1 text-center text-xs tracking-widest text-[#c4a574]">
                    {memoryOrder.map((card) => card.mark).join("  ")}
                  </p>
                  <div className="grid grid-cols-3 gap-1">
                    {faces.map((card) => {
                      const up = showFaces || opened.includes(card.id);
                      return (
                        <button
                          key={card.id}
                          type="button"
                          className="rounded-md bg-[#3a2414] px-1 py-2 text-xs"
                          onClick={() => tapCard(card.id)}
                        >
                          {up ? card.mark : "·"}
                        </button>
                      );
                    })}
                  </div>
                </>
              ) : null}
              {open === "feather" ? <Bricks onWin={() => takePrize("brick")} /> : null}
              <button type="button" className="mt-1 text-[11px] underline" onClick={() => setOpen(null)}>
                закрыть
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-[#2a1a0c]/95 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <p className="text-sm">{riddle.say}</p>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" className="rounded-xl" onClick={onClose}>
            В особняк
          </Button>
          {due ? (
            <Button className="rounded-xl" disabled={busy} onClick={() => openRiddle("key")}>
              Ещё раз · 2 ноты
            </Button>
          ) : null}
        </div>
      </div>
      <p className="absolute top-0 left-0 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] text-sm text-white">
        <span className="rounded-full bg-black/45 px-3 py-1">Кладовая</span>
      </p>
    </div>
  );
}
