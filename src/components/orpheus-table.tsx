import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { YardChat } from "@/components/yard-square";
import { useWallet } from "@/lib/wallet";

type Seat = { id: string; name: string; photo: string; points: number };
type Card = { id: string; name: string; photo: string; vote?: "yes" | "no" };
type Table = { seats: Seat[]; turn: number; phase: "wait" | "vote"; windows: Card[]; spunAt: number };

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
  onClose,
  onOpenChat,
}: {
  plotId: string;
  phone: boolean;
  onClose: () => void;
  onOpenChat: () => void;
}) {
  const [table, setTable] = useState<Table | null>(null);
  const [me, setMe] = useState("");
  const [spinning, setSpinning] = useState(false);
  const [tick, setTick] = useState(0);
  const [buy, setBuy] = useState("1");

  async function pull() {
    const row = await call({ op: "look", id: plotId });
    if (!row.ok || !row.table) return;
    if (row.me) setMe(row.me);
    setTable((prev) => {
      if (row.table && prev && row.table.spunAt && row.table.spunAt !== prev.spunAt) {
        setSpinning(true);
        window.setTimeout(() => setSpinning(false), 1800);
      }
      return row.table || prev;
    });
    if (typeof row.notes === "number") useWallet.getState().apply({ notes: row.notes });
  }

  useEffect(() => {
    void pull();
    const timer = window.setInterval(() => void pull(), 2000);
    return () => window.clearInterval(timer);
  }, [plotId]);

  useEffect(() => {
    if (!spinning) return;
    const timer = window.setInterval(() => setTick((value) => value + 1), 120);
    return () => window.clearInterval(timer);
  }, [spinning]);

  async function act(op: string, extra: Record<string, unknown> = {}) {
    const row = await call({ op, id: plotId, ...extra });
    if (!row.ok) {
      toast.error(row.error || "Не вышло.");
      return;
    }
    if (row.table) setTable(row.table);
    if (typeof row.notes === "number") useWallet.getState().apply({ notes: row.notes });
    if (op === "spin" && row.table) {
      setSpinning(true);
      window.setTimeout(() => setSpinning(false), 1800);
    }
  }

  const seats = table?.seats || [];
  const turn = seats[table?.turn || 0];
  const mine = seats.find((seat) => seat.id === me);
  const shown = table?.windows || [];
  useEffect(() => {
    if (!phone) onOpenChat();
  }, [phone, onOpenChat]);

  const reel = spinning ? seats.filter((seat) => seat.points > 0) : [];
  const live = (index: number) => (reel.length ? reel[(tick + index) % reel.length] : undefined);

  function face(card: Card | undefined, index: number) {
    const liveCard = spinning ? live(index) : card;
    const dark = card?.vote === "no" && !spinning;
    return (
      <div key={index} className={`flex w-[1.5cm] flex-col items-center ${dark ? "opacity-40 grayscale" : ""}`}>
        {liveCard?.photo ? (
          <img src={liveCard.photo} alt="" className="h-[1.5cm] w-[1.5cm] rounded-md object-cover" />
        ) : (
          <span className="flex h-[1.5cm] w-[1.5cm] items-center justify-center rounded-md bg-[#2a1a0c] text-xs text-[#f4e4c4]">
            {(liveCard?.name || "?").slice(0, 1)}
          </span>
        )}
        <span className="mt-0.5 max-w-[1.8cm] truncate text-[10px] text-[#f4e4c4]">{liveCard?.name || "—"}</span>
      </div>
    );
  }

  const board = (
    <div className="flex min-h-0 flex-col gap-2 overflow-auto p-3 text-[#f4e4c4]">
      <div className="flex items-center justify-between gap-2">
        <p className="font-display text-xl">Орфей</p>
        <button type="button" className="text-sm" onClick={onClose}>
          На двор
        </button>
      </div>
      <div
        className="relative mx-auto aspect-square w-full max-w-[280px] bg-contain bg-center bg-no-repeat"
        style={{ backgroundImage: "url(/slot.jpg)" }}
      >
        <div className="absolute top-[27%] right-[24%] left-[18%] flex items-start justify-between">
          {[0, 1, 2].map((index) => face(shown[index], index))}
        </div>
      </div>
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
          Сесть. 15 баллов
        </Button>
      ) : null}
      {mine && turn?.id === me && table?.phase === "wait" && mine.points > 0 ? (
        <Button className="rounded-xl" onClick={() => void act("spin")}>
          Крутить
        </Button>
      ) : null}
      {mine && table?.phase === "vote" && shown.some((card) => card.id === me && !card.vote) ? (
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
    <div className="absolute bottom-4 left-4 z-30 flex max-h-[70dvh] w-[min(420px,92vw)] flex-col overflow-hidden rounded-2xl bg-[#140e0c] shadow-2xl">
      {board}
    </div>
  );
}
