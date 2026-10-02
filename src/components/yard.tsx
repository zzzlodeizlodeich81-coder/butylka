import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesButton } from "@/components/notes-shop";
import { FameCard, OrganCard, ReleaseCard, YardChat } from "@/components/yard-square";
import { Guide } from "@/components/guide";
import { HouseCard } from "@/components/house-card";
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

type HouseId = "stage" | "record" | "factory" | "frame" | "atelier" | "cinema" | "market" | "gate" | "organ";
type SpotId = "yard" | "sferoom" | "needle" | "yourtunes" | "kadr";

function MapStage({
  src,
  alt,
  top,
  children,
}: {
  src: string;
  alt: string;
  top: string;
  children: ReactNode;
}) {
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-center [container-type:size]"
      style={{ top }}
    >
      <div
        className="relative"
        style={{ aspectRatio: "16 / 9", width: "min(100cqw, calc(100cqh * 16 / 9))" }}
      >
        <img src={src} alt={alt} className="absolute inset-0 h-full w-full object-fill" />
        {children}
      </div>
    </div>
  );
}

const ZONES: { id: HouseId; label: string; left: string; top: string; width: string; height: string; sign: "top" | "bottom" }[] = [
  { id: "record", label: "Дом записи", left: "8%", top: "6%", width: "24%", height: "26%", sign: "bottom" },
  { id: "factory", label: "Фабрика звука", left: "33%", top: "2%", width: "24%", height: "28%", sign: "bottom" },
  { id: "frame", label: "Рама", left: "60%", top: "8%", width: "26%", height: "24%", sign: "bottom" },
  { id: "atelier", label: "Мастерская", left: "74%", top: "30%", width: "24%", height: "22%", sign: "bottom" },
  { id: "stage", label: "Сцена", left: "4%", top: "46%", width: "26%", height: "28%", sign: "bottom" },
  { id: "cinema", label: "Киностудия", left: "68%", top: "54%", width: "28%", height: "28%", sign: "top" },
  { id: "organ", label: "Шарманщик", left: "50%", top: "34%", width: "16%", height: "22%", sign: "bottom" },
  { id: "market", label: "Торговые ряды", left: "28%", top: "60%", width: "40%", height: "18%", sign: "top" },
  { id: "gate", label: "Ворота", left: "38%", top: "78%", width: "24%", height: "18%", sign: "top" },
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
  if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
  else await refreshWallet();
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
  const [city, setCity] = useState(false);
  const [spot, setSpot] = useState<SpotId | null>(null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [frames, setFrames] = useState(0);
  const [houseTake, setHouseTake] = useState(0);
  const [chat, setChat] = useState(false);
  const [fame, setFame] = useState(false);
  const [plot, setPlot] = useState(false);
  const [splash, setSplash] = useState(true);
  const [guide, setGuide] = useState(false);

  useEffect(() => {
    const saved = readRoles();
    setRoles(saved);
    setFrames(readFrames());
    setHouseTake(readHouseTake());
    if (!saved.length) setHouse("gate");
    try {
      if (!localStorage.getItem("kadr-guide")) setGuide(true);
    } catch {
      /* без памяти проводник просто молчит */
    }
  }, []);

  function open(id: HouseId) {
    if (!roles.length && id !== "gate") {
      toast.message("Сначала у ворот: кто ты на этом дворе.");
      setHouse("gate");
      return;
    }
    setHouse(id);
  }

  if (city) {
    return (
      <District
        spot={spot}
        onSpot={setSpot}
        onYard={() => {
          setSpot(null);
          setCity(false);
        }}
      />
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#24301c]">
      <MapStage src="/yard.jpg" alt="Двор" top="max(3.2rem, calc(env(safe-area-inset-top) + 2.6rem))">
          {ZONES.map((zone) => (
            <button
              key={zone.id}
              type="button"
              aria-label={zone.label}
              className="absolute rounded-xl border border-transparent hover:border-white/70 hover:bg-white/10"
              style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
              onClick={() => open(zone.id)}
            >
              <span
                className={`pointer-events-none absolute left-1/2 max-w-[92%] -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-center text-[11px] leading-tight font-medium text-[#f4e4c4] shadow ${zone.sign === "top" ? "top-0.5" : "bottom-0.5"}`}
              >
                {zone.label}
              </span>
            </button>
          ))}
      </MapStage>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex flex-wrap gap-2">
          <button
            type="button"
            className="rounded-full bg-black/45 px-3 py-1 font-display text-sm text-white"
            onClick={() => setCity(true)}
          >
            В город
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setChat(true)}>
            Чат
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setFame(true)}>
            Слава
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setPlot(true)}>
            Дом
          </button>
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-sm text-white">
          <span className="tabular-nums">{frames} кадров</span>
          <span className="text-white/70">·</span>
          <NotesButton />
        </div>
      </div>
      {chat ? <YardChat onClose={() => setChat(false)} /> : null}
      {fame ? <FameCard onClose={() => setFame(false)} /> : null}
      {plot ? <HouseCard onClose={() => setPlot(false)} /> : null}
      {splash ? (
        <button type="button" className="absolute inset-0 z-40 bg-black" onClick={() => setSplash(false)}>
          <img src="/xxv-kadr.jpg" alt="XXV Kadr" className="h-full w-full object-contain" />
        </button>
      ) : null}
      {!splash && guide ? (
        <Guide
          onDone={() => {
            try {
              localStorage.setItem("kadr-guide", "1");
            } catch {
              /* и так закроется */
            }
            setGuide(false);
          }}
        />
      ) : null}
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

const CITY: { id: SpotId; label: string; left: string; top: string; width: string; height: string }[] = [
  { id: "yard", label: "Наш двор", left: "3%", top: "54%", width: "27%", height: "38%" },
  { id: "sferoom", label: "Sferoom", left: "30%", top: "2%", width: "15%", height: "42%" },
  { id: "needle", label: "needle music", left: "46%", top: "6%", width: "14%", height: "42%" },
  { id: "yourtunes", label: "Yourtunes", left: "60%", top: "16%", width: "16%", height: "40%" },
  { id: "kadr", label: "XXV Kadr", left: "76%", top: "0%", width: "22%", height: "32%" },
];

function District({
  spot,
  onSpot,
  onYard,
}: {
  spot: SpotId | null;
  onSpot: (id: SpotId | null) => void;
  onYard: () => void;
}) {
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1c2430]">
      <MapStage src="/district.jpg" alt="Город" top="max(2.8rem, calc(env(safe-area-inset-top) + 2.2rem))">
          {CITY.map((zone) => (
            <button
              key={zone.id}
              type="button"
              aria-label={zone.label}
              className="absolute rounded-xl hover:bg-white/10"
              style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
              onClick={() => (zone.id === "yard" ? onYard() : onSpot(zone.id))}
            >
              <span className="pointer-events-none absolute bottom-0.5 left-1/2 max-w-[96%] -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-center text-[11px] leading-tight font-medium text-[#f4e4c4] shadow">
                {zone.label}
              </span>
            </button>
          ))}
      </MapStage>
      <div className="absolute top-0 left-0 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={onYard}>
          Во двор
        </button>
      </div>
      {spot === "kadr" ? <Manor onClose={() => onSpot(null)} /> : null}
      {spot && spot !== "kadr" ? <PromoSheet spot={spot} onClose={() => onSpot(null)} /> : null}
    </div>
  );
}

