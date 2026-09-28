import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesButton } from "@/components/notes-shop";
import { useGame } from "@/lib/store";
import { uid } from "@/lib/utils";
import { refreshWallet } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";
import { settleYard } from "@/lib/yard-server";
import {
  ROLES,
  addHouseTake,
  readBoard,
  readFrames,
  readHouseTake,
  readRoles,
  splitDeal,
  writeBoard,
  writeRoles,
  type Listing,
  type RoleId,
} from "@/lib/yard";

type HouseId = "stage" | "record" | "factory" | "frame" | "atelier" | "cinema" | "market" | "gate";

const ZONES: { id: HouseId; label: string; left: string; top: string; width: string; height: string }[] = [
  { id: "record", label: "Дом записи", left: "8%", top: "6%", width: "24%", height: "26%" },
  { id: "factory", label: "Фабрика звука", left: "33%", top: "2%", width: "24%", height: "28%" },
  { id: "frame", label: "Рама", left: "60%", top: "8%", width: "26%", height: "24%" },
  { id: "atelier", label: "Мастерская художника", left: "74%", top: "30%", width: "24%", height: "22%" },
  { id: "stage", label: "Сцена", left: "4%", top: "46%", width: "26%", height: "28%" },
  { id: "cinema", label: "Киностудия", left: "68%", top: "54%", width: "28%", height: "28%" },
  { id: "market", label: "Торговые ряды", left: "28%", top: "60%", width: "40%", height: "18%" },
  { id: "gate", label: "Ворота", left: "38%", top: "78%", width: "24%", height: "18%" },
];

const DOORS: Partial<Record<HouseId, string>> = {
  factory: "https://zzzlodeizlodeich81-coder.github.io/audio-mastering/",
  frame: "https://zzzlodeizlodeich81-coder.github.io/image-converter/",
  atelier: "https://zzzlodeizlodeich81-coder.github.io/passport-photo-app/",
  cinema: "https://zzzlodeizlodeich81-coder.github.io/web-editor/",
};

async function pay(notes: number, kind: "deal" | "frame") {
  const res = await settleYard({ data: { notes, kind } });
  if (!res.ok) return res;
  if (res.local) {
    const game = useGame.getState();
    const you = game.players.find((p) => p.id === game.youId);
    if (!you || you.notes < notes) return { ok: false as const, error: `Нужно ${notes} нот.`, notes: you?.notes ?? 0 };
    game.spendNotes(game.youId, notes);
    return { ok: true as const, notes: you.notes - notes };
  }
  await refreshWallet();
  return res;
}

export function Yard() {
  const toStudio = useGame((s) => s.toStudio);
  const toLobby = useGame((s) => s.toLobby);
  const notes = useWallet((s) => s.notes);
  const vkId = useWallet((s) => s.vkId);
  const localNotes = useGame((s) => s.players.find((p) => p.id === s.youId)?.notes ?? 0);
  const shownNotes = vkId ? notes : localNotes;
  const [house, setHouse] = useState<HouseId | null>(null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [frames, setFrames] = useState(0);
  const [houseTake, setHouseTake] = useState(0);

  useEffect(() => {
    const saved = readRoles();
    setRoles(saved);
    setFrames(readFrames());
    setHouseTake(readHouseTake());
    if (!saved.length) setHouse("gate");
  }, []);

  function open(id: HouseId) {
    if (!roles.length && id !== "gate") {
      toast.message("Сначала у ворот: кто ты на этом дворе.");
      setHouse("gate");
      return;
    }
    setHouse(id);
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#24301c]">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full max-h-full w-full" style={{ aspectRatio: "16 / 9" }}>
          <img src="/yard.jpg" alt="Двор" className="h-full w-full object-contain" />
          {ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              aria-label={zone.label}
              className="absolute rounded-xl border border-transparent bg-transparent hover:border-white/70 hover:bg-white/10"
              style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
              onClick={() => open(zone.id)}
            />
          ))}
        </div>
      </div>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <p className="pointer-events-auto rounded-full bg-black/45 px-3 py-1 font-display text-sm text-white">Двор</p>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-sm text-white">
          <span className="tabular-nums">{frames} кадров</span>
          <span className="text-white/70">·</span>
          <NotesButton />
        </div>
      </div>
      {house && DOORS[house] ? (
        <div className="absolute inset-0 z-20 flex flex-col bg-black">
          <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.4rem,env(safe-area-inset-top))] pb-1">
            <button type="button" className="text-sm text-white" onClick={() => setHouse(null)}>
              На двор
            </button>
            <a className="text-sm text-white/80" href={DOORS[house]} target="_blank" rel="noreferrer">
              Открыть отдельно
            </a>
          </div>
          <iframe title={ZONES.find((z) => z.id === house)?.label} src={DOORS[house]} className="min-h-0 w-full flex-1 border-0 bg-white" />
        </div>
      ) : null}
      {house && !DOORS[house] ? (
        <HouseSheet
          house={house}
          roles={roles}
          frames={frames}
          houseTake={houseTake}
          notes={shownNotes}
          onClose={() => roles.length && setHouse(null)}
          onRoles={(next) => {
            setRoles(next);
            writeRoles(next);
            setHouse(null);
          }}
          onHouseTake={setHouseTake}
          onStage={() => {
            toLobby();
          }}
          onStudio={() => {
            toStudio();
          }}
        />
      ) : null}
    </div>
  );
}

