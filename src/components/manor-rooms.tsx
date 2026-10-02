import { useState, type MouseEvent } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { playRoom } from "@/lib/rooms";
import { useWallet } from "@/lib/wallet";

type Find = { id: string; word: string; reveal: string; left: string; top: string };

const FINDS: Find[] = [
  { id: "onion", word: "Лук", reveal: "Луковица, не оружие.", left: "46%", top: "66%" },
  { id: "key", word: "Ключ", reveal: "От двери, не гаечный.", left: "54%", top: "60%" },
  { id: "brush", word: "Кисть", reveal: "Кисть художника, не рука.", left: "38%", top: "48%" },
  { id: "vulture", word: "Гриф", reveal: "Птица, не гриф гитары.", left: "70%", top: "24%" },
  { id: "shoe", word: "Подкова", reveal: "Подкова на счастье.", left: "78%", top: "32%" },
  { id: "apple", word: "Яблоко", reveal: "Красное яблоко.", left: "62%", top: "70%" },
  { id: "candle", word: "Свеча", reveal: "Огарок свечи.", left: "74%", top: "46%" },
  { id: "watch", word: "Часы", reveal: "Карманные часы, не время суток.", left: "86%", top: "58%" },
  { id: "needle", word: "Игла", reveal: "Швейная игла, не хвоя.", left: "80%", top: "72%" },
  { id: "feather", word: "Перо", reveal: "Птичье перо, не ручка.", left: "68%", top: "76%" },
  { id: "coin", word: "Монета", reveal: "Медная монета.", left: "50%", top: "74%" },
  { id: "knight", word: "Конь", reveal: "Шахматный конь, не живой.", left: "42%", top: "72%" },
  { id: "bell", word: "Колокол", reveal: "Маленький колокол.", left: "34%", top: "36%" },
  { id: "bottle", word: "Бутылка", reveal: "Зелёное стекло.", left: "30%", top: "52%" },
  { id: "pearl", word: "Жемчуг", reveal: "Одна жемчужина.", left: "36%", top: "68%" },
  { id: "nail", word: "Гвоздь", reveal: "Ржавый гвоздь.", left: "90%", top: "70%" },
  { id: "card", word: "Карта", reveal: "Игральная карта, не карта города.", left: "58%", top: "46%" },
  { id: "spider", word: "Паук", reveal: "Паук в углу.", left: "88%", top: "18%" },
  { id: "moth", word: "Моль", reveal: "Ночная моль, не пристань.", left: "76%", top: "16%" },
  { id: "glove", word: "Перчатка", reveal: "Одна перчатка.", left: "48%", top: "40%" },
  { id: "spoon", word: "Ложка", reveal: "Старая ложка.", left: "40%", top: "30%" },
  { id: "fork", word: "Вилка", reveal: "Столовая вилка, не развилка.", left: "32%", top: "44%" },
  { id: "cork", word: "Пробка", reveal: "Пробка от бутылки.", left: "56%", top: "32%" },
  { id: "matches", word: "Спички", reveal: "Коробок спичек.", left: "64%", top: "20%" },
  { id: "thimble", word: "Напёрсток", reveal: "Напёрсток у иглы.", left: "72%", top: "36%" },
  { id: "button", word: "Пуговица", reveal: "Одна пуговица.", left: "84%", top: "44%" },
  { id: "ribbon", word: "Лента", reveal: "Шёлковая лента, не плёнка.", left: "28%", top: "28%" },
  { id: "rose", word: "Роза", reveal: "Сухая роза.", left: "52%", top: "52%" },
  { id: "ship", word: "Корабль", reveal: "Кораблик в бутылке.", left: "82%", top: "22%" },
  { id: "scythe", word: "Коса", reveal: "Коса жнеца, не волосы.", left: "88%", top: "50%" },
];

const GLYPH: Record<string, string> = { dust: "·", note: "♪", moon: "☾", skull: "☠", frame: "▣" };
const REEL_KEYS = Object.keys(GLYPH);

function pickRound() {
  const bag = [...FINDS];
  for (let i = bag.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = bag[i];
    bag[i] = bag[j];
    bag[j] = swap;
  }
  return bag.slice(0, 10);
}

function rollGlyph() {
  return REEL_KEYS[Math.floor(Math.random() * REEL_KEYS.length)];
}