function PromoSheet({ spot, onClose }: { spot: SpotId; onClose: () => void }) {
  const title = CITY.find((z) => z.id === spot)?.label ?? "";
  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[70%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-fg">{title}</h2>
          <Button variant="ghost" onClick={onClose}>
            На карту
          </Button>
        </div>
        {spot === "sferoom" ? (
          <div className="flex flex-col gap-2 text-sm text-muted">
            <p>Публикация через Sferoom. Пока только промокоды, форма придёт позже.</p>
            <a className="text-fg underline" href="https://sferoom.space/" target="_blank" rel="noreferrer">
              sferoom.space
            </a>
            <CodeRow code="DJAngelA17" hint="DJ Angel A" />
            <CodeRow code="Sunrise17" hint="Лучик Солнца" />
            <CodeRow code="Severyanka17" hint="Снежинка Северянка" />
          </div>
        ) : null}
        {spot === "needle" ? (
          <div className="flex flex-col gap-2 text-sm text-muted">
            <p>Реферальная ссылка, 10% с публикации.</p>
            <a className="text-fg underline" href="https://lk.needlmusic.ru/referrals" target="_blank" rel="noreferrer">
              lk.needlmusic.ru/referrals
            </a>
            <CodeRow code="REF-9126-D78F6A" hint="твой код" />
          </div>
        ) : null}
        {spot === "yourtunes" ? (
          <div className="flex flex-col gap-2 text-sm text-muted">
            <p>Пока просто дверь на сайт. Промокод сюда ещё не клали.</p>
            <a className="text-fg underline" href="https://yourtunes.net/" target="_blank" rel="noreferrer">
              yourtunes.net
            </a>
          </div>
        ) : null}
      </div>
    </div>
  );
}

function Manor({ onClose }: { onClose: () => void }) {
  return (
    <div className="absolute inset-0 z-20 bg-black">
      <div className="absolute inset-0 flex items-center justify-center">
        <div className="relative h-full max-h-full w-full" style={{ aspectRatio: "16 / 9" }}>
          <img src="/manor.jpg" alt="" className="h-full w-full object-contain" />
          <img src="/manor.jpg" alt="" className="manor-ghost pointer-events-none absolute inset-0 h-full w-full object-contain" />
          <a
            href="https://vk.ru/club236941413"
            target="_blank"
            rel="noreferrer"
            aria-label="Стол, группа XXV Kadr"
            className="absolute rounded-xl hover:bg-white/10"
            style={{ left: "50%", top: "46%", width: "46%", height: "40%" }}
          >
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-[11px] font-medium text-[#f4e4c4]">
              Стол
            </span>
          </a>
        </div>
      </div>
      <button
        type="button"
        className="absolute top-0 left-0 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] text-sm text-white"
        onClick={onClose}
      >
        <span className="rounded-full bg-black/45 px-3 py-1">На карту</span>
      </button>
    </div>
  );
}

function CodeRow({ code, hint }: { code: string; hint: string }) {
  return (
    <button
      type="button"
      className="flex items-center justify-between gap-3 rounded-xl border border-border bg-surface px-3 py-2 text-left"
      onClick={() => {
        void navigator.clipboard.writeText(code).then(
          () => toast.success("Код скопирован"),
          () => toast.message(code),
        );
      }}
    >
      <span>
        <span className="block font-medium text-fg">{code}</span>
        <span className="text-xs text-muted">{hint}</span>
      </span>
      <span className="text-xs text-muted">копировать</span>
    </button>
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
        {props.house === "stage" ? <ReleaseCard onStage={props.onStage} /> : null}
        {props.house === "organ" ? <OrganCard /> : null}
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

