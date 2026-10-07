import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { YardChat } from "@/components/yard-square";
import { useWallet } from "@/lib/wallet";

type Seat = { id: string; name: string; photo: string; points: number };
type Card = { id: string; name: string; photo: string; vote?: "yes" | "no" };
type Table = { seats: Seat[]; turn: number; phase: "wait" | "vote"; windows: Card[]; spunAt: number; result?: Card[]; cheer?: number };

let audio: AudioContext | null = null;

function tone(freq: number, at: number, dur: number, type: OscillatorType, gain: number) {
  if (!audio) audio = new AudioContext();
  const osc = audio.createOscillator();
  const amp = audio.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  amp.gain.setValueAtTime(gain, audio.currentTime + at);
  amp.gain.exponentialRampToValueAtTime(0.001, audio.currentTime + at + dur);
  osc.connect(amp);
  amp.connect(audio.destination);
  osc.start(audio.currentTime + at);
  osc.stop(audio.currentTime + at + dur);
}

function playSpin() {
  let at = 0;
  for (let i = 0; i < 32; i++) {
    const gap = i < 10 ? 0.14 - i * 0.01 : 0.04 + (i - 10) * 0.012;
    tone(150 + (i % 5) * 55, at, 0.04, "square", 0.028);
    at += Math.max(0.035, gap);
  }
}

function playCheer() {
  tone(523, 0, 0.35, "triangle", 0.08);
  tone(659, 0.12, 0.4, "triangle", 0.08);
  tone(784, 0.24, 0.55, "triangle", 0.09);
}

async function call(body: Record<string, unknown>) {
  const res = await fetch("/api/door", {
    method: "POST",
    credentials: "same-origin",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "orpheus", ...body }),
  });
  return (await res.json()) as { ok?: boolean; error?: string; table?: Table; me?: string; notes?: number };
}

