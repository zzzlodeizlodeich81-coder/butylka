import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesButton, PriceSheet } from "@/components/notes-shop";
import { FameCard, OrganCard, ReleaseCard, YardChat } from "@/components/yard-square";
import { Guide } from "@/components/guide";
import { HouseCard } from "@/components/house-card";
import { HostChat } from "@/components/host-chat";
import { HuntRoom } from "@/components/manor-rooms";
import { Atelier } from "@/components/atelier";
import { Matreshka } from "@/components/matreshka";
import { LandCard } from "@/components/land-card";
import { useStage } from "@/lib/stage";
import { yardBoard, type YardSpot } from "@/lib/yard-board";
import { useGame } from "@/lib/store";
import { useWallet } from "@/lib/wallet";
import {
  ROLES,
  STALL_RENT,
  readFrames,
  readHouseTake,
  readRoles,
  writeRoles,
  type RoleId,
} from "@/lib/yard";

type HouseId = "stage" | "record" | "factory" | "frame" | "atelier" | "cinema" | "market" | "gate" | "organ";
type SpotId = "yard" | "sferoom" | "needle" | "yourtunes" | "kadr";
type Layer = "world" | "city" | "yard";

const WORLD = [
  { id: "city", label: "Город", left: "2%", top: "22%", width: "50%", height: "62%" },
  { id: "buy", label: "Купить", left: "58%", top: "44%", width: "26%", height: "34%" },
];

const WORLD_PHONE = [
  { id: "city", label: "Город", left: "4%", top: "12%", width: "92%", height: "42%" },
  { id: "buy", label: "Купить", left: "14%", top: "58%", width: "72%", height: "22%" },
];

