import { useEffect, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesButton, PriceSheet } from "@/components/notes-shop";
import { FameCard, OrganCard, PresaveSheet, ReleaseCard, YardChat } from "@/components/yard-square";
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
import { PLOT_LABEL, TOOLS, type PlotKind } from "@/lib/lands";
import { landDesk } from "@/lib/land-desk";
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
  const [field, setField] = useState(false);
  const [faces, setFaces] = useState<YardSpot[]>([]);
  const [lock, setLock] = useState<{ id: string; name: string; kind: PlotKind; tools: string[]; owner: boolean; member: boolean } | null>(null);
  const [ask, setAsk] = useState<(typeof TOOLS)[number] | null>(null);
  const [pingYard, setPingYard] = useState(false);
  const [pingPeople, setPingPeople] = useState<string[]>([]);
  const [chatWho, setChatWho] = useState("");
  const [myId, setMyId] = useState("");
  const myIdRef = useRef("");

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
    const tier = layer === "yard" ? house || "yard" : layer;
    const plot = lock?.id || "";
    const ping = () => {
      void yardBoard({ data: { action: "spot", tier, plot } });
    };
    ping();
    const timer = window.setInterval(ping, 20000);
    return () => window.clearInterval(timer);
  }, [house, layer, lock?.id]);

  useEffect(() => {
    let stop = false;
    const pull = () => {
      void yardBoard({ data: { action: "list", plot: lock?.id || "" } }).then((res) => {
        if (!stop && res.ok) {
          setFaces(res.spots || []);
          const last = (res.chat || [])[(res.chat || []).length - 1];
          let seen = "";
          try {
            seen = localStorage.getItem("kadr-seen-yard") || "";
          } catch {
            seen = "";
          }
          if (last && !seen) {
            try {
              localStorage.setItem("kadr-seen-yard", last.id);
            } catch {
              /* уже показано */
            }
          } else if (last && last.id !== seen && last.who !== myIdRef.current) {
            setPingYard(true);
          }
        }
      });
      void fetch("/api/door", {
        method: "POST",
        headers: { "content-type": "application/json" },
        credentials: "same-origin",
        body: JSON.stringify({ action: "inbox" }),
      })
        .then((res) => res.json())
        .then((row: { ok?: boolean; me?: string; from?: string[] }) => {
          if (stop || !row.ok) return;
          if (row.me) {
            myIdRef.current = row.me;
            setMyId(row.me);
          }
          setPingPeople(row.from || []);
        })
        .catch(() => undefined);
    };
    pull();
    const timer = window.setInterval(pull, 8000);
    return () => {
      stop = true;
      window.clearInterval(timer);
    };
  }, [lock?.id]);

  function open(id: HouseId) {
    if (lock && (id === "organ" || id === "market")) {
      toast.message("Шарманщик и рынок только на общем дворе.");
      return;
    }
    const tool = TOOLS.find((item) => item.id === id);
    if (lock && tool && !lock.tools.includes(tool.id)) {
      setAsk(tool);
      return;
    }
    if (!roles.length && id !== "gate") {
      toast.message("Сначала у ворот: кто ты на этом дворе.");
      setHouse("gate");
      return;
    }
    setHouse(id);
  }

  function enterPlot(plot: { id: string; name: string; kind: PlotKind; tools: string[]; owner: boolean; member?: boolean }) {
    setLock({ id: plot.id, name: plot.name, kind: plot.kind, tools: plot.tools || [], owner: plot.owner, member: Boolean(plot.owner || plot.member) });
    setAsk(null);
    setHouse(null);
    setSpot(null);
    setLands(false);
    setLayer("yard");
  }

  const menuItems = [
    { label: "Карта", onClick: () => setLands(true) },
    { label: "Слава", onClick: () => setFame(true) },
    { label: "Дом", onClick: () => setPlot(true) },
    { label: "Прайс", onClick: () => setPrice(true) },
    { label: "Радио", onClick: () => { setRadioOn(true); setRadioOpen(true); } },
  ];
  const desk = (
    <>
      {field ? <PresaveSheet onClose={() => setField(false)} /> : null}
      {fame ? <FameCard onClose={() => setFame(false)} /> : null}
      {lands ? <LandCard onClose={() => setLands(false)} onEnter={enterPlot} /> : null}
      {plot ? <HouseCard onClose={() => setPlot(false)} /> : null}
      {price ? <PriceSheet onClose={() => setPrice(false)} /> : null}
      {radioOn ? <Matreshka open={radioOpen} onClose={() => setRadioOpen(false)} /> : null}
    </>
  );

  if (layer === "world") {
    return (
      <>
        <World
          onCity={() => setLayer("city")}
          onHome={() => {
            setLock(null);
            setSpot(null);
            setLayer("yard");
          }}
          onEnter={enterPlot}
          onBuy={() => setLands(true)}
          onField={() => setField(true)}
          menu={menuItems}
        />
        {desk}
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
      <>
        <District
          spot={spot}
          menu={menuItems}
          onSpot={setSpot}
          onMap={() => setLayer("world")}
          onYard={() => {
            setSpot(null);
            setLayer("yard");
          }}
        />
        {desk}
      </>
    );
  }
  const here =
    layer === "yard"
      ? faces.filter((person) => person.spot === "yard" || ZONES.some((zone) => zone.id === person.spot))
      : [];

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#24301c]">
      <MapStage src={yardMap.src} alt="Двор" aspect={yardMap.aspect} top="max(2.6rem, calc(env(safe-area-inset-top) + 2.2rem))">
          {yardMap.zones.map((zone) => {
            const tool = TOOLS.find((item) => item.id === zone.id);
            const closed = Boolean(lock && tool && !lock.tools.includes(tool.id));
            return (
            <button
              key={zone.id}
              type="button"
              aria-label={zone.label}
              className={`absolute rounded-xl border ${closed ? "border-white/30 bg-black/45" : "border-transparent hover:border-white/70 hover:bg-white/10"}`}
              style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
              onClick={() => open(zone.id)}
            >
              <span
                className={`pointer-events-none absolute left-1/2 max-w-[92%] -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-center text-[11px] leading-tight font-medium text-[#f4e4c4] shadow ${zone.sign === "top" ? "top-0.5" : "bottom-0.5"}`}
              >
                {closed ? `закрыто · ${tool?.price}` : zone.label}
              </span>
              {faces
                .filter((person) => person.spot === zone.id)
                .slice(0, 4)
                .map((person, index) => (
                  <span
                    key={person.id}
                    title={`${person.name}. Написать`}
                    className={`pointer-events-auto absolute top-0 z-10 flex items-center justify-center overflow-hidden rounded-full border-2 border-white bg-[#2a1a0c] text-base ${stage === "phone" ? "size-9" : "size-12"}`}
                    style={{ left: `${index * (stage === "phone" ? 26 : 42)}px` }}
                    onPointerDown={(event) => event.stopPropagation()}
                    onClick={(event) => {
                      event.stopPropagation();
                      setChatWho(person.id);
                      setChat(true);
                    }}
                  >
                    {person.photo ? <img src={person.photo} alt="" className="h-full w-full object-cover" /> : "🪆"}
                  </span>
                ))}
            </button>
            );
          })}
      </MapStage>
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-w-0 flex-1 items-start gap-2">
          <div className="flex flex-nowrap gap-2 overflow-x-auto">
            <button
              type="button"
              className="shrink-0 rounded-full bg-black/45 px-3 py-1 font-display text-sm text-white"
              onClick={() => setLayer("city")}
            >
              В город
            </button>
            <button
              type="button"
              className={`shrink-0 rounded-full px-3 py-1 text-sm text-white ${pingYard || pingPeople.length ? "kadr-blink" : "bg-black/45"}`}
              onClick={() => {
                setChatWho("");
                setChat(true);
              }}
            >
              Чат
            </button>
            <button type="button" className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setLands(true)}>
              Карта
            </button>
            <button type="button" className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setFame(true)}>
              Слава
            </button>
            <button type="button" className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setPlot(true)}>
              Дом
            </button>
            <button type="button" className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setPrice(true)}>
              Прайс
            </button>
            <button
              type="button"
              className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white"
              onClick={() => {
                setRadioOn(true);
                setRadioOpen(true);
              }}
            >
              Радио
            </button>
          </div>
          <MoreMenu items={menuItems} />
        </div>
        <div className="pointer-events-auto flex items-center gap-2 rounded-full bg-black/45 px-3 py-1 text-sm text-white">
          <span className="tabular-nums">{frames} кадров</span>
          <span className="text-white/70">·</span>
          <NotesButton />
        </div>
      </div>
      {layer === "yard" ? (
        <div
          className="pointer-events-none absolute inset-x-0 z-20 flex items-center gap-2 px-3"
          style={{ top: "max(3.15rem, calc(env(safe-area-inset-top) + 2.75rem))" }}
        >
          <span className="shrink-0 rounded-full bg-black/60 px-2 py-0.5 text-xs text-white">Во дворе {here.length}</span>
          <div className="pointer-events-auto flex min-w-0 gap-1 overflow-x-auto">
            {here.map((person) => (
              <button
                key={person.id}
                type="button"
                className="flex shrink-0 items-center gap-1 rounded-full bg-black/60 py-0.5 pr-2 pl-0.5 text-xs text-white"
                onClick={() => {
                  if (person.id === myId) return;
                  setChatWho(person.id);
                  setChat(true);
                }}
              >
                {person.photo ? <img src={person.photo} alt="" className="size-5 rounded-full object-cover" /> : <span>🪆</span>}
                {person.name}
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {!chat && (pingYard || pingPeople.length) ? (
        <button
          type="button"
          className="kadr-blink absolute top-14 left-1/2 z-30 -translate-x-1/2 rounded-full px-3 py-1 text-sm"
          onClick={() => setChat(true)}
        >
          {pingPeople.length ? "Тебе написали" : "Новая реплика на дворе"}
        </button>
      ) : null}
      {lock ? (
        <div className="absolute top-14 left-3 z-20 max-w-[70vw] rounded-2xl bg-black/70 px-3 py-2 text-sm text-white">
          <p>
            {lock.owner ? "Твой двор" : lock.member ? "Ты здесь живёшь" : "Гость"} · {lock.name}
          </p>
          <button type="button" className="mt-1 text-xs text-white/80" onClick={() => setLock(null)}>
            Общий двор
          </button>
        </div>
      ) : null}
      {ask ? (
        <div className="absolute inset-x-4 bottom-24 z-30 rounded-2xl bg-[#1a120c] p-4 text-[#f4e4c4]">
          <p className="font-medium">
            {ask.title} · {ask.price} нот
          </p>
          <p className="mt-1 text-sm text-[#f4e4c4]/80">
            {lock?.owner ? "Поставить этот дом на своём участке?" : "Хозяин участка ещё не поставил этот дом."}
          </p>
          <div className="mt-3 flex gap-2">
            {lock?.owner ? (
              <Button
                onClick={() => {
                  void (async () => {
                    const res = await landDesk({ data: { action: "tool", tool: ask.id } });
                    if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
                    if (!res.ok) {
                      toast.error(res.error || "Не купилось.");
                      return;
                    }
                    setLock((prev) => (prev ? { ...prev, tools: [...prev.tools, ask.id] } : prev));
                    setAsk(null);
                    toast.success("Дом стоит.");
                  })();
                }}
              >
                Купить
              </Button>
            ) : null}
            <Button variant="ghost" onClick={() => setAsk(null)}>
              Не сейчас
            </Button>
          </div>
        </div>
      ) : null}
      {chat ? (
        <YardChat
          onClose={() => {
            setChat(false);
            setChatWho("");
          }}
          focusId={chatWho}
          pingYard={pingYard}
          pingPeople={pingPeople}
          myId={myId}
          onSeenYard={(id) => {
            try {
              localStorage.setItem("kadr-seen-yard", id);
            } catch {
              /* и так прочитано */
            }
            setPingYard(false);
          }}
          onOpenPerson={(id) => setPingPeople((list) => list.filter((item) => item !== id))}
          plot={lock?.id || ""}
        />
      ) : null}
      {desk}
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
        <div className="absolute inset-0 z-40 flex flex-col bg-black">
          <div className="flex items-center justify-between gap-3 bg-black px-3 pt-[max(0.55rem,env(safe-area-inset-top))] pb-2">
            <button type="button" className="rounded-full bg-white px-3 py-1 text-sm font-medium text-black" onClick={() => setHouse(null)}>
              На двор
            </button>
            <a className="rounded-full bg-white/15 px-3 py-1 text-sm text-white" href={DOORS[house]} target="_blank" rel="noreferrer">
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
          plotId={lock?.id || ""}
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

function Heckler({ phone, side }: { phone: boolean; side?: boolean }) {
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
      style={side ? { right: "4%", top: "58%", width: phone ? "18%" : "8%" } : phone ? { left: "72%", top: "70%", width: "22%" } : { left: "30%", top: "68%", width: "7%" }}
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

function MoreMenu({ items }: { items: { label: string; onClick: () => void }[] }) {
  const [open, setOpen] = useState(false);
  const [at, setAt] = useState({ top: 0, left: 0 });
  const buttonRef = useRef<HTMLButtonElement>(null);
  const admin = useWallet((s) => s.admin);
  const rows = [
    ...items,
    {
      label: admin ? "Админка" : "Касса",
      onClick: () => {
        if (admin) window.dispatchEvent(new Event("kadr-desk"));
        else useWallet.getState().setShop(true);
      },
    },
    { label: "Выйти", onClick: () => window.dispatchEvent(new Event("kadr-leave")) },
  ];
  return (
    <div>
      <button
        ref={buttonRef}
        type="button"
        className="rounded-full bg-black/45 px-3 py-1 text-sm text-white"
        onClick={() => {
          const box = buttonRef.current?.getBoundingClientRect();
          if (box) setAt({ top: box.bottom + 6, left: Math.max(8, Math.min(box.left, window.innerWidth - 168)) });
          setOpen((v) => !v);
        }}
      >
        Ещё
      </button>
      {open ? (
        <div className="fixed z-[80] flex min-w-40 flex-col overflow-hidden rounded-2xl bg-[#1a120c] py-1 text-left text-sm text-[#f4e4c4] shadow-lg" style={{ top: at.top, left: at.left }}>
          {rows.map((row) => (
            <button
              key={row.label}
              type="button"
              className="px-3 py-2 text-left hover:bg-white/10"
              onClick={() => {
                setOpen(false);
                row.onClick();
              }}
            >
              {row.label}
            </button>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function World({
  onCity,
  onHome,
  onEnter,
  onBuy,
  onField,
  menu,
}: {
  onCity: () => void;
  onHome: () => void;
  onEnter: (plot: { id: string; name: string; kind: PlotKind; tools: string[]; owner: boolean; member?: boolean }) => void;
  onBuy: () => void;
  onField: () => void;
  menu: { label: string; onClick: () => void }[];
}) {
  const [rows, setRows] = useState<{ id: string; name: string; kind: PlotKind; tools: string[]; owner: boolean; member?: boolean; badge?: string; stateCode?: string; liege?: string }[]>([]);
  const [code, setCode] = useState("");
  useEffect(() => {
    void landDesk({ data: { action: "look" } }).then((res) => {
      if (res.ok) setRows((res.plots as typeof rows) || []);
    });
  }, []);
  const stage = useStage();
  const mine = rows.find((row) => row.owner);
  const board = useRef<HTMLDivElement>(null);
  const drag = useRef<{ x: number; y: number; px: number; py: number } | null>(null);
  const [pan, setPan] = useState({ x: -40, y: -30 });
  const spots = [
    { left: "14%", top: "46%" },
    { left: "33%", top: "24%" },
    { left: "61%", top: "30%" },
    { left: "82%", top: "42%" },
    { left: "24%", top: "70%" },
    { left: "48%", top: "58%" },
    { left: "74%", top: "68%" },
    { left: "18%", top: "84%" },
    { left: "44%", top: "82%" },
    { left: "68%", top: "86%" },
    { left: "88%", top: "74%" },
    { left: "52%", top: "18%" },
  ];

  function clamp(x: number, y: number) {
    const frame = board.current?.parentElement;
    if (!frame) return { x, y };
    return {
      x: Math.min(40, Math.max(frame.clientWidth - frame.clientWidth * 1.85, x)),
      y: Math.min(20, Math.max(frame.clientHeight - frame.clientHeight * 1.7, y)),
    };
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#6a341c]">
      <div
        className="absolute inset-0 z-10 cursor-grab touch-none active:cursor-grabbing"
        onPointerDown={(event) => {
          if ((event.target as HTMLElement).closest("button")) return;
          drag.current = { x: event.clientX, y: event.clientY, px: pan.x, py: pan.y };
          event.currentTarget.setPointerCapture(event.pointerId);
        }}
        onPointerMove={(event) => {
          if (!drag.current) return;
          setPan(clamp(drag.current.px + event.clientX - drag.current.x, drag.current.py + event.clientY - drag.current.y));
        }}
        onPointerUp={() => {
          drag.current = null;
        }}
        onPointerCancel={() => {
          drag.current = null;
        }}
      >
        <div ref={board} className="absolute h-[170%] w-[185%]" style={{ transform: `translate(${pan.x}px, ${pan.y}px)` }}>
          <img src="/world.jpg" alt="" className="absolute inset-0 h-full w-full object-cover" />
          <button
            type="button"
            className="absolute max-w-[11rem] rounded-xl bg-[#1a120c]/90 px-2 py-1 text-left text-[#f4e4c4] shadow"
            style={{ left: "8%", top: "40%" }}
            onClick={onHome}
          >
            <span className="block text-[12px] font-medium leading-tight">XXV Kadr & HoldingMusic матрёшка</span>
            <span className="text-[10px] text-[#c4a574]">государство</span>
          </button>
          {[
            { left: "70%", top: "22%" },
            { left: "40%", top: "72%" },
          ].map((spot) => (
            <button
              key={spot.left}
              type="button"
              className="absolute rounded-xl bg-white/90 px-2 py-1 text-left text-[#1a120c] shadow"
              style={spot}
              onClick={onBuy}
            >
              <span className="block text-[12px] font-medium">продаётся</span>
              <span className="text-[10px]">участок и дома</span>
            </button>
          ))}
          {rows.map((plot, index) => (
            <button
              key={plot.id}
              type="button"
              className="absolute max-w-[9rem] rounded-xl bg-black/75 px-2 py-1 text-left text-[#f4e4c4] shadow"
              style={spots[index % spots.length]}
              onClick={() => onEnter(plot)}
            >
              <span className="block truncate text-[12px] font-medium">{plot.name}</span>
              <span className="text-[10px] text-[#c4a574]">{plot.badge || (plot.kind === "commune" ? "сообщество" : "частный двор")}</span>
            </button>
          ))}
          <Heckler phone={stage === "phone"} side />
        </div>
      </div>
      <div className="pointer-events-none absolute top-[max(4.6rem,calc(env(safe-area-inset-top)+4.2rem))] left-3 z-20 max-w-[16rem] rounded-xl bg-black/55 px-3 py-2 text-[#f4e4c4]">
        <p className="text-sm">карта музыкального мира</p>
        <p className="text-lg leading-none">😏</p>
        <p className="text-xs">а вы думали вы на земле? как бы не так!</p>
      </div>
      <div className="absolute top-0 left-0 z-30 flex flex-wrap gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={onField}>
          Посеять пресейв
        </button>
        <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={onCity}>
          Город
        </button>
        <button type="button" className="rounded-full bg-white px-3 py-1 text-sm text-black" onClick={onBuy}>
          Купить участок
        </button>
        <MoreMenu items={menu} />
      </div>
      {!mine ? null : !mine.liege && mine.badge !== "государство" ? (
        <form
          className="absolute bottom-3 left-3 z-30 flex max-w-[16rem] flex-col gap-1 rounded-2xl bg-black/70 p-2"
          onSubmit={(event) => {
            event.preventDefault();
            void landDesk({ data: { action: "swear", code } }).then((res) => {
              if (!res.ok) {
                toast.error(res.error || "Не примкнул.");
                return;
              }
              setCode("");
              toast.success("Примкнул.");
              setRows((list) => list.map((row) => (row.owner ? { ...row, liege: "1", badge: row.kind === "commune" ? "государство" : row.badge } : row)));
            });
          }}
        >
          <p className="text-xs text-[#f4e4c4]">
            {mine.kind === "commune"
              ? "Сообщество пристаёт только к государству."
              : "Частный двор может примкнуть к одному сообществу или государству."}
            {mine.stateCode ? ` Код твоего государства: ${mine.stateCode}` : ""}
          </p>
          <div className="flex gap-1">
            <input
              className="min-w-0 flex-1 rounded-lg bg-white/90 px-2 py-1 text-xs"
              placeholder="Код"
              value={code}
              onChange={(event) => setCode(event.target.value)}
            />
            <button type="submit" className="rounded-lg bg-white px-2 text-xs text-black">
              Примкнуть
            </button>
          </div>
        </form>
      ) : null}
    </div>
  );
}

function District({
  spot,
  onSpot,
  onMap,
  onYard,
  menu,
}: {
  spot: SpotId | null;
  onSpot: (id: SpotId | null) => void;
  onMap: () => void;
  onYard: () => void;
  menu: { label: string; onClick: () => void }[];
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
      <div className="absolute top-0 left-0 z-30 flex gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={onMap}>
          На карту
        </button>
        <MoreMenu items={menu} />
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
  plotId?: string;
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
        {props.house === "gate" ? <GateCard roles={props.roles} onSave={props.onRoles} plotId={props.plotId || ""} /> : null}
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

function GateCard({ roles, onSave, plotId }: { roles: RoleId[]; onSave: (ids: RoleId[]) => void; plotId: string }) {
  const [picked, setPicked] = useState<RoleId[]>(roles);
  const [people, setPeople] = useState<{ id: string; name: string; owner: boolean }[]>([]);
  const [code, setCode] = useState("");
  const [yardName, setYardName] = useState("");
  const [owner, setOwner] = useState(false);
  const me = useWallet((s) => s.vkId);
  const listed = people.some((person) => person.id === me);

  useEffect(() => {
    if (!plotId) return;
    void landDesk({ data: { action: "roster", plot: plotId } }).then((res) => {
      if (!res.ok) return;
      const row = res as { people?: { id: string; name: string; owner: boolean }[]; code?: string; name?: string; owner?: boolean };
      setPeople(row.people || []);
      setCode(row.code || "");
      setYardName(row.name || "");
      setOwner(Boolean(row.owner));
    });
  }, [plotId]);

  return (
    <div>
      {plotId ? (
        <div className="mb-4">
          <p className="text-sm text-fg">Жители двора {yardName}</p>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {people.map((person) => (
              <li key={person.id} className="flex items-center justify-between gap-2">
                <span>{person.owner ? "Хозяин · " : ""}{person.name}</span>
                {owner && !person.owner ? (
                  <Button
                    variant="ghost"
                    onClick={() => {
                      void landDesk({ data: { action: "kick", plot: plotId, who: person.id } }).then(() => {
                        setPeople((list) => list.filter((item) => item.id !== person.id));
                      });
                    }}
                  >
                    Убрать
                  </Button>
                ) : null}
              </li>
            ))}
          </ul>
          {owner && code ? <p className="mt-2 text-sm text-muted">Код, чтобы звать жить: {code}. Кто перейдёт в другой двор, отсюда пропадёт.</p> : null}
          {!owner ? (
            <p className="mt-2 text-sm text-muted">
              {listed ? "Ты в книге этого двора." : "Ты здесь гость. Жить можно по коду хозяина, в гости — просто так."}
            </p>
          ) : null}
        </div>
      ) : (
        <p className="mb-3 text-sm text-muted">Общий двор. Конкурс и инструменты здесь открыты всем, с какого бы двора человек ни пришёл.</p>
      )}
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