export function OrpheusRoom({
  plotId,
  phone,
  host,
  onClose,
  onOpenChat,
}: {
  plotId: string;
  phone: boolean;
  host: boolean;
  onClose: () => void;
  onOpenChat: () => void;
}) {
  const [table, setTable] = useState<Table | null>(null);
  const [me, setMe] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [buy, setBuy] = useState("1");
  const [now, setNow] = useState(() => Date.now());
  const heard = useRef({ spin: 0, cheer: 0 });

  async function pull() {
    const row = await call({ op: "look", id: plotId });
    if (!row.ok || !row.table) return;
    if (row.me) setMe(row.me);
    setTable((prev) => {
      if (row.table && prev && row.table.spunAt && row.table.spunAt !== prev.spunAt) {
        setSpinning(true);
        window.setTimeout(() => setSpinning(false), 3900);
      }
      return row.table || prev;
    });
    if (typeof row.notes === "number") useWallet.getState().apply({ notes: row.notes });
  }

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 500);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!table?.spunAt || table.spunAt === heard.current.spin) return;
    heard.current.spin = table.spunAt;
    playSpin();
  }, [table?.spunAt]);

  useEffect(() => {
    if (spinning || !table?.cheer || table.cheer === heard.current.cheer) return;
    heard.current.cheer = table.cheer;
    playCheer();
  }, [table?.cheer, spinning]);

  useEffect(() => {
    void call({ op: "sit", id: plotId }).then((row) => {
      if (row.me) setMe(row.me);
      if (row.table) setTable(row.table);
    });
  }, [plotId]);

  useEffect(() => {
    void pull();
    const timer = window.setInterval(() => void pull(), 2000);
    return () => window.clearInterval(timer);
  }, [plotId]);

  async function act(op: string, extra: Record<string, unknown> = {}) {
    const row = await call({ op, id: plotId, ...extra });
    if (!row.ok) {
      if (row.table) setTable(row.table);
      toast.error(row.error || "Не вышло.");
      return;
    }
    if (row.table) setTable(row.table);
    if (typeof row.notes === "number") useWallet.getState().apply({ notes: row.notes });
    if (op === "spin" && row.table) {
      setSpinning(true);
      window.setTimeout(() => setSpinning(false), 3900);
    }
    if (op === "invite") toast.success("Позвала во все чаты.");
  }

  const seats = table?.seats || [];
  const turn = seats[table?.turn || 0];
  const mine = seats.find((seat) => seat.id === me);
  const shown = table?.windows || [];
  useEffect(() => {
    if (!phone) onOpenChat();
  }, [phone, onOpenChat]);

  const cards = table?.phase === "vote" ? shown : table?.result || [];
  const matched = cards.length >= 3 && cards.every((card) => card.vote === "yes");
  const reel = seats.filter((seat) => seat.points > 0);

  const slots = [
    { left: "30.9%", top: "33%", width: "9.4%", height: "8%" },
    { left: "44.7%", top: "33%", width: "8.7%", height: "8%" },
    { left: "58.1%", top: "33%", width: "9.1%", height: "8%" },
  ];
  const spinMs = [2400, 3100, 3900];

  function windowFace(card: Card | undefined, index: number) {
    const faces: Card[] = [];
    if (spinning && reel.length) {
      for (let step = 0; step < 14; step++) faces.push(reel[(step * 3 + index) % reel.length]);
      if (card) faces.push(card);
    } else if (card) faces.push(card);
    const dark = card?.vote === "no" && !spinning;
    const box = slots[index];
    return (
      <div key={index} className="absolute overflow-hidden rounded-[2px]" style={{ ...box, containerType: "size" }}>
        <div
          className={dark ? "opacity-40 grayscale" : ""}
          style={
            spinning && faces.length > 1
              ? {
                  animation: `orpheus-drop ${spinMs[index]}ms cubic-bezier(0.33, 0.02, 0.12, 1) forwards`,
                  ["--steps" as string]: String(faces.length - 1),
                }
              : undefined
          }
        >
          {faces.map((item, frame) =>
            item?.photo ? (
              <img key={frame} src={item.photo} alt="" className="w-full object-cover" style={{ height: "100cqh" }} />
            ) : (
              <span key={frame} className="flex w-full items-center justify-center bg-[#1a120c] text-[8px] text-[#f4e4c4]" style={{ height: "100cqh" }}>
                {(item?.name || "·").slice(0, 1)}
              </span>
            ),
          )}
        </div>
      </div>
    );
  }

  const board = (
    <div className="flex min-h-0 flex-col gap-2 overflow-auto p-3 text-[#f4e4c4]">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-xl">Орфей</p>
        <div className="flex items-center gap-2">
          {host ? (
            <Button variant="secondary" className="rounded-xl px-3 py-1" onClick={() => void act("invite")}>
              Позвать играть
            </Button>
          ) : null}
          <button type="button" className="text-sm" onClick={onClose}>
            На двор
          </button>
        </div>
      </div>
      <div
        className="relative mx-auto aspect-square w-full max-w-[280px] bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/slot.jpg)" }}
      >
        <style>{`@keyframes orpheus-drop { from { transform: translateY(0); } to { transform: translateY(calc(var(--steps) * -100cqh)); } }`}</style>
        {[0, 1, 2].map((index) => windowFace(shown[index], index))}
      </div>
      {matched && !spinning ? <p className="text-center font-display text-3xl leading-none text-[#ffe7a3]">Oh jaaa, das ist fantastisch!</p> : null}
      {!spinning ? (
        <div className="relative mx-auto h-24 w-full max-w-[280px]">
          {cards.map((card, index) => (
            <div
              key={`${card.id}-${index}`}
              className="absolute top-0 flex w-16 flex-col items-center transition-all duration-700"
              style={{
                left: matched ? "calc(50% - 2rem)" : `${8 + index * 30}%`,
                zIndex: index + 1,
                transform: matched ? `rotate(${index * 8 - 8}deg)` : undefined,
              }}
            >
              {card.photo ? (
                <img src={card.photo} alt="" className={`h-12 w-12 rounded-md object-cover ${card.vote === "no" ? "opacity-40 grayscale" : ""}`} />
              ) : (
                <span className="flex h-12 w-12 items-center justify-center rounded-md bg-[#2a1a0c] text-sm">{card.name.slice(0, 1)}</span>
              )}
              <span className="max-w-full truncate text-[10px]">{card.name}</span>
              <span className={`text-[10px] font-medium ${card.vote === "yes" ? "text-[#b6e3a8]" : card.vote === "no" ? "text-[#e7a0a0]" : "text-[#c4a574]"}`}>
                {card.vote === "yes" ? "согласен" : card.vote === "no" ? "отказ" : "ждёт"}
              </span>
            </div>
          ))}
        </div>
      ) : (
        <p className="h-24 text-center text-sm text-[#c4a574]">Барабаны крутятся…</p>
      )}
      <p className="text-xs text-[#c4a574]">
        {turn ? `Очередь: ${turn.name}` : "Стол пуст."} У каждого 15 баллов. Не согласен — минус балл и карточка гаснет. Согласен — плюс балл. Если согласны все трое, каждому по 2.
      </p>
      <div className="flex flex-wrap gap-2">
        {seats.map((seat) => (
          <span key={seat.id} className={`rounded-full px-2 py-1 text-xs ${seat.points > 0 ? "bg-white/10" : "bg-black/40 line-through"}`}>
            {seat.name} · {seat.points}
          </span>
        ))}
      </div>
      {!mine ? (
        <Button className="rounded-xl" onClick={() => void act("sit")}>
          Сесть за стол
        </Button>
      ) : (
        <p className="text-sm">Ты за столом. Нажал на статую — уже в игре.</p>
      )}
      {table?.phase === "vote" && !spinning ? (
        <p className="text-sm">Молчишь — это отказ. Осталось {Math.max(0, 20 - Math.floor((now - table.spunAt) / 1000))} с.</p>
      ) : null}
      {table?.phase === "vote" && !spinning && !shown.some((card) => card.id === me && !card.vote) ? (
        <p className="text-sm">Решают: {shown.map((card) => `${card.name} ${card.vote === "yes" ? "да" : card.vote === "no" ? "нет" : "ждёт"}`).join(", ") || "карточки"}.</p>
      ) : null}
      {mine && turn && turn.id !== me && table?.phase === "wait" ? <p className="text-sm">Крутит {turn.name}. Кнопка будет, когда очередь дойдёт до тебя.</p> : null}
      {mine && turn?.id === me && table?.phase === "wait" && mine.points > 0 ? (
        <Button className="rounded-xl" onClick={() => void act("spin")}>
          Крутить
        </Button>
      ) : null}
      {mine && !spinning && table?.phase === "vote" && shown.some((card) => card.id === me && !card.vote) ? (
        <div className="flex gap-2">
          <Button className="rounded-xl" onClick={() => void act("vote", { text: "yes" })}>
            Согласен
          </Button>
          <Button variant="secondary" className="rounded-xl" onClick={() => void act("vote", { text: "no" })}>
            Не согласен
          </Button>
        </div>
      ) : null}
      {mine && mine.points <= 0 ? <p className="text-sm">Баллы кончились. Можно докупить: 1 нота за 1 балл.</p> : null}
      {mine ? (
        <div className="flex gap-2">
          <input
            className="w-16 rounded-xl bg-black/30 px-2 py-1 text-sm"
            inputMode="numeric"
            value={buy}
            onChange={(event) => setBuy(event.target.value)}
          />
          <Button variant="secondary" className="rounded-xl" onClick={() => void act("buy", { amount: Number(buy) || 1 })}>
            Купить баллы
          </Button>
        </div>
      ) : null}
    </div>
  );

  if (phone) {
    return (
      <div className="absolute inset-0 z-40 flex flex-col bg-[#140e0c]">
        <div className="h-1/2 min-h-0">{board}</div>
        <div className="relative h-1/2 min-h-0">
          <YardChat
            half
            plot={plotId}
            onClose={onClose}
            pingYard={false}
            pingPeople={[]}
            myId={me}
            onSeenYard={() => undefined}
            onOpenPerson={() => undefined}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="absolute top-1/2 left-1/2 z-30 flex max-h-[70dvh] w-[min(420px,92vw)] -translate-x-[58%] -translate-y-1/2 flex-col overflow-hidden rounded-2xl bg-[#140e0c] shadow-2xl">
      {board}
    </div>
  );
}