function MapStage({
  src,
  alt,
  top,
  aspect = "16 / 9",
  children,
}: {
  src: string;
  alt: string;
  top: string;
  aspect?: string;
  children: ReactNode;
}) {
  const [aw, ah] = aspect.split("/").map((part) => Number(part.trim()));
  const ratio = aw / ah || 16 / 9;
  return (
    <div
      className="absolute inset-x-0 bottom-0 flex items-center justify-center [container-type:size]"
      style={{ top }}
    >
      <div
        className="relative"
        style={{ aspectRatio: aspect, width: `min(100cqw, calc(100cqh * ${ratio}))` }}
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

const YARD_PHONE: typeof ZONES = [
  { id: "record", label: "Дом записи", left: "3%", top: "8%", width: "30%", height: "18%", sign: "bottom" },
  { id: "factory", label: "Фабрика звука", left: "34%", top: "4%", width: "34%", height: "20%", sign: "bottom" },
  { id: "frame", label: "Рама", left: "70%", top: "10%", width: "26%", height: "16%", sign: "bottom" },
  { id: "stage", label: "Сцена", left: "2%", top: "36%", width: "34%", height: "18%", sign: "bottom" },
  { id: "organ", label: "Шарманщик", left: "36%", top: "34%", width: "28%", height: "18%", sign: "bottom" },
  { id: "atelier", label: "Мастерская", left: "66%", top: "32%", width: "30%", height: "16%", sign: "bottom" },
  { id: "cinema", label: "Киностудия", left: "60%", top: "54%", width: "36%", height: "16%", sign: "bottom" },
  { id: "market", label: "Торговые ряды", left: "6%", top: "66%", width: "52%", height: "14%", sign: "top" },
  { id: "gate", label: "Ворота", left: "28%", top: "80%", width: "44%", height: "16%", sign: "top" },
];

const DOORS: Partial<Record<HouseId, string>> = {
  factory: "/doors/master.html",
  frame: "/doors/frame.html",
  cinema: "/doors/cinema.html",
};

export function Yard() {
  const toStudio = useGame((s) => s.toStudio);
  const toLobby = useGame((s) => s.toLobby);
  const notes = useWallet((s) => s.notes);
  const vkId = useWallet((s) => s.vkId);
  const localNotes = useGame((s) => s.players.find((p) => p.id === s.youId)?.notes ?? 0);
  const shownNotes = vkId ? notes : localNotes;
  const [house, setHouse] = useState<HouseId | null>(null);
  const [layer, setLayer] = useState<Layer>("world");
  const [spot, setSpot] = useState<SpotId | null>(null);
  const [roles, setRoles] = useState<RoleId[]>([]);
  const [frames, setFrames] = useState(0);
  const [houseTake, setHouseTake] = useState(0);
  const [chat, setChat] = useState(false);
  const [fame, setFame] = useState(false);
  const [plot, setPlot] = useState(false);
  const [radioOn, setRadioOn] = useState(false);
  const [radioOpen, setRadioOpen] = useState(false);
  const [price, setPrice] = useState(false);
  const [splash, setSplash] = useState(true);
  const stage = useStage();
  const yardMap = stage === "phone" ? { src: "/m/yard.jpg", aspect: "9 / 16", zones: YARD_PHONE } : { src: "/yard.jpg", aspect: "16 / 9", zones: ZONES };
  const [guide, setGuide] = useState(false);
  const [lands, setLands] = useState(false);
  const [faces, setFaces] = useState<YardSpot[]>([]);

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

  useEffect(() => {
    void yardBoard({ data: { action: "spot", tier: layer === "yard" ? house || "yard" : layer } });
  }, [house, layer]);

  useEffect(() => {
    let stop = false;
    const pull = () => {
      void yardBoard({ data: { action: "list" } }).then((res) => {
        if (!stop && res.ok) setFaces(res.spots || []);
      });
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, []);

  function open(id: HouseId) {
    if (!roles.length && id !== "gate") {
      toast.message("Сначала у ворот: кто ты на этом дворе.");
      setHouse("gate");
      return;
    }
    setHouse(id);
  }

  if (layer === "world") {
    return (
      <>
        <World onCity={() => setLayer("city")} onBuy={() => setLands(true)} />
        {lands ? <LandCard onClose={() => setLands(false)} /> : null}
        {splash ? (
          <button type="button" className="fixed inset-0 z-40 bg-black" onClick={() => setSplash(false)}>
            <img src="/xxv-kadr.jpg" alt="XXV Kadr" className="h-full w-full object-contain" />
          </button>
        ) : null}
      </>
    );
  }

  if (layer === "city") {
    return (
      <District
        spot={spot}
        onSpot={setSpot}
        onMap={() => setLayer("world")}
        onYard={() => {
          setSpot(null);
          setLayer("yard");
        }}
      />
    );
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#24301c]">
      <MapStage src={yardMap.src} alt="Двор" aspect={yardMap.aspect} top="max(2.6rem, calc(env(safe-area-inset-top) + 2.2rem))">
          {yardMap.zones.map((zone) => (
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
              {faces
                .filter((person) => person.spot === zone.id)
                .slice(0, 3)
                .map((person, index) => (
                  <span
                    key={person.id}
                    title={person.name}
                    className="pointer-events-none absolute top-0.5 flex size-6 items-center justify-center overflow-hidden rounded-full border border-white/80 bg-[#2a1a0c] text-xs"
                    style={{ left: `${2 + index * 18}px` }}
                  >
                    {person.photo ? <img src={person.photo} alt="" className="h-full w-full object-cover" /> : "🪆"}
                  </span>
                ))}
            </button>
          ))}
      </MapStage>
      <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex max-w-[62vw] flex-nowrap gap-2 overflow-x-auto">
          <button
            type="button"
            className="rounded-full bg-black/45 px-3 py-1 font-display text-sm text-white"
            onClick={() => setLayer("city")}
          >
            В город
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setChat(true)}>
            Чат
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setLands(true)}>
            Карта
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setFame(true)}>
            Слава
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setPlot(true)}>
            Дом
          </button>
          <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setPrice(true)}>
            Прайс
          </button>
          <button
            type="button"
            className="rounded-full bg-black/45 px-3 py-1 text-sm text-white"
            onClick={() => {
              setRadioOn(true);
              setRadioOpen(true);
            }}
          >
            Радио
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
      {lands ? <LandCard onClose={() => setLands(false)} /> : null}
      {plot ? <HouseCard onClose={() => setPlot(false)} /> : null}
      {price ? <PriceSheet onClose={() => setPrice(false)} /> : null}
      {radioOn ? <Matreshka open={radioOpen} onClose={() => setRadioOpen(false)} /> : null}
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
      {house === "atelier" ? <Atelier onClose={() => setHouse(null)} /> : null}
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

const CITY_PHONE: typeof CITY = [
  { id: "kadr", label: "XXV Kadr", left: "48%", top: "2%", width: "48%", height: "22%" },
  { id: "sferoom", label: "Sferoom", left: "4%", top: "28%", width: "30%", height: "22%" },
  { id: "needle", label: "needle music", left: "34%", top: "26%", width: "30%", height: "24%" },
  { id: "yourtunes", label: "Yourtunes", left: "66%", top: "30%", width: "30%", height: "22%" },
  { id: "yard", label: "Наш двор", left: "10%", top: "64%", width: "80%", height: "30%" },
];

const HECKLER = [
  "Вы все говно.",
  "Вашу музыку никто не слушает.",
  "Ты бездарность.",
  "Брось писать стихи, это не твоё.",
  "Пошлятина!",
  "Вы ничего не понимаете в искусстве.",
  "Кто это назвал песней?",
  "Слух оставь там, где нашёл.",
  "Опять этот двор. Уши вянут.",
  "Талант кончился на первой строчке.",
  "Иди мимо. И молча.",
  "Даже ворона поёт честнее.",
];

function Heckler({ phone }: { phone: boolean }) {
  const [line, setLine] = useState("");
  const last = useRef(0);
  function poke() {
    const now = Date.now();
    if (now - last.current < 350) return;
    last.current = now;
    setLine((prev) => {
      const pool = HECKLER.filter((row) => row !== prev);
      return pool[Math.floor(Math.random() * pool.length)] || prev;
    });
  }
  return (
    <button
      type="button"
      aria-label="Злой прохожий"
      className="absolute z-20"
      style={phone ? { left: "72%", top: "70%", width: "22%" } : { left: "30%", top: "68%", width: "7%" }}
      onMouseEnter={poke}
      onPointerDown={poke}
    >
      <img src="/heckler.png" alt="" className="pointer-events-none h-auto w-full" />
      {line ? (
        <span className="pointer-events-none absolute bottom-full left-1/2 z-30 mb-1 w-max max-w-[11rem] -translate-x-1/2 rounded bg-[#1a100c]/92 px-2 py-1 text-left text-[11px] leading-snug text-[#f4e4c4]">
          {line}
        </span>
      ) : null}
    </button>
  );
}

function World({ onCity, onBuy }: { onCity: () => void; onBuy: () => void }) {
  const stage = useStage();
  const map = stage === "phone" ? { src: "/m/world.jpg", aspect: "9 / 16", zones: WORLD_PHONE } : { src: "/world.jpg", aspect: "16 / 9", zones: WORLD };
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1c2830]">
      <MapStage src={map.src} alt="Большая карта" aspect={map.aspect} top="max(2.6rem, calc(env(safe-area-inset-top) + 2.2rem))">
        {map.zones.map((zone) => (
          <button
            key={zone.id}
            type="button"
            aria-label={zone.label}
            className="absolute rounded-xl hover:bg-white/10"
            style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
            onClick={() => (zone.id === "buy" ? onBuy() : onCity())}
          >
            <span
              className={`pointer-events-none absolute left-1/2 -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-2 py-0.5 text-[12px] font-medium text-[#f4e4c4] shadow ${zone.id === "city" ? "top-2" : "bottom-1"}`}
            >
              {zone.label}
            </span>
          </button>
        ))}
        <Heckler phone={stage === "phone"} />
      </MapStage>
    </div>
  );
}