export function HuntRoom({ onClose }: { onClose: () => void }) {
  const [round] = useState(pickRound);
  const [found, setFound] = useState<string[]>([]);
  const [line, setLine] = useState("Десять из тридцати. Названия врут.");
  const [busy, setBusy] = useState(false);
  const [reels, setReels] = useState(["note", "moon", "skull"]);
  const [spinning, setSpinning] = useState(false);
  const [slotLine, setSlotLine] = useState("2 ноты");
  const [slot, setSlot] = useState(false);
  const [ghost, setGhost] = useState(false);
  const done = found.length === round.length;
  const left = round.filter((item) => !found.includes(item.id));

  function tap(id: string, reveal: string) {
    setLine(reveal);
    setFound((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }

  function aim(event: MouseEvent<HTMLDivElement>) {
    const mark = event.target as HTMLElement;
    if (mark.closest("[data-ui]")) return;
    const box = event.currentTarget.getBoundingClientRect();
    const x = ((event.clientX - box.left) / box.width) * 100;
    const y = ((event.clientY - box.top) / box.height) * 100;
    let best: Find | null = null;
    let bestD = 8;
    for (const item of round) {
      if (found.includes(item.id)) continue;
      const d = Math.hypot(x - parseFloat(item.left), y - parseFloat(item.top));
      if (d < bestD) {
        best = item;
        bestD = d;
      }
    }
    if (!best) {
      setLine("Мимо.");
      return;
    }
    tap(best.id, best.reveal);
  }

  function spin() {
    void (async () => {
      setSpinning(true);
      setSlotLine("…");
      const started = Date.now();
      const timer = window.setInterval(() => setReels([rollGlyph(), rollGlyph(), rollGlyph()]), 90);
      try {
        const res = await playRoom({ data: { action: "spin" } });
        const wait = 1100 - (Date.now() - started);
        if (wait > 0) await new Promise((r) => window.setTimeout(r, wait));
        window.clearInterval(timer);
        if (!res.ok) {
          toast.error(res.error);
          setSlotLine("нет нот");
          return;
        }
        setReels(res.reels || []);
        useWallet.getState().apply({ notes: res.notes });
        setSlotLine(res.win ? `+${res.win}` : "пусто");
      } finally {
        window.clearInterval(timer);
        setSpinning(false);
      }
    })();
  }

  return (
    <div className="absolute inset-0 z-30 cursor-default bg-black">
      <div
        className="absolute inset-x-0 flex items-center justify-center [container-type:size]"
        style={{ top: "2.4rem", bottom: "6.4rem" }}
      >
        <div
          className="relative"
          style={{ aspectRatio: "16 / 9", width: "min(100cqw, calc(100cqh * 16 / 9))" }}
          onClick={aim}
        >
          <img src="/rooms/hunt.jpg" alt="Кладовая" className="absolute inset-0 h-full w-full object-fill" />
          <img
            src="/rooms/ghost.jpg"
            alt=""
            className={`pointer-events-none absolute mix-blend-screen transition-opacity duration-300 ${ghost ? "opacity-100" : "opacity-0"}`}
            style={{ left: "0%", top: "8%", width: "28%", height: "84%", objectFit: "contain" }}
          />
          <button
            type="button"
            data-ui
            aria-label="Тёмная стена"
            className="absolute cursor-default"
            style={{ left: "0%", top: "16%", width: "22%", height: "62%" }}
            onMouseEnter={() => setGhost(true)}
            onMouseLeave={() => setGhost(false)}
            onPointerDown={(event) => {
              if (event.pointerType !== "mouse") setGhost(true);
            }}
            onPointerUp={(event) => {
              if (event.pointerType !== "mouse") setGhost(false);
            }}
            onClick={(event) => event.stopPropagation()}
          />
          <button
            type="button"
            data-ui
            aria-label="Картина"
            className="absolute cursor-default overflow-hidden rounded-sm opacity-90 shadow-md"
            style={{ left: "58%", top: "4%", width: "11%", height: "16%" }}
            onClick={(event) => {
              event.stopPropagation();
              setSlot(true);
            }}
          >
            <img src="/rooms/cowboy.jpg" alt="" className="h-full w-full object-cover" />
          </button>
          {slot ? (
            <>
              <button
                type="button"
                data-ui
                aria-label="Закрыть автомат"
                className="absolute inset-0 z-10 cursor-default"
                onClick={(event) => {
                  event.stopPropagation();
                  setSlot(false);
                }}
              />
              <div
                data-ui
                className="absolute z-20 flex flex-col items-center rounded-md border border-[#8a7044] bg-[#1a120c]/95 px-2 py-2 text-[#f4e4c4]"
                style={{ left: "28%", top: "36%", width: "44%" }}
              >
                <div className="flex w-full items-center justify-between">
                  <p className="text-[10px] tracking-widest text-[#c4a574]">СЛОМАН</p>
                  <button type="button" className="text-[11px] underline" onClick={() => setSlot(false)}>
                    закрыть
                  </button>
                </div>
                <div className="mt-1 flex w-full gap-1">
                  {reels.map((symbol, index) => (
                    <div
                      key={index}
                      className="flex h-10 flex-1 items-center justify-center rounded-sm border border-[#3a2a18] bg-black font-display text-xl"
                    >
                      {GLYPH[symbol] || "·"}
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  disabled={spinning}
                  className="mt-2 w-full rounded-sm bg-[#6b2a22] px-2 py-1 text-[11px] text-[#f4e4c4] disabled:opacity-60"
                  onClick={spin}
                >
                  {spinning ? "крутится" : `рычаг · ${slotLine}`}
                </button>
              </div>
            </>
          ) : null}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-[#2a1a0c] px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <p className="text-sm">{line}</p>
        <div className="mt-2 flex flex-wrap gap-1">
          {left.map((item) => (
            <span key={item.id} className="rounded-full bg-[#f4e4c4] px-2 py-0.5 text-xs text-[#2a1a0c]">
              {item.word}
            </span>
          ))}
        </div>
        <div className="mt-2 flex gap-2">
          <Button variant="secondary" className="rounded-xl" onClick={onClose}>
            В особняк
          </Button>
          {done ? (
            <Button
              className="rounded-xl"
              disabled={busy}
              onClick={() => {
                void (async () => {
                  setBusy(true);
                  try {
                    const res = await playRoom({ data: { action: "claim" } });
                    if (!res.ok) {
                      toast.error(res.error);
                      return;
                    }
                    useWallet.getState().apply({ notes: res.notes });
                    toast.success("Кладовая отдала 5 нот.");
                  } finally {
                    setBusy(false);
                  }
                })();
              }}
            >
              Забрать 5 нот
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