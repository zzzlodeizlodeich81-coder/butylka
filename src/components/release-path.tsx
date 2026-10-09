import { useEffect, useState, type ReactNode } from "react";
import { RELEASE_STEPS, type PathGo } from "@/lib/release-path";
import { Button } from "@/components/ui/button";
import { HelperChat } from "@/components/helper-dock";

type Card = { artist: string; track: string; style: string; about: string; done: string[] };

const EMPTY: Card = { artist: "", track: "", style: "", about: "", done: [] };

function loadCard(): Card {
  try {
    const raw = JSON.parse(localStorage.getItem("kadr-artist-card") || "") as Partial<Card>;
    return {
      artist: String(raw.artist || ""),
      track: String(raw.track || ""),
      style: String(raw.style || ""),
      about: String(raw.about || ""),
      done: Array.isArray(raw.done) ? raw.done.filter((id) => typeof id === "string") : [],
    };
  } catch {
    return EMPTY;
  }
}

function Field({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-[#3a2a18] bg-[#1a120c] px-2 py-1.5">
      <p className="text-[10px] tracking-wide text-[#c4a574]">{label}</p>
      <p className="text-sm text-[#f4e4c4]">{value || "пусто"}</p>
      {hint ? <p className="text-[10px] text-[#8d7350]">{hint}</p> : null}
    </div>
  );
}

function Screen({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="overflow-hidden rounded-2xl border border-[#c4a574]/40 bg-[#f6efe2] text-[#1a120c] shadow">
      <div className="flex items-center gap-2 bg-[#2a1a0c] px-3 py-1.5 text-[11px] text-[#f4e4c4]">
        <span className="size-2 rounded-full bg-[#e8a090]" />
        <span className="size-2 rounded-full bg-[#e6c36a]" />
        <span className="size-2 rounded-full bg-[#9cba8a]" />
        <span className="ml-1">{title}</span>
      </div>
      <div className="space-y-2 p-3">{children}</div>
    </div>
  );
}

function StepScreen({ id, card }: { id: string; card: Card }) {
  if (id === "card") {
    return (
      <Screen title="Карточка артиста">
        <Field label="АРТИСТ" value={card.artist} hint="как на площадках" />
        <Field label="ТРЕК" value={card.track} />
        <Field label="СТИЛЬ" value={card.style} hint="рок, шансон, электро" />
        <Field label="О ЧЁМ ПЕСНЯ" value={card.about} hint="пересказ, не весь текст" />
      </Screen>
    );
  }
  if (id === "stihi") {
    return (
      <Screen title="stihi.ru · новое произведение">
        <Field label="НАЗВАНИЕ" value={card.track} />
        <Field label="ТЕКСТ" value="свой текст целиком, первая редакция" hint="чужое не вставлять" />
        <div className="rounded-lg bg-[#2a1a0c] px-2 py-1.5 text-center text-sm text-[#f4e4c4]">Опубликовать</div>
        <p className="text-[11px] leading-snug">
          Потом: мои произведения, свидетельство. В нём дата и исходный текст. Ссылка{" "}
          <a className="underline" href="https://stihi.ru" target="_blank" rel="noreferrer">
            stihi.ru
          </a>
          , правила свидетельства{" "}
          <a className="underline" href="https://o.stihi.ru/svidetelstvo" target="_blank" rel="noreferrer">
            здесь
          </a>
          .
        </p>
      </Screen>
    );
  }
  if (id === "song") {
    return (
      <Screen title="Студия">
        <Field label="ЧТО ВАРЯТ" value={card.track || "название с карточки"} />
        <Field label="СТИЛЬ" value={card.style} />
        <p className="text-[11px]">Кнопки на месте: сварить, кавер, минус, стемы, принести свой файл.</p>
      </Screen>
    );
  }
  if (id === "sound") {
    return (
      <Screen title="Фабрика звука · эксперт">
        {["Громкость", "Компрессор порог", "Компрессор сила", "Лимитер", "Ревер", "60 · 150 · 400 · 1000 · 2500 · 6000 · 12000"].map((row) => (
          <div key={row} className="flex items-center gap-2 text-[11px]">
            <span className="w-40 shrink-0">{row}</span>
            <span className="h-1.5 flex-1 rounded-full bg-[#d9c7a4]" />
          </div>
        ))}
        <p className="text-[11px]">Помощник фабрики отдаёт все эти ручки одним сообщением. Сначала спросит жанр, настроение и похожую песню.</p>
      </Screen>
    );
  }
  if (id === "cover") {
    return (
      <Screen title="Обложка">
        <div className="mx-auto flex size-28 items-center justify-center rounded-lg border border-dashed border-[#3a2a18] text-center text-[11px]">
          квадрат
          <br />
          от 500 px
          <br />
          без букв
        </div>
        <Field label="ФАЙЛ" value="JPG или PNG, до 10 Мб" />
      </Screen>
    );
  }
  if (id === "bandlink") {
    return (
      <Screen title="BandLink · релиз">
        <Field label="СТАТУС" value="Не опубликован" hint="пока трек не вышел" />
        <Field label="АРТИСТ" value={card.artist} />
        <Field label="НАЗВАНИЕ" value={card.track} />
        <Field label="КОРОТКО" value="до 200 знаков" />
        <Field label="ОПИСАНИЕ RU" value={card.about || "из пересказа, не весь текст"} />
        <Field label="ОПИСАНИЕ EN" value="тот же смысл по-английски" />
        <Field label="ТЕГИ" value={card.style || "3–5 по стилю"} />
        <Field label="UPC" value="вставить и нажать «Добавить пресейв»" />
      </Screen>
    );
  }
  if (id === "field") {
    return (
      <Screen title="Поле пресейвов">
        <Field label="ССЫЛКА КАРТОЧКИ" value="band.link / …" />
        <Field label="ЦЕНА" value="2 ноты поставить, 0,1 ноты за клик" />
        <Field label="СТОП" value="после 10 кликов карточка гаснет" />
      </Screen>
    );
  }
  return (
    <Screen title="Площадки · ещё не вшиты">
      <Field label="NEEDLE" value="REF-9126-D78F6A" />
      <Field label="SFEROOM" value="DJAngelA17 · Sunrise17 · Severyanka17" />
      <Field label="КОГДА В ГОРОДЕ БОЛЬШЕ 100" value="их кабинеты откроются здесь" hint="сейчас кнопки входа нет" />
    </Screen>
  );
}

export function ReleasePath({ onClose, onGo }: { onClose: () => void; onGo: (id: PathGo) => void }) {
  const [card, setCard] = useState<Card>(EMPTY);
  const [step, setStep] = useState(0);
  const [ask, setAsk] = useState("");

  useEffect(() => {
    setCard(loadCard());
  }, []);

  function save(next: Card) {
    setCard(next);
    try {
      localStorage.setItem("kadr-artist-card", JSON.stringify(next));
    } catch {
      /* карточка останется до закрытия */
    }
  }

  const current = RELEASE_STEPS[step];
  const done = card.done.includes(current.id);

  function askAngel() {
    const filled = [`Артист: ${card.artist || "не указан"}`, `Трек: ${card.track || "не указан"}`, `Стиль: ${card.style || "не указан"}`, `О чём: ${card.about || "не сказано"}`].join(". ");
    setAsk(`Я на шаге «${current.title}». ${filled}. Скажи, что вписать именно на этом шаге. Не перескакивай дальше.`);
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-2 sm:items-center">
      <div className="max-h-[92dvh] w-full max-w-lg overflow-auto rounded-3xl bg-[#1a120c] p-3 text-[#f4e4c4]">
        <div className="flex items-center justify-between gap-2">
          <h2 className="font-display text-2xl">Путь релиза</h2>
          <button type="button" className="rounded-full bg-white/10 px-3 py-1 text-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="mt-1 text-xs text-[#c4a574]">
          Анджел ведёт эту карточку от текста до посева. Бланки ниже показывают, какое поле чем заполнять. Спросить его стоит 5 нот. Сам путь бесплатный.
        </p>
        <div className="mt-3 flex gap-1 overflow-auto">
          {RELEASE_STEPS.map((item, index) => (
            <button
              key={item.id}
              type="button"
              className={`shrink-0 rounded-full px-2 py-1 text-[11px] ${index === step ? "bg-[#f4e4c4] text-[#1a120c]" : "bg-black/30"}`}
              onClick={() => setStep(index)}
            >
              {card.done.includes(item.id) ? "● " : ""}
              {index + 1}. {item.title}
            </button>
          ))}
        </div>
        <p className="mt-3 text-xs tracking-widest text-[#c4a574]">{current.where}</p>
        <h3 className="font-display text-xl">{current.title}</h3>
        <p className="mt-1 text-sm leading-relaxed">{current.lead}</p>
        <ul className="mt-2 list-disc space-y-1 pl-4 text-sm text-[#e7d3b0]">
          {current.points.map((point) => (
            <li key={point}>{point}</li>
          ))}
        </ul>
        {current.id === "card" ? (
          <div className="mt-3 space-y-2">
            {(
              [
                ["artist", "Имя артиста"],
                ["track", "Название трека"],
                ["style", "Стиль"],
                ["about", "О чём песня, своими словами"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block text-xs">
                {label}
                <input
                  className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
                  value={card[key]}
                  maxLength={key === "about" ? 400 : 80}
                  onChange={(event) => save({ ...card, [key]: event.target.value })}
                />
              </label>
            ))}
          </div>
        ) : null}
        <div className="mt-3">
          <StepScreen id={current.id} card={card} />
        </div>
        <div className="mt-3 flex flex-col gap-2">
          {current.go ? (
            <Button className="rounded-xl" onClick={() => onGo(current.go as PathGo)}>
              {current.goLabel}
            </Button>
          ) : null}
          {current.id === "stihi" ? (
            <a className="rounded-xl bg-white/10 px-3 py-2 text-center text-sm" href="https://stihi.ru" target="_blank" rel="noreferrer">
              Открыть Стихи.ру
            </a>
          ) : null}
          {current.id === "bandlink" ? (
            <a className="rounded-xl bg-white/10 px-3 py-2 text-center text-sm" href="https://band.link" target="_blank" rel="noreferrer">
              Открыть BandLink
            </a>
          ) : null}
          <Button variant="secondary" className="rounded-xl" onClick={askAngel}>
            Спросить Анджела про этот шаг
          </Button>
          <button
            type="button"
            className="text-sm underline"
            onClick={() =>
              save({
                ...card,
                done: done ? card.done.filter((id) => id !== current.id) : [...card.done, current.id],
              })
            }
          >
            {done ? "Вернуть шаг" : "Шаг сделан"}
          </button>
        </div>
        <div className="mt-3 flex justify-between text-sm">
          <button type="button" disabled={step === 0} className="disabled:opacity-30" onClick={() => setStep((n) => n - 1)}>
            Назад
          </button>
          <span>
            {card.done.length} из {RELEASE_STEPS.length}
          </span>
          <button
            type="button"
            disabled={step === RELEASE_STEPS.length - 1}
            className="disabled:opacity-30"
            onClick={() => setStep((n) => n + 1)}
          >
            Дальше
          </button>
        </div>
      </div>
      {ask ? <HelperChat who="angel" start={ask} onClose={() => setAsk("")} /> : null}
    </div>
  );
}

export function artistCardLine() {
  const card = loadCard();
  if (!card.artist && !card.track) return "";
  return [card.artist, card.track].filter(Boolean).join(" · ");
}
