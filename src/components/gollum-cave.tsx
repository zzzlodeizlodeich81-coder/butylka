import { useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { gollumDesk } from "@/lib/gollum-desk";
import { useWallet } from "@/lib/wallet";

const LINES = [
  "Вы все говно.",
  "Вашу музыку никто не слушает.",
  "Ты бездарность.",
  "Брось писать стихи, это не твоё.",
  "Пошлятина!",
  "Вы ничего не понимаете в искусстве.",
  "Кто это назвал песней?",
  "Слух оставь там, где нашёл.",
  "Талант кончился на первой строчке.",
  "Иди мимо. И молча.",
];

type Round = { step: number; total: number; q: string; options: string[]; bank: number };

type Desk = {
  ok: boolean;
  error?: string;
  notes?: number;
  free?: boolean;
  done?: boolean;
  right?: boolean;
  prize?: number;
  q?: string;
  options?: string[];
  step?: number;
  total?: number;
  bank?: number;
};

async function call(data: { action: "ring" | "play" | "pick" | "take"; pick?: number }) {
  return (await gollumDesk({ data })) as Desk;
}

export function GollumCave({ onClose }: { onClose: () => void }) {
  const [line, setLine] = useState("");
  const [scream, setScream] = useState(false);
  const [free, setFree] = useState(false);
  const [round, setRound] = useState<Round | null>(null);
  const [busy, setBusy] = useState(false);

  function notesOf(value: unknown) {
    if (typeof value === "number") useWallet.getState().apply({ notes: value });
  }

  async function play(gift: boolean) {
    setBusy(true);
    try {
      const res = await call({ action: "play" });
      notesOf(res.notes);
      if (!res.ok) {
        toast.error(res.error || "Не сел играть.");
        return;
      }
      if (res.done) return;
      if (res.q && res.options) setRound({ step: res.step || 1, total: res.total || 7, q: res.q, options: res.options, bank: res.bank || 0 });
      if (gift) setFree(false);
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="absolute inset-0 z-40 overflow-hidden bg-black">
      <img src="/rooms/bones.jpg" alt="" className="absolute inset-0 h-full w-full object-cover brightness-75 saturate-50" />
      <div className="absolute inset-0 bg-[#3a140c]/35" />
      <button type="button" className="absolute top-3 right-3 z-20 rounded-full bg-black/60 px-3 py-1 text-sm text-white" onClick={onClose}>
        На карту
      </button>
      <div className="pointer-events-none absolute top-14 left-3 max-w-[14rem] text-[#f4e4c4]">
        <p className="font-display text-2xl">Болота Голума</p>
        <p className="text-xs text-white/80">Пещера, кости, паутина. На грунте Марса первым разбился зонд «Марс-2».</p>
      </div>
      <div className="absolute bottom-[18%] left-[8%] w-24 rounded bg-black/50 p-1 text-[10px] text-[#d7c4a3]">
        <div className="mb-1 h-8 rounded bg-gradient-to-br from-[#8a8378] to-[#2c2824]" />
        обломки «Марс-2»
      </div>
      <button
        type="button"
        className="absolute bottom-[8%] left-1/2 w-28 -translate-x-1/2"
        onClick={() => setLine(LINES[Math.floor(Math.random() * LINES.length)] || LINES[0])}
      >
        <img src="/heckler.png" alt="" className="h-auto w-full" />
      </button>
      {line ? <p className="absolute bottom-[42%] left-1/2 z-10 w-max max-w-[14rem] -translate-x-1/2 rounded bg-black/80 px-2 py-1 text-sm text-[#f4e4c4]">{line}</p> : null}
      <button
        type="button"
        aria-label="камешек"
        className="absolute z-10 size-3 rounded-full bg-[#5a4632]/70"
        style={{ left: "73%", top: "81%" }}
        onClick={() => {
          setScream(true);
          void call({ action: "ring" }).then((res) => {
            notesOf(res.notes);
            if (res.ok && res.free) setFree(true);
          });
        }}
      />
      {scream ? (
        <div className="absolute inset-x-4 bottom-24 z-20 rounded-2xl bg-black/85 p-3 text-[#f4e4c4]">
          <p className="font-medium">Моя прелесть! Отдай!</p>
          {free ? <p className="mt-1 text-sm">Ладно. Один раз сыграем без нот.</p> : <p className="mt-1 text-sm">Прелесть моя. Игра всё равно за ноты.</p>}
          <Button className="mt-2 w-full rounded-xl" disabled={busy} onClick={() => void play(free)}>
            {free ? "Сыграть бесплатно" : "Сыграть · 200 нот"}
          </Button>
        </div>
      ) : (
        <Button className="absolute inset-x-4 bottom-4 z-20 rounded-xl" disabled={busy} onClick={() => void play(false)}>
          Сыграть с Голумом · 200 нот
        </Button>
      )}
      {round ? (
        <div className="absolute inset-0 z-30 flex items-end bg-black/55">
          <div className="max-h-[86%] w-full overflow-auto rounded-t-3xl bg-[#1a120c] px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
            <p className="text-xs text-[#c4a574]">
              Вопрос {round.step} из {round.total}. Лёгкие вернут только 150. Потолок 1000.
            </p>
            <p className="mt-2 text-lg">{round.q}</p>
            <div className="mt-3 flex flex-col gap-2">
              {round.options.map((option, index) => (
                <Button
                  key={option}
                  variant="secondary"
                  className="rounded-xl"
                  disabled={busy}
                  onClick={() => {
                    setBusy(true);
                    void call({ action: "pick", pick: index })
                      .then((res) => {
                        notesOf(res.notes);
                        if (!res.ok) {
                          toast.error(res.error || "Не засчиталось.");
                          return;
                        }
                        if (res.done) {
                          setRound(null);
                          toast.message(res.right ? `Забрал ${res.prize} нот.` : res.prize ? `Мимо. Осталось ${res.prize}.` : "Мимо. Ноты сгорели.");
                          return;
                        }
                        if (res.q && res.options) {
                          setRound({ step: res.step || round.step + 1, total: res.total || round.total, q: res.q, options: res.options, bank: res.bank || 0 });
                        }
                      })
                      .finally(() => setBusy(false));
                  }}
                >
                  {option}
                </Button>
              ))}
            </div>
            {round.bank ? (
              <Button
                className="mt-3 w-full rounded-xl"
                disabled={busy}
                onClick={() => {
                  setBusy(true);
                  void call({ action: "take" })
                    .then((res) => {
                      notesOf(res.notes);
                      if (!res.ok) {
                        toast.error(res.error || "Не отдал.");
                        return;
                      }
                      setRound(null);
                      toast.success(`Забрал ${res.prize} нот.`);
                    })
                    .finally(() => setBusy(false));
                }}
              >
                Забрать {round.bank}
              </Button>
            ) : null}
          </div>
        </div>
      ) : null}
    </div>
  );
}