function District({
  spot,
  onSpot,
  onMap,
  onYard,
}: {
  spot: SpotId | null;
  onSpot: (id: SpotId | null) => void;
  onMap: () => void;
  onYard: () => void;
}) {
  const stage = useStage();
  const cityMap = stage === "phone" ? { src: "/m/district.jpg", aspect: "9 / 16", zones: CITY_PHONE } : { src: "/district.jpg", aspect: "16 / 9", zones: CITY };
  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#1c2430]">
      <MapStage src={cityMap.src} alt="Город" aspect={cityMap.aspect} top="max(2.6rem, calc(env(safe-area-inset-top) + 2.2rem))">
          {cityMap.zones.map((zone) => (
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
        <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={onMap}>
          На карту
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
  const [room, setRoom] = useState<"hunt" | "host" | null>(null);
  const [price, setPrice] = useState(false);
  const phone = useStage() === "phone";
  if (room === "hunt") return <HuntRoom onClose={() => setRoom(null)} />;
  const spots = phone
    ? { host: { left: "18%", top: "56%" }, table: { left: "55%", top: "40%", width: "40%", height: "14%" }, pantry: { left: "4%", top: "62%" } }
    : { host: { left: "18%", top: "58%" }, table: { left: "50%", top: "46%", width: "46%", height: "40%" }, pantry: { left: "8%", top: "72%" } };
  return (
    <div className="absolute inset-0 z-20 bg-black">
      <div className="absolute inset-0 flex items-center justify-center [container-type:size]">
        <div
          className="relative"
          style={{
            aspectRatio: phone ? "9 / 16" : "16 / 9",
            width: phone ? "min(100cqw, calc(100cqh * 9 / 16))" : "min(100cqw, calc(100cqh * 16 / 9))",
          }}
        >
          <img src={phone ? "/m/manor.jpg" : "/manor.jpg"} alt="" className="absolute inset-0 h-full w-full object-fill" />
          {phone ? null : (
            <img src="/manor.jpg" alt="" className="manor-ghost pointer-events-none absolute inset-0 h-full w-full object-contain" />
          )}
          <button
            type="button"
            className="absolute rounded-full bg-black/55 px-3 py-1 text-[11px] text-[#f4e4c4]"
            style={spots.host}
            onClick={() => setRoom("host")}
          >
            Хозяин
          </button>
          <a
            href="https://vk.ru/club236941413"
            target="_blank"
            rel="noreferrer"
            aria-label="Стол, группа XXV Kadr"
            className="absolute rounded-xl hover:bg-white/10"
            style={spots.table}
          >
            <span className="pointer-events-none absolute bottom-1 left-1/2 -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-[11px] font-medium text-[#f4e4c4]">
              Стол
            </span>
          </a>
          <button
            type="button"
            className="absolute rounded-full bg-black/55 px-3 py-1 text-[11px] text-[#f4e4c4]"
            style={spots.pantry}
            onClick={() => setRoom("hunt")}
          >
            Кладовая
          </button>
        </div>
      </div>
      <div className="absolute top-0 left-0 flex gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))] text-sm text-white">
        <button type="button" onClick={onClose}>
          <span className="rounded-full bg-black/45 px-3 py-1">На карту</span>
        </button>
        <button type="button" onClick={() => setPrice(true)}>
          <span className="rounded-full bg-black/45 px-3 py-1">Прайс</span>
        </button>
      </div>
      {room === "host" ? <HostChat onClose={() => setRoom(null)} /> : null}
      {price ? <PriceSheet onClose={() => setPrice(false)} /> : null}
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
        {props.house === "market" ? <MarketCard /> : null}
      </div>
    </div>
  );
}

function GateCard({ roles, onSave }: { roles: RoleId[]; onSave: (ids: RoleId[]) => void }) {
  const [picked, setPicked] = useState<RoleId[]>(roles);
  return (
    <div>
      <p className="text-sm leading-relaxed text-muted">
        Кто ты на дворе. Можно несколько. Прохожий просто заходит на рынок и не селится. Остальные роли — если живёшь и работаешь здесь.
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

function MarketCard() {
  const [stalls, setStalls] = useState<{ id: string; name: string; about: string; url: string; until: number; mine: boolean }[]>([]);
  const [about, setAbout] = useState("");
  const [link, setLink] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await yardBoard({ data: { action: "stalls" } });
    if (res.ok && res.stalls) setStalls(res.stalls);
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="text-sm text-muted">
      <p>
        Место в рядах на месяц — {STALL_RENT} нот, это около 200 ₽. 10 нот = 7 ₽. Напиши, что делаешь, и вставь ссылку на свою страницу ВК.
      </p>
      <div className="mt-3 flex flex-col gap-2">
        {stalls.length ? (
          stalls.map((row) => (
            <div key={row.id} className="rounded-xl border border-border bg-surface px-3 py-2">
              <p className="font-medium text-fg">
                {row.name}
                {row.mine ? " · твоё" : ""}
              </p>
              <p>{row.about}</p>
              <p className="mt-1 text-xs">до {new Date(row.until).toLocaleDateString("ru-RU")}</p>
              <a className="mt-2 inline-flex rounded-xl bg-surface-2 px-3 py-2 text-fg" href={row.url} target="_blank" rel="noreferrer">
                Страница ВК
              </a>
            </div>
          ))
        ) : (
          <p>Ряды пустые. Первое место ещё никто не снял.</p>
        )}
      </div>
      <div className="mt-4 flex flex-col gap-2">
        <p className="text-fg">Снять место</p>
        <Input placeholder="Что делаешь" value={about} onChange={(e) => setAbout(e.target.value)} />
        <Input placeholder="vk.com/твоя_страница" value={link} onChange={(e) => setLink(e.target.value)} />
        <Button
          className="rounded-xl"
          disabled={busy}
          onClick={() => {
            void (async () => {
              setBusy(true);
              try {
                const res = await yardBoard({ data: { action: "rent", text: about, url: link } });
                if (!res.ok) {
                  toast.error(res.error || "Не вышло.");
                  if (res.error?.includes("нот")) useWallet.getState().setShop(true);
                  return;
                }
                if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
                if (res.stalls) setStalls(res.stalls);
                setAbout("");
                setLink("");
                toast.success("Место твое на месяц.");
              } finally {
                setBusy(false);
              }
            })();
          }}
        >
          {busy ? "Считаю…" : `Арендовать · ${STALL_RENT} нот`}
        </Button>
      </div>
    </div>
  );
}

