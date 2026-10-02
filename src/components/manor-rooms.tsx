import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { playRoom } from "@/lib/rooms";
import { useWallet } from "@/lib/wallet";

type Find = { id: string; word: string; reveal: string; left: string; top: string };

const FINDS: Find[] = [
  { id: "onion", word: "Лук", reveal: "Луковица, не оружие.", left: "30%", top: "68%" },
  { id: "key", word: "Ключ", reveal: "От двери, не гаечный.", left: "39%", top: "72%" },
  { id: "brush", word: "Кисть", reveal: "Кисть художника, не рука.", left: "48%", top: "58%" },
  { id: "vulture", word: "Гриф", reveal: "Птица, не гриф гитары.", left: "57%", top: "46%" },
  { id: "shoe", word: "Подкова", reveal: "Подкова на счастье.", left: "66%", top: "38%" },
  { id: "apple", word: "Яблоко", reveal: "Красное яблоко.", left: "75%", top: "50%" },
  { id: "candle", word: "Свеча", reveal: "Огарок свечи.", left: "84%", top: "42%" },
  { id: "watch", word: "Часы", reveal: "Карманные часы, не время суток.", left: "88%", top: "62%" },
  { id: "needle", word: "Игла", reveal: "Швейная игла, не хвоя.", left: "78%", top: "70%" },
  { id: "feather", word: "Перо", reveal: "Птичье перо, не ручка.", left: "68%", top: "74%" },
  { id: "coin", word: "Монета", reveal: "Медная монета.", left: "58%", top: "76%" },
  { id: "knight", word: "Конь", reveal: "Шахматный конь, не живой.", left: "48%", top: "74%" },
  { id: "bell", word: "Колокол", reveal: "Маленький колокол.", left: "40%", top: "58%" },
  { id: "bottle", word: "Бутылка", reveal: "Зелёное стекло.", left: "31%", top: "50%" },
  { id: "pearl", word: "Жемчуг", reveal: "Одна жемчужина.", left: "27%", top: "66%" },
  { id: "nail", word: "Гвоздь", reveal: "Ржавый гвоздь.", left: "90%", top: "76%" },
  { id: "card", word: "Карта", reveal: "Игральная карта, не карта города.", left: "54%", top: "64%" },
  { id: "spider", word: "Паук", reveal: "Паук в углу.", left: "72%", top: "26%" },
  { id: "moth", word: "Моль", reveal: "Ночная моль, не пристань.", left: "82%", top: "22%" },
  { id: "glove", word: "Перчатка", reveal: "Одна перчатка.", left: "44%", top: "44%" },
  { id: "spoon", word: "Ложка", reveal: "Старая ложка.", left: "34%", top: "40%" },
  { id: "fork", word: "Вилка", reveal: "Столовая вилка, не развилка.", left: "24%", top: "58%" },
  { id: "cork", word: "Пробка", reveal: "Пробка от бутылки.", left: "52%", top: "34%" },
  { id: "matches", word: "Спички", reveal: "Коробок спичек.", left: "63%", top: "20%" },
  { id: "thimble", word: "Напёрсток", reveal: "Напёрсток у иглы.", left: "74%", top: "14%" },
  { id: "button", word: "Пуговица", reveal: "Одна пуговица.", left: "86%", top: "30%" },
  { id: "ribbon", word: "Лента", reveal: "Шёлковая лента, не плёнка.", left: "26%", top: "34%" },
  { id: "rose", word: "Роза", reveal: "Сухая роза.", left: "60%", top: "30%" },
  { id: "ship", word: "Корабль", reveal: "Кораблик в бутылке.", left: "70%", top: "12%" },
  { id: "scythe", word: "Коса", reveal: "Коса жнеца, не волосы.", left: "4%", top: "58%" },
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
  const [face, setFace] = useState(false);
  const [line, setLine] = useState("Десять из тридцати. Названия врут.");
  const [busy, setBusy] = useState(false);
  const [reels, setReels] = useState(["note", "moon", "skull"]);
  const [spinning, setSpinning] = useState(false);
  const [slotLine, setSlotLine] = useState("2 ноты");
  const [slot, setSlot] = useState(false);
  const done = found.length === round.length;
  const left = round.filter((item) => !found.includes(item.id));
  const active = new Set(round.map((item) => item.id));

  function tap(id: string, reveal: string) {
    setLine(reveal);
    setFound((cur) => (cur.includes(id) ? cur : [...cur, id]));
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
        <div className="relative" style={{ aspectRatio: "16 / 9", width: "min(100cqw, calc(100cqh * 16 / 9))" }}>
          <img src="/rooms/hunt.jpg" alt="Кладовая" className="absolute inset-0 h-full w-full object-fill" />
          <div
            className="absolute overflow-hidden"
            style={{ left: "8%", top: "18%", width: "10%", height: "24%" }}
            onPointerEnter={() => setFace(true)}
            onPointerLeave={() => setFace(false)}
            onClick={() => setFace((on) => !on)}
          >
            <img
              src="/rooms/face.jpg"
              alt=""
              className={`h-full w-full origin-center object-cover transition-opacity duration-300 ${face ? "scale-[2.2] opacity-85" : "scale-[2.2] opacity-0"}`}
            />
          </div>
          <button
            type="button"
            aria-label="Картина"
            className="absolute cursor-default overflow-hidden rounded-sm shadow-md"
            style={{ left: "37%", top: "5%", width: "20%", height: "24%" }}
            onClick={() => setSlot(true)}
          >
            <img src="/rooms/cowboy.jpg" alt="" className="h-full w-full object-cover" />
          </button>
          {FINDS.map((item) => {
            if (found.includes(item.id)) return null;
            const box = { left: item.left, top: item.top, width: "7%", height: "13%" };
            if (!active.has(item.id)) {
              return (
                <img
                  key={item.id}
                  src={`/rooms/items/${item.id}.png`}
                  alt=""
                  className="pointer-events-none absolute object-contain drop-shadow-md"
                  style={box}
                />
              );
            }
            return (
              <button
                key={item.id}
                type="button"
                aria-label={item.word}
                className="absolute cursor-default"
                style={box}
                onClick={() => tap(item.id, item.reveal)}
              >
                <img src={`/rooms/items/${item.id}.png`} alt="" className="h-full w-full object-contain drop-shadow-md" />
              </button>
            );
          })}
          {slot ? (
            <div
              className="absolute z-10 flex flex-col items-center rounded-md border border-[#8a7044] bg-[#1a120c]/95 px-2 py-2 text-[#f4e4c4]"
              style={{ left: "28%", top: "36%", width: "44%" }}
            >
              <p className="text-[10px] tracking-widest text-[#c4a574]">СЛОМАН</p>
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
