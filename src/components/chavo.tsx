import { useState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Стол",
    body: "Собери 2–8 человек. Имя нужно, фото — по желанию. Без фото будет микрофон.",
  },
  {
    title: "Колода",
    body: "Положи 1–3 трека: свой файл или ссылка Suno. Название пиши как в песне — по нему ищем текст.",
  },
  {
    title: "Найти текст по названию",
    body: "Кнопка в колоде и в «Собрать караоке». Ищем готовые слова с таймкодами в открытом каталоге lrclib. Нашли — строки едут с музыкой. Не нашли — набей такт пальцем: на телефоне жми весь экран, когда слышишь строку.",
  },
  {
    title: "Минус, запись, кавер",
    body: "«Снять минус» убирает голос. «Спеть и записать» пишет твой голос поверх минуса. «Сделать кавер» отправляет запись в Suno. Всё это можно скачать до стола.",
  },
  {
    title: "Бутылочка",
    body: "Крутите. На кого указала — поёт. Живьём бесплатно. Своя запись — 2 ноты. Кавер — 4. Поцелуй или смайл — пропуск за 1 ноту.",
  },
  {
    title: "Круг строк",
    body: "Каждый пишет строку за 10 секунд. Не успел — минус 1 нота. Из строк собирается новая песня. Когда готова — бутылочка темнеет и выбирает, кто её поёт.",
  },
  {
    title: "Оценки",
    body: "Сердце бесплатно. Цветы — 1 нота, мишка — 2, золотая нота — 5.",
  },
];

export function ChavoButton({ compact = false }: { compact?: boolean }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        type="button"
        variant={compact ? "ghost" : "secondary"}
        size={compact ? "sm" : "default"}
        className={compact ? "h-11 rounded-md px-2.5" : "rounded-xl"}
        onClick={() => setOpen(true)}
      >
        Чаво
      </Button>
      {open ? <ChavoSheet onClose={() => setOpen(false)} /> : null}
    </>
  );
}

function ChavoSheet({ onClose }: { onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/25 sm:items-center">
      <div
        role="dialog"
        aria-labelledby="chavo-title"
        className="flex max-h-[88dvh] w-full max-w-lg flex-col rounded-t-2xl border border-border bg-surface px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-5 sm:rounded-2xl"
      >
        <h2 id="chavo-title" className="font-display text-2xl text-fg">
          Чаво
        </h2>
        <p className="mt-1 text-sm text-muted">Как устроена Бутылочка.</p>
        <div className="mt-4 min-h-0 flex-1 space-y-4 overflow-auto pr-1">
          {SECTIONS.map((s) => (
            <section key={s.title}>
              <h3 className="text-sm font-medium text-fg">{s.title}</h3>
              <p className="mt-1 text-sm leading-relaxed text-muted">{s.body}</p>
            </section>
          ))}
        </div>
        <Button className="mt-4 h-12 w-full rounded-xl" onClick={onClose}>
          Понятно
        </Button>
      </div>
    </div>
  );
}

export function ChavoHint({ children }: { children: ReactNode }) {
  return <p className="text-sm text-muted">{children}</p>;
}
