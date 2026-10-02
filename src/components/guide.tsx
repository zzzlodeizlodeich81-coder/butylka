import { useState } from "react";
import { Button } from "@/components/ui/button";

const LINES = [
  "Я дворник этого двора. Новым говорю один раз, своим больше не мешаю.",
  "Дома на картинке — студии. Жми на вывеску, и попадёшь внутрь.",
  "Ноты — деньги двора. Пока оплату ВК не открыли, их выдаёт хозяин через кассу.",
  "Сцена для готовых песен. Шарманщик слушает черновики бесплатно и ставит оценки.",
  "Своё лицо поставь в чате, вкладка «Лично». Разговор там видят только вы двое.",
];

export function Guide({ onDone }: { onDone: () => void }) {
  const [step, setStep] = useState(0);
  const last = step >= LINES.length - 1;

  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/55 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <div className="flex w-full gap-3 rounded-3xl bg-[#1a120c] p-3 text-[#f4e4c4]">
        <img src="/guide.jpg" alt="Дворник" className="h-28 w-20 shrink-0 rounded-2xl object-cover" />
        <div className="min-w-0 flex-1">
          <p className="font-display text-xl">Дворник</p>
          <p className="mt-1 text-sm leading-snug">{LINES[step]}</p>
          <div className="mt-3 flex gap-2">
            <Button
              className="rounded-xl"
              onClick={() => {
                if (last) onDone();
                else setStep((n) => n + 1);
              }}
            >
              {last ? "Понял" : "Дальше"}
            </Button>
            {!last ? (
              <Button variant="secondary" className="rounded-xl" onClick={onDone}>
                Пропустить
              </Button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
