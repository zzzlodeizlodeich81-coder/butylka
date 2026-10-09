import { useState } from "react";
import { MaxFigure } from "@/components/max-figure";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";

type Who = "angel" | "tech" | "master";
type Line = { role: "user" | "assistant"; content: string; bill?: string };

const COPY = {
  angel: {
    name: "DJ Angel A",
    face: "/angel.jpg",
    ask: "Карточка, дистрибьютор, тариф, обложка. Спроси как выпускать.",
  },
  tech: {
    name: "Хозяин города",
    face: "/manor.jpg",
    ask: "Кнопки, ноты, студия, карта. Спроси, как это работает.",
  },
  master: {
    name: "Фабрика звука",
    face: "/manor.jpg",
    ask: "Жанр, настроение и на какую песню похоже. Ручки придут одним сообщением.",
  },
} as const;

function Sprite({ who }: { who: Who }) {
  if (who === "tech") return <MaxFigure className="h-64 w-40 shrink-0" />;
  return <img src={COPY[who].face} alt="" className="h-40 w-28 shrink-0 rounded-2xl object-cover object-top" />;
}

export function HelperChat({ who, onClose, start = "" }: { who: Who; onClose: () => void; start?: string }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState(start);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const copy = COPY[who];

  function ask() {
    const next = text.trim();
    if (next.length < 2 || busy) return;
    setText("");
    setError("");
    setBusy(true);
    const history = lines.map(({ role, content }) => ({ role, content }));
    setLines((cur) => [...cur, { role: "user", content: next }]);
    void (async () => {
      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: next, history, mode: who }),
        });
        const data = (await res.json().catch(() => null)) as { text?: string; error?: string; notes?: number; bill?: string } | null;
        if (typeof data?.notes === "number") useWallet.getState().apply({ notes: data.notes });
        if (!res.ok || !data?.text) {
          setError(data?.error || "Молчит.");
          return;
        }
        setLines((cur) => [...cur, { role: "assistant", content: data.text || "", bill: data.bill }]);
      } catch {
        setError("Молчит.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/45 p-2 sm:items-center">
      <div className="flex w-full max-w-lg gap-2 rounded-3xl bg-[#1a120c] p-3 text-[#f4e4c4]">
        <Sprite who={who} />
        <div className="flex min-h-64 min-w-0 flex-1 flex-col">
          <div className="flex items-center justify-between gap-2">
            <h2 className="font-display text-xl">{copy.name}</h2>
            <button type="button" className="rounded-full bg-white/10 px-3 py-1 text-sm" onClick={onClose}>
              Закрыть
            </button>
          </div>
          <p className="text-xs text-[#c4a574]">Ответ по токенам: себестоимость плюс 50%. Если молчит, ноты не списываются.</p>
          <div className="mt-2 min-h-24 flex-1 space-y-2 overflow-auto">
            {lines.length === 0 ? <p className="text-sm text-[#c4a574]">{copy.ask}</p> : null}
            {lines.map((line, index) => (
              <div key={index} className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${line.role === "user" ? "bg-black/40" : "bg-[#2a1a0c]"}`}>
                {line.content}
                {line.bill ? <p className="mt-1 text-[11px] text-[#c4a574]">{line.bill}</p> : null}
              </div>
            ))}
          </div>
          {error ? <p className="mt-1 text-xs text-[#e8a090]">{error}</p> : null}
          <div className="mt-2 flex gap-2">
            <input
              value={text}
              onChange={(e) => setText(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") ask();
              }}
              placeholder="Вопрос"
              className="min-w-0 flex-1 rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
            />
            <Button className="rounded-xl" disabled={busy} onClick={ask}>
              {busy ? "…" : "Спросить"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

export function HelperDock() {
  const [pick, setPick] = useState(false);
  const [who, setWho] = useState<Who | null>(null);
  return (
    <>
      <button
        type="button"
        className="fixed top-[max(4.2rem,calc(env(safe-area-inset-top)+3.6rem))] right-3 z-30 rounded-full bg-[#f4e4c4] px-3 py-2 text-sm text-[#1a120c] shadow"
        onClick={() => setPick(true)}
      >
        Позвать
      </button>
      {pick && !who ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-black/45 p-3" onClick={() => setPick(false)}>
          <div className="w-full max-w-sm rounded-3xl bg-[#1a120c] p-3 text-[#f4e4c4]" onClick={(e) => e.stopPropagation()}>
            <p className="px-1 font-display text-xl">Кого звать</p>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button type="button" className="rounded-2xl bg-black/30 p-2 text-left" onClick={() => setWho("angel")}>
                <img src="/angel.jpg" alt="" className="h-28 w-full rounded-xl object-cover object-top" />
                <span className="mt-1 block text-sm">Вопрос по творчеству</span>
              </button>
              <button type="button" className="rounded-2xl bg-black/30 p-2 text-left" onClick={() => setWho("tech")}>
                <MaxFigure className="h-28 w-full" />
                <span className="mt-1 block text-sm">Вопрос по игре</span>
              </button>
            </div>
          </div>
        </div>
      ) : null}
      {who ? (
        <HelperChat
          who={who}
          onClose={() => {
            setWho(null);
            setPick(false);
          }}
        />
      ) : null}
    </>
  );
}

export function AngelHouse({ onClose, onPath }: { onClose: () => void; onPath?: () => void }) {
  const [chat, setChat] = useState(false);
  return (
    <div className="absolute inset-0 z-40 bg-[#f3ead7]">
      <img src="/angel-house.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
      <div className="absolute top-0 left-0 z-10 flex flex-nowrap gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" className="rounded-full bg-black/55 px-3 py-1 text-sm text-white" onClick={onClose}>
          На карту
        </button>
        <button type="button" className="rounded-full bg-white px-3 py-1 text-sm text-black" onClick={() => onPath?.()}>
          Путь релиза
        </button>
        <button type="button" className="rounded-full bg-white px-3 py-1 text-sm text-black" onClick={() => setChat(true)}>
          Поговорить
        </button>
      </div>
      <button
        type="button"
        className="absolute right-[8%] bottom-[12%] rounded-full bg-black/55 px-3 py-1 text-sm text-white"
        onClick={() => setChat(true)}
      >
        Спросить Анджела
      </button>
      <p className="absolute bottom-4 left-3 rounded-xl bg-black/50 px-3 py-2 text-sm text-[#f4e4c4]">Кабинет DJ Angel A</p>
      {chat ? <HelperChat who="angel" onClose={() => setChat(false)} /> : null}
    </div>
  );
}