function HouseSheet(props: {
  house: HouseId;
  roles: RoleId[];
  frames: number;
  houseTake: number;
  notes: number;
  onClose: () => void;
  onRoles: (ids: RoleId[]) => void;
  onHouseTake: (n: number) => void;
  onStage: () => void;
  onStudio: () => void;
}) {
  const title = ZONES.find((z) => z.id === props.house)?.label ?? "";
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[78%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-fg">{title}</h2>
          {props.roles.length ? (
            <Button variant="ghost" onClick={props.onClose}>
              На двор
            </Button>
          ) : null}
        </div>
        {props.house === "gate" ? <GateCard roles={props.roles} onSave={props.onRoles} /> : null}
        {props.house === "stage" ? (
          <p className="text-sm leading-relaxed text-muted">
            Стол и сцена. Балалайка выбирает, кто поёт. Песня из строк идёт плюсом — подпеваешь как дуэт.
            <Button className="mt-3 w-full rounded-xl" onClick={props.onStage}>
              Войти на сцену
            </Button>
          </p>
        ) : null}
        {props.house === "record" ? (
          <p className="text-sm leading-relaxed text-muted">
            Suno, минус, стемы, кавер своим голосом. Файлы сразу на телефон.
            <Button className="mt-3 w-full rounded-xl" onClick={props.onStudio}>
              В дом записи
            </Button>
          </p>
        ) : null}
        {props.house === "market" ? (
          <MarketCard
            roles={props.roles}
            houseTake={props.houseTake}
            onHouseTake={props.onHouseTake}
          />
        ) : null}
      </div>
    </div>
  );
}

function GateCard({ roles, onSave }: { roles: RoleId[]; onSave: (ids: RoleId[]) => void }) {
  const [picked, setPicked] = useState<RoleId[]>(roles);
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Кто ты на дворе. Можно несколько. По этим ролям тебя найдут в торговых рядах.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {ROLES.map((role) => {
          const on = picked.includes(role.id);
          return (
            <button
              key={role.id}
              type="button"
              className={`rounded-xl border px-3 py-2 text-left ${on ? "border-accent bg-accent text-accent-fg" : "border-border bg-surface text-fg"}`}
              onClick={() =>
                setPicked((cur) => (cur.includes(role.id) ? cur.filter((id) => id !== role.id) : [...cur, role.id]))
              }
            >
              <span className="block font-medium">{role.label}</span>
              <span className="text-sm opacity-80">{role.hint}</span>
            </button>
          );
        })}
      </div>
      <Button
        className="mt-3 w-full rounded-xl"
        disabled={!picked.length}
        onClick={() => onSave(picked)}
      >
        Записать в книгу у ворот
      </Button>
    </div>
  );
}

function MarketCard({
  roles,
  houseTake,
  onHouseTake,
}: {
  roles: RoleId[];
  houseTake: number;
  onHouseTake: (n: number) => void;
}) {
  const youName = useGame((s) => s.players.find((p) => p.id === s.youId)?.name || "Я");
  const [board, setBoard] = useState<Listing[]>(() => readBoard());
  const [service, setService] = useState("");
  const [price, setPrice] = useState(50);
  const [role, setRole] = useState<RoleId>(roles[0] ?? "artist");
  const [busy, setBusy] = useState<string | null>(null);

  function save(next: Listing[]) {
    setBoard(next);
    writeBoard(next);
  }

  return (
    <div className="text-sm text-muted">
      <p>
        Сделка целиком списывается с покупателя. Мастеру {""}
        девять частей, двору одна. Казне двора уже {houseTake} нот.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {board.map((row) => {
          const cut = splitDeal(row.price);
          const label = ROLES.find((r) => r.id === row.role)?.label ?? row.role;
          return (
            <div key={row.id} className="rounded-xl border border-border bg-surface px-3 py-2">
              <p className="font-medium text-fg">
                {row.name} · {label}
              </p>
              <p>{row.service}</p>
              <p className="mt-1 text-xs">
                {row.price} нот · мастеру {cut.seller} · двору {cut.house}
              </p>
              <Button
                variant="secondary"
                className="mt-2 rounded-xl"
                disabled={Boolean(busy) || row.mine}
                onClick={() => {
                  void (async () => {
                    setBusy(row.id);
                    try {
                      const paid = await pay(row.price, "deal");
                      if (!paid.ok) {
                        toast.error(paid.error);
                        useWallet.getState().setShop(true);
                        return;
                      }
                      onHouseTake(addHouseTake(cut.house));
                      toast.success(`${row.name} получил ${cut.seller} нот. Двору ${cut.house}.`);
                    } finally {
                      setBusy(null);
                    }
                  })();
                }}
              >
                {row.mine ? "Твоя карточка" : busy === row.id ? "Считаю…" : "Заказать"}
              </Button>
            </div>
          );
        })}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-fg">Своя карточка</p>
        <select
          className="rounded-md border border-border bg-surface-2 px-3 py-2 text-fg"
          value={role}
          onChange={(e) => setRole(e.target.value as RoleId)}
        >
          {ROLES.filter((r) => !roles.length || roles.includes(r.id)).map((r) => (
            <option key={r.id} value={r.id}>
              {r.label}
            </option>
          ))}
        </select>
        <Input placeholder="Что делаешь" value={service} onChange={(e) => setService(e.target.value)} />
        <Input type="number" value={price} onChange={(e) => setPrice(Number(e.target.value))} aria-label="Цена в нотах" />
        <Button
          className="rounded-xl"
          onClick={() => {
            const text = service.trim();
            if (!text) return;
            const row: Listing = {
              id: uid("card"),
              name: youName,
              role,
              service: text.slice(0, 80),
              price: Math.max(10, Math.round(price) || 10),
              mine: true,
            };
            save([row, ...board]);
            setService("");
            toast.success("Карточка висит в рядах.");
          }}
        >
          Повесить
        </Button>
      </div>
    </div>
  );
}

