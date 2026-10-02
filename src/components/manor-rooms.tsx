import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { playRoom } from "@/lib/rooms";
import { useWallet } from "@/lib/wallet";

const FINDS = [
  { id: "onion", word: "Лук", reveal: "Луковица. Не лук со стрелой.", left: "14%", top: "60%", width: "16%", height: "20%" },
  { id: "scythe", word: "Коса", reveal: "Коса жнеца. Не прядь волос.", left: "1%", top: "30%", width: "14%", height: "46%" },
  { id: "key", word: "Ключ", reveal: "Ключ от двери. Не гаечный.", left: "40%", top: "44%", width: "16%", height: "14%" },
  { id: "brush", word: "Кисть", reveal: "Кисть художника. Не кисть руки.", left: "54%", top: "70%", width: "16%", height: "18%" },
  { id: "vulture", word: "Гриф", reveal: "Птица гриф. Не гриф гитары.", left: "62%", top: "6%", width: "12%", height: "18%" },
] as const;

const GLYPH: Record<string, string> = {
  dust: "·",
  note: "♪",
  moon: "☾",
  skull: "☠",
  frame: "▣",
};

export function HuntRoom({ onClose }: { onClose: () => void }) {
  const [found, setFound] = useState<string[]>([]);
  const [face, setFace] = useState(false);
  const [line, setLine] = useState("Названия врут. Ищи сам.");
  const [busy, setBusy] = useState(false);
  const done = found.length === FINDS.length;

  function tap(id: string, reveal: string) {
    setLine(reveal);
    setFound((cur) => (cur.includes(id) ? cur : [...cur, id]));
  }

  return (
    <div className="absolute inset-0 z-30 bg-black">
      <div
        className="absolute inset-x-0 flex items-center justify-center [container-type:size]"
        style={{ top: "2.4rem", bottom: "6.2rem" }}
      >
        <div className="relative" style={{ aspectRatio: "16 / 9", width: "min(100cqw, calc(100cqh * 16 / 9))" }}>
          <img src="/rooms/hunt.jpg" alt="Кладовая" className="absolute inset-0 h-full w-full object-fill" />
          <div
            className="absolute overflow-hidden"
            style={{ left: "74%", top: "10%", width: "22%", height: "58%" }}
            onPointerEnter={() => setFace(true)}
            onPointerLeave={() => setFace(false)}
            onClick={() => setFace((on) => !on)}
          >
            <img
              src="/rooms/face.jpg"
              alt=""
              className={`h-full w-full object-cover transition-opacity duration-300 ${face ? "opacity-90" : "opacity-0"}`}
            />
          </div>
          {FINDS.map((item) => (
            <button
              key={item.id}
              type="button"
              aria-label={item.word}
              className="absolute"
              style={{ left: item.left, top: item.top, width: item.width, height: item.height }}
              onClick={() => tap(item.id, item.reveal)}
            />
          ))}
        </div>
      </div>
      <div className="absolute inset-x-0 bottom-0 bg-black/70 px-3 pt-2 pb-[max(0.6rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <p className="text-sm">{line}</p>
        <p className="mt-1 text-xs text-white/70">
          {FINDS.map((item) => (found.includes(item.id) ? item.word : "···")).join("  ·  ")}
        </p>
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
        <span className="rounded-full bg-black/45 px-3 py-1">Найди: лук, косу, ключ, кисть, гриф</span>
      </p>
    </div>
  );
}

export function SlotRoom({ onClose }: { onClose: () => void }) {
  const [reels, setReels] = useState<string[]>(["note", "moon", "frame"]);
  const [busy, setBusy] = useState(false);
  const [line, setLine] = useState("Ставка 2 ноты. Три одинаковых платят. Остальное сгорает.");

  return (
    <div className="absolute inset-0 z-30 flex flex-col items-center justify-center bg-[#140c0e] px-4 text-[#f4e4c4]">
      <p className="font-display text-3xl">Однорукий</p>
      <p className="mt-2 max-w-sm text-center text-sm text-white/70">
        Автомат в плюсе. Три кадра — 30 нот, три ноты — 8, три луны — 4. Череп и пыль не платят. В долгую ноты тают.
      </p>
      <div className="mt-6 flex gap-3">
        {reels.map((symbol, index) => (
          <div
            key={index}
            className="flex size-20 items-center justify-center rounded-2xl border border-[#f4e4c4]/30 bg-black font-display text-4xl"
          >
            {GLYPH[symbol] || "·"}
          </div>
        ))}
      </div>
      <p className="mt-4 text-sm">{line}</p>
      <div className="mt-4 flex gap-2">
        <Button variant="secondary" className="rounded-xl" onClick={onClose}>
          В особняк
        </Button>
        <Button
          className="rounded-xl"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              setLine("Крутится…");
              try {
                const res = await playRoom({ data: { action: "spin" } });
                if (!res.ok) {
                  toast.error(res.error);
                  setLine("Не вышло.");
                  return;
                }
                setReels(res.reels || []);
                useWallet.getState().apply({ notes: res.notes });
                setLine(res.win ? `Выпало ${res.win} нот.` : "Пусто. Две ноты сгорели.");
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          Дёрнуть · 2 ноты
        </Button>
      </div>
    </div>
  );
}
