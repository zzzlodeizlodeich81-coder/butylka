import { useEffect, useRef, useState, type PointerEvent as ReactPointerEvent, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NotesButton, PriceSheet } from "@/components/notes-shop";
import { ContestHall, FameCard, OrganCard, PresaveSheet, ReleaseCard, YardChat } from "@/components/yard-square";
import { Guide } from "@/components/guide";
import { HouseCard } from "@/components/house-card";
import { HostChat } from "@/components/host-chat";
import { ReleasePath } from "@/components/release-path";
import { AngelHouse, HelperChat, HelperDock } from "@/components/helper-dock";
import { Notebook } from "@/components/notebook";
import { ProfileCard } from "@/components/profile-card";
import { HuntRoom } from "@/components/manor-rooms";
import { Atelier } from "@/components/atelier";
import { Matreshka } from "@/components/matreshka";
import { LandCard } from "@/components/land-card";
import { GollumCave } from "@/components/gollum-cave";
import { gollumDesk } from "@/lib/gollum-desk";
import { useStage } from "@/lib/stage";
import { MaxFigure } from "@/components/max-figure";
import { yardBoard, type YardSpot } from "@/lib/yard-desk";
import { useGame } from "@/lib/store";
import { useWallet } from "@/lib/wallet";
import { OrpheusRoom } from "@/components/orpheus-table";
import { HouseMark } from "@/components/house-mark";
import { TOOLS, houseOf, partnerShare, type PlotKind } from "@/lib/lands";
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

const CAMP_LABEL: Record<string, string> = {
  record: "Блиндаж записи",
  factory: "Аппаратная",
  frame: "Тактическая карта",
  atelier: "Мастерская",
  stage: "Сцена",
  cinema: "Кинобудка",
  organ: "Маэстро",
  market: "Обоз",
  gate: "КПП",
};
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

const CAMP_BITS: { id: HouseId; left: string; top: string; width: string; src: string }[] = [
  { id: "market", left: "9.8%", top: "32.7%", width: "9%", src: "/camp-bits/oboz.png" },
  { id: "cinema", left: "47.7%", top: "4.6%", width: "7%", src: "/camp-bits/cinema.png" },
  { id: "organ", left: "60.5%", top: "75%", width: "6%", src: "/camp-bits/maestro.png" },
  { id: "frame", left: "45.8%", top: "21.1%", width: "11%", src: "/camp-bits/tactic.png" },
  { id: "factory", left: "29.2%", top: "38%", width: "9%", src: "/camp-bits/apparat.png" },
  { id: "gate", left: "46.7%", top: "81.2%", width: "10%", src: "/camp-bits/kpp.png" },
  { id: "record", left: "58.9%", top: "40.6%", width: "10%", src: "/camp-bits/bunker.png" },
  { id: "stage", left: "42.4%", top: "45.4%", width: "13%", src: "/camp-bits/stage.png" },
  { id: "atelier", left: "16.9%", top: "58%", width: "17%", src: "/camp-bits/workshop.png" },
];

const CAMP_PHONE_BITS: typeof CAMP_BITS = [
  { id: "gate", left: "42.5%", top: "65.3%", width: "13%", src: "/camp-bits/kpp.png" },
  { id: "market", left: "0%", top: "35.6%", width: "13%", src: "/camp-bits/oboz.png" },
  { id: "cinema", left: "48.5%", top: "23.3%", width: "11%", src: "/camp-bits/cinema.png" },
  { id: "organ", left: "68.3%", top: "60.6%", width: "6%", src: "/camp-bits/maestro.png" },
  { id: "frame", left: "48.1%", top: "33.1%", width: "13%", src: "/camp-bits/tactic.png" },
  { id: "factory", left: "24.3%", top: "41.2%", width: "13%", src: "/camp-bits/apparat.png" },
  { id: "record", left: "59%", top: "41.9%", width: "13%", src: "/camp-bits/bunker.png" },
  { id: "stage", left: "38.8%", top: "46.4%", width: "15%", src: "/camp-bits/stage.png" },
  { id: "atelier", left: "2.9%", top: "50.3%", width: "21%", src: "/camp-bits/workshop.png" },
];

const CAMP_ZONES: typeof ZONES = [
  { id: "record", label: "Блиндаж записи", left: "14%", top: "32%", width: "16%", height: "14%", sign: "bottom" },
  { id: "factory", label: "Аппаратная", left: "28%", top: "18%", width: "16%", height: "14%", sign: "bottom" },
  { id: "frame", label: "Планшет", left: "54%", top: "18%", width: "14%", height: "14%", sign: "bottom" },
  { id: "atelier", label: "Маскировочная", left: "4%", top: "74%", width: "22%", height: "14%", sign: "top" },
  { id: "organ", label: "Маэстро", left: "72%", top: "58%", width: "10%", height: "12%", sign: "bottom" },
  { id: "stage", label: "Караулка", left: "36%", top: "34%", width: "14%", height: "12%", sign: "bottom" },
  { id: "cinema", label: "Кинобудка", left: "70%", top: "30%", width: "12%", height: "12%", sign: "bottom" },
  { id: "market", label: "Обоз", left: "56%", top: "48%", width: "16%", height: "10%", sign: "bottom" },
  { id: "gate", label: "КПП", left: "84%", top: "32%", width: "12%", height: "14%", sign: "bottom" },
];

const CAMP_PHONE: typeof ZONES = [
  { id: "record", label: "Блиндаж записи", left: "6%", top: "16%", width: "30%", height: "14%", sign: "bottom" },
  { id: "factory", label: "Аппаратная", left: "36%", top: "14%", width: "28%", height: "14%", sign: "bottom" },
  { id: "frame", label: "Планшет", left: "66%", top: "16%", width: "28%", height: "14%", sign: "bottom" },
  { id: "atelier", label: "Маскировочная", left: "2%", top: "34%", width: "30%", height: "16%", sign: "bottom" },
  { id: "organ", label: "Маэстро", left: "34%", top: "36%", width: "30%", height: "16%", sign: "bottom" },
  { id: "cinema", label: "Кинобудка", left: "66%", top: "36%", width: "30%", height: "14%", sign: "bottom" },
  { id: "market", label: "Обоз", left: "28%", top: "54%", width: "44%", height: "14%", sign: "top" },
  { id: "stage", label: "Караулка", left: "4%", top: "68%", width: "28%", height: "14%", sign: "top" },
  { id: "gate", label: "КПП", left: "32%", top: "76%", width: "36%", height: "16%", sign: "top" },
];

const NORTH_LABEL: Record<string, string> = {
  record: "Чум записи",
  factory: "Метель",
  frame: "Иней",
  atelier: "Сияние",
  stage: "Костёр",
  cinema: "Полярная",
  organ: "Бубен",
  market: "Ярмарка",
  gate: "Порог",
};

const NORTH_ZONES: typeof ZONES = [
  { id: "record", label: "Чум записи", left: "2%", top: "20%", width: "26%", height: "38%", sign: "bottom" },
  { id: "factory", label: "Метель", left: "30%", top: "8%", width: "22%", height: "28%", sign: "bottom" },
  { id: "frame", label: "Иней", left: "52%", top: "10%", width: "12%", height: "20%", sign: "bottom" },
  { id: "atelier", label: "Сияние", left: "64%", top: "6%", width: "30%", height: "30%", sign: "bottom" },
  { id: "organ", label: "Бубен", left: "38%", top: "40%", width: "24%", height: "28%", sign: "bottom" },
  { id: "stage", label: "Костёр", left: "16%", top: "58%", width: "22%", height: "20%", sign: "top" },
  { id: "cinema", label: "Полярная", left: "66%", top: "46%", width: "30%", height: "26%", sign: "top" },
  { id: "market", label: "Ярмарка", left: "2%", top: "72%", width: "30%", height: "22%", sign: "top" },
  { id: "gate", label: "Порог", left: "36%", top: "78%", width: "26%", height: "18%", sign: "top" },
];

const NORTH_PHONE: typeof ZONES = [
  { id: "record", label: "Чум записи", left: "4%", top: "4%", width: "44%", height: "18%", sign: "bottom" },
  { id: "factory", label: "Метель", left: "52%", top: "4%", width: "42%", height: "16%", sign: "bottom" },
  { id: "atelier", label: "Сияние", left: "22%", top: "22%", width: "70%", height: "14%", sign: "bottom" },
  { id: "frame", label: "Иней", left: "4%", top: "24%", width: "18%", height: "12%", sign: "bottom" },
  { id: "organ", label: "Бубен", left: "20%", top: "38%", width: "60%", height: "16%", sign: "bottom" },
  { id: "stage", label: "Костёр", left: "8%", top: "56%", width: "40%", height: "14%", sign: "top" },
  { id: "cinema", label: "Полярная", left: "52%", top: "58%", width: "42%", height: "14%", sign: "top" },
  { id: "market", label: "Ярмарка", left: "4%", top: "72%", width: "48%", height: "12%", sign: "top" },
  { id: "gate", label: "Порог", left: "28%", top: "84%", width: "44%", height: "12%", sign: "top" },
];

const DOORS: Partial<Record<HouseId, string>> = {
  factory: "/doors/master.html",
  frame: "/doors/frame.html",
  cinema: "/doors/cinema.html",
};

function CampGun({ phone }: { phone: boolean }) {
  const imgRef = useRef<HTMLImageElement>(null);
  const flashRef = useRef<HTMLSpanElement>(null);
  const audio = useRef<HTMLAudioElement | null>(null);
  useEffect(() => {
    const clip = new Audio("/camp-bits/shot.wav");
    clip.preload = "auto";
    audio.current = clip;
    const fire = () => {
      const img = imgRef.current;
      const flash = flashRef.current;
      if (img) {
        img.style.animation = "none";
        void img.offsetWidth;
        img.style.animation = "camp-recoil .55s ease-out";
      }
      if (flash) {
        flash.style.animation = "none";
        void flash.offsetWidth;
        flash.style.animation = "camp-flash .4s ease-out";
      }
      clip.currentTime = 0;
      clip.play().catch(() => {});
    };
    const first = window.setTimeout(fire, 2000);
    const timer = window.setInterval(fire, 9000);
    const unlock = () => {
      clip.play().then(() => {
        clip.pause();
        clip.currentTime = 0;
      }).catch(() => {});
    };
    window.addEventListener("pointerdown", unlock, { once: true });
    return () => {
      window.clearTimeout(first);
      window.clearInterval(timer);
      window.removeEventListener("pointerdown", unlock);
    };
  }, []);
  const box = phone
    ? { left: "60%", top: "29%", width: "22%" }
    : { left: "71%", top: "23%", width: "14%" };
  return (
    <>
      <style>{`
        @keyframes camp-recoil { 0% { transform: translate(0,0); } 18% { transform: translate(-8%, 3%); } 100% { transform: translate(0,0); } }
        @keyframes camp-flash { 0% { opacity: 1; transform: scale(0.3); } 35% { opacity: 1; transform: scale(1); } 100% { opacity: 0; transform: scale(1.4); } }
        .camp-flash { position: absolute; right: 0; top: 4%; width: 36%; aspect-ratio: 1; border-radius: 50%; pointer-events: none; opacity: 0; background: radial-gradient(circle, #fff8d0 0%, #ffc14a 28%, #ff5a12 55%, transparent 72%); }
      `}</style>
      <button
        type="button"
        aria-label="Гаубица"
        className="absolute z-20 h-auto border-0 bg-transparent p-0 leading-none"
        style={box}
        onClick={() => {
          const clip = audio.current;
          if (!clip) return;
          clip.currentTime = 0;
          clip.play().catch(() => {});
          const img = imgRef.current;
          const flash = flashRef.current;
          if (img) {
            img.style.animation = "none";
            void img.offsetWidth;
            img.style.animation = "camp-recoil .55s ease-out";
          }
          if (flash) {
            flash.style.animation = "none";
            void flash.offsetWidth;
            flash.style.animation = "camp-flash .4s ease-out";
          }
        }}
      >
        <img ref={imgRef} src="/camp-bits/howitzer.png" alt="" draggable={false} className="pointer-events-none block h-auto w-full" />
        <span ref={flashRef} className="camp-flash" />
      </button>
    </>
  );
}

export function Yard() {
  const toStudio = useGame((s) => s.toStudio);
  const toLobby = useGame((s) => s.toLobby);
  const myName = useWallet((s) => s.name);
  const notes = useWallet((s) => s.notes);
  const vkId = useWallet((s) => s.vkId);
  const iAmHost = useWallet((s) => s.admin);
  const [bow, setBow] = useState(0);
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
  const [contest, setContest] = useState(false);
  const [plot, setPlot] = useState(false);
  const [radioOn, setRadioOn] = useState(false);
  const [radioOpen, setRadioOpen] = useState(false);
  const [price, setPrice] = useState(false);
  const [splash, setSplash] = useState(true);
  const stage = useStage();
  const [guide, setGuide] = useState(false);
  const [lands, setLands] = useState(false);
  const [bog, setBog] = useState(false);
  const [pile, setPile] = useState(false);
  const [mess, setMess] = useState(false);
  const [field, setField] = useState(false);
  const [angel, setAngel] = useState(false);
  const [path, setPath] = useState(false);
  const [book, setBook] = useState(false);
  const [doorFull, setDoorFull] = useState(true);
  const [doorWho, setDoorWho] = useState<null | "angel" | "tech" | "master">(null);
  const [profile, setProfile] = useState(false);
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

  useEffect(() => {
    const name = lock?.name || "";
    if (layer !== "yard" || partnerShare(name) === 0.5 || /северян|снежин/i.test(name)) {
      setPile(false);
      setMess(false);
      return;
    }
    void gollumDesk({ data: { action: "pile", room: lock?.id || "" } }).then((res) => {
      if (res.ok) {
        const on = Boolean((res as { pile?: boolean }).pile);
        setPile(on);
        setMess(on);
      }
    });
  }, [layer, lock?.id, lock?.name]);

  function open(id: HouseId) {
    const annuch = /annush|annuch|аннуш|аннуч|анют/i.test(lock?.name || "");
    const north = /северян|снежин/i.test(lock?.name || "");
    if (lock && partnerShare(lock.name) !== 0.5 && !north && ((id === "organ" && !annuch) || id === "market")) {
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

  function markYard(id: string) {
    void fetch("/api/door", {
      method: "POST",
      credentials: "same-origin",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "here", id }),
    });
  }

  function enterPlot(plot: { id: string; name: string; kind: PlotKind; tools: string[]; owner: boolean; member?: boolean }) {
    setLock({ id: plot.id, name: plot.name, kind: plot.kind, tools: plot.tools || [], owner: plot.owner, member: Boolean(plot.owner || plot.member) });
    markYard(plot.id);
    setAsk(null);
    setHouse(null);
    setSpot(null);
    setLands(false);
    setLayer("yard");
  }

  const snowYard = /северян|снежин/i.test(lock?.name || "");
  const quietCamp = partnerShare(lock?.name || "") === 0.5 && !snowYard;
  const yardMap = quietCamp
    ? stage === "phone"
      ? { src: "/camp-phone.jpg", aspect: "9 / 16", zones: CAMP_PHONE }
      : { src: "/camp-wide.jpg", aspect: "16 / 9", zones: CAMP_ZONES }
    : snowYard
      ? stage === "phone"
        ? { src: "/m/north.jpg", aspect: "9 / 16", zones: NORTH_PHONE }
        : { src: "/north.jpg", aspect: "16 / 9", zones: NORTH_ZONES }
      : stage === "phone"
        ? { src: "/m/yard.jpg", aspect: "9 / 16", zones: YARD_PHONE }
        : { src: "/yard.jpg", aspect: "16 / 9", zones: ZONES };
  const menuItems = [
    { label: "Карта", onClick: () => setLands(true) },
    { label: "Слава", onClick: () => setFame(true) },
    ...(quietCamp ? [] : [{ label: "Конкурс", onClick: () => setContest(true) }]),
    { label: "Дом", onClick: () => setPlot(true) },
    { label: "Прайс", onClick: () => setPrice(true) },
    { label: "Кабинет", onClick: () => setProfile(true) },
    { label: "Путь", onClick: () => setPath(true) },
    { label: "Радио", onClick: () => { setRadioOn(true); setRadioOpen(true); } },
  ];
  const desk = (
    <>
      {field ? <PresaveSheet onClose={() => setField(false)} /> : null}
      {fame ? <FameCard plot={lock?.id || ""} onClose={() => setFame(false)} /> : null}
      {contest ? <ContestHall onClose={() => setContest(false)} /> : null}
      {lands ? <LandCard onClose={() => setLands(false)} onEnter={enterPlot} /> : null}
      {plot ? <HouseCard onClose={() => setPlot(false)} /> : null}
      {price ? <PriceSheet onClose={() => setPrice(false)} /> : null}
      {profile ? (
        <ProfileCard
          onClose={() => setProfile(false)}
          onPath={() => {
            setProfile(false);
            setPath(true);
          }}
        />
      ) : null}
      {book ? <Notebook onClose={() => setBook(false)} /> : null}
      {path ? (
        <ReleasePath
          onClose={() => setPath(false)}
          onGo={(id) => {
            setPath(false);
            setProfile(false);
            setAngel(false);
            if (id === "studio") {
              toStudio();
              return;
            }
            if (id === "field") {
              setField(true);
              return;
            }
            if (id === "book") {
              setBook(true);
              return;
            }
            setHouse(id);
          }}
        />
      ) : null}
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
            markYard("");
            setSpot(null);
            setLayer("yard");
          }}
          onEnter={enterPlot}
          onBuy={() => setLands(true)}
          onField={() => setField(true)}
          onAngel={() => setAngel(true)}
          onBog={() => setBog(true)}
          menu={menuItems}
        />
        {angel ? (
          <AngelHouse
            onClose={() => setAngel(false)}
            onPath={() => {
              setAngel(false);
              setPath(true);
            }}
          />
        ) : null}
        {bog ? <GollumCave onClose={() => setBog(false)} /> : null}
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
        <HelperDock />
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
          {quietCamp
            ? (stage === "phone" ? CAMP_PHONE_BITS : CAMP_BITS).map((bit) => {
                const tool = TOOLS.find((item) => item.id === bit.id);
                const closed = Boolean(lock && tool && !lock.tools.includes(tool.id));
                const label = CAMP_LABEL[bit.id] || bit.id;
                return (
                  <button
                    key={bit.id}
                    type="button"
                    aria-label={label}
                    className="absolute border-0 bg-transparent p-0"
                    style={{ left: bit.left, top: bit.top, width: bit.width }}
                    onClick={() => open(bit.id)}
                  >
                    <img src={bit.src} alt="" draggable={false} className={`pointer-events-none block h-auto w-full ${closed ? "opacity-50" : ""}`} />
                    <span className="pointer-events-none absolute bottom-0 left-1/2 max-w-[140%] -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-center text-[11px] leading-tight font-medium text-[#f4e4c4] shadow">
                      {closed ? `закрыто · ${tool?.price}` : label}
                    </span>
                  </button>
                );
              })
            : yardMap.zones.map((zone) => {
            const tool = TOOLS.find((item) => item.id === zone.id);
            const closed = Boolean(lock && tool && !lock.tools.includes(tool.id));
            const annuch = /annush|annuch|аннуш|аннуч|анют/i.test(lock?.name || "");
            const label = quietCamp ? CAMP_LABEL[zone.id] || zone.label : snowYard ? NORTH_LABEL[zone.id] || zone.label : annuch && zone.id === "organ" ? "Орфей" : zone.label;
            return (
            <button
              key={zone.id}
              type="button"
              aria-label={label}
              className={`absolute rounded-xl border ${closed ? "border-white/30 bg-black/45" : "border-transparent hover:border-white/70 hover:bg-white/10"}`}
              style={{ left: zone.left, top: zone.top, width: zone.width, height: zone.height }}
              onClick={() => open(zone.id)}
            >
              {annuch && zone.id === "organ" ? (
                <img src="/orpheus.jpg" alt="" className="pointer-events-none absolute inset-0 h-full w-full rounded-xl object-contain" />
              ) : null}
              <span
                className={`pointer-events-none absolute left-1/2 max-w-[92%] -translate-x-1/2 rounded bg-[#2a1a0c]/88 px-1.5 py-0.5 text-center leading-tight font-medium text-[#f4e4c4] shadow ${stage === "phone" ? "text-[10px]" : "text-[11px]"} ${zone.sign === "top" ? "top-0.5" : "bottom-0.5"}`}
              >
                {closed ? `закрыто · ${tool?.price}` : label}
              </span>
              {faces
                .filter((person) => person.spot === zone.id && !person.figure)
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
          {quietCamp ? <CampGun phone={stage === "phone"} /> : null}
          {iAmHost || faces.some((person) => person.figure) ? (
            <button
              type="button"
              aria-label="Хозяин"
              className="pointer-events-auto absolute z-30 border-0 bg-transparent p-0"
              style={
                stage === "phone"
                  ? { left: "38%", top: "42%", width: "18%", height: "24%" }
                  : quietCamp
                    ? { left: "44%", top: "64%", width: "6%", height: "12%" }
                    : snowYard
                      ? { left: "30%", top: "64%", width: "6%", height: "14%" }
                      : { left: "41%", top: "28%", width: "13%", height: "26%" }
              }
              onClick={() => setBow((n) => n + 1)}
            >
              <MaxFigure className="h-full w-full" mode="still" play={bow} />
            </button>
          ) : null}
      </MapStage>
      {mess ? (
          <div className="absolute top-16 right-3 left-3 z-30 rounded-2xl bg-black/75 px-3 py-2 text-sm text-[#f4e4c4]">
            <p>У вас во дворе нагадил Голум.</p>
            <div className="mt-2 flex flex-wrap gap-2">
              <button
                type="button"
                className="rounded-full bg-white px-3 py-1 text-xs text-black"
                onClick={() => {
                  void gollumDesk({ data: { action: "clean", room: lock?.id || "" } }).then((res) => {
                    if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
                    if (!res.ok) {
                      toast.error(res.error || "Не убралось.");
                      return;
                    }
                    setPile(false);
                    setMess(false);
                  });
                }}
              >
                Убрать · 2 ноты
              </button>
              <button
                type="button"
                className="rounded-full bg-white/15 px-3 py-1 text-xs text-white"
                onClick={() => {
                  void gollumDesk({ data: { action: "fence", room: lock?.id || "" } }).then((res) => {
                    if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
                    if (!res.ok) {
                      toast.error(res.error || "Ограда не встала.");
                      return;
                    }
                    setPile(false);
                    setMess(false);
                    toast.message("Ограда на месяц. Потом он опять придёт.");
                  });
                }}
              >
                Ограда · 10 нот
              </button>
              <button type="button" className="rounded-full px-3 py-1 text-xs text-white/70" onClick={() => setMess(false)}>
                Оставить
              </button>
            </div>
          </div>
      ) : null}
      {pile ? (
        <>
          <style>{`@keyframes gnat{0%{transform:translate(0,0)}50%{transform:translate(8px,-10px)}100%{transform:translate(-4px,-2px)}}`}</style>
          <div className="pointer-events-none absolute bottom-20 left-1/2 z-20 -translate-x-1/2">
            <span className="absolute -top-3 left-0 size-1 rounded-full bg-black" style={{ animation: "gnat 0.7s infinite" }} />
            <span className="absolute -top-4 left-3 size-1 rounded-full bg-black" style={{ animation: "gnat 0.9s infinite" }} />
            <span className="absolute -top-2 left-6 size-1 rounded-full bg-black" style={{ animation: "gnat 0.6s infinite" }} />
            <span className="block h-3 w-10 rounded-[50%] bg-[#2a1c0e]" />
          </div>
        </>
      ) : null}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-30 flex items-start justify-between px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <div className="pointer-events-auto flex min-w-0 flex-1 items-start gap-2">
          <div className="flex flex-wrap gap-2">
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
            {stage === "phone" ? null : (
              <>
                <button type="button" className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setLands(true)}>
                  Карта
                </button>
                <button type="button" className="shrink-0 rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={() => setFame(true)}>
                  Слава
                </button>
                {quietCamp ? null : (
                  <button type="button" className="shrink-0 rounded-full bg-white px-3 py-1 text-sm font-medium text-black" onClick={() => setContest(true)}>
                    Конкурс
                  </button>
                )}
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
              </>
            )}
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
        <div
          className="absolute right-3 z-20 max-w-[14rem] rounded-2xl bg-black/70 px-3 py-2 text-sm text-white"
          style={{ top: "max(6.1rem, calc(env(safe-area-inset-top) + 5.6rem))" }}
        >
          <p className="truncate">
            {lock.owner ? "Твой двор" : lock.member ? "Ты здесь живёшь" : "Гость"} · {lock.name}
          </p>
          <button type="button" className="mt-1 text-xs text-white/80" onClick={() => { setLock(null); markYard(""); }}>
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
      <HelperDock />
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
        <div className={doorFull ? "absolute inset-0 z-40 flex flex-col bg-black" : "absolute inset-0 z-40 flex items-center justify-center bg-black/50 p-3"}>
          <div className={doorFull ? "flex min-h-0 flex-1 flex-col" : "flex h-[82dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-black"}>
            <div className="flex flex-wrap items-center justify-between gap-2 bg-black px-3 pt-[max(0.55rem,env(safe-area-inset-top))] pb-2">
              <button type="button" className="rounded-full bg-white px-3 py-1 text-sm font-medium text-black" onClick={() => setHouse(null)}>
                На двор
              </button>
              <button type="button" className="rounded-full bg-white/15 px-3 py-1 text-sm text-white" onClick={() => setDoorFull((v) => !v)}>
                {doorFull ? "Окно" : "На весь экран"}
              </button>
              <button
                type="button"
                className="rounded-full bg-[#f4e4c4] px-3 py-1 text-sm text-black"
                onClick={() => setDoorWho(house === "factory" ? "master" : house === "frame" ? "tech" : "angel")}
              >
                Позвать
              </button>
              <a className="rounded-full bg-white/15 px-3 py-1 text-sm text-white" href={DOORS[house]} target="_blank" rel="noreferrer">
                Открыть отдельно
              </a>
            </div>
            <iframe title={ZONES.find((z) => z.id === house)?.label} src={DOORS[house]} className="min-h-0 w-full flex-1 border-0 bg-white" />
          </div>
          {doorWho ? <HelperChat who={doorWho} onClose={() => setDoorWho(null)} /> : null}
        </div>
      ) : null}
      {house === "organ" && /annush|annuch|аннуш|аннуч|анют/i.test(lock?.name || "") ? (
        <OrpheusRoom
          plotId={lock?.id || ""}
          phone={stage === "phone"}
          host={Boolean(
            lock?.owner ||
              lock?.member ||
              (myName && lock?.name && lock.name.toLowerCase().includes(myName.trim().toLowerCase()) && myName.trim().length > 2),
          )}
          onClose={() => setHouse(null)}
          onOpenChat={() => setChat(true)}
        />
      ) : null}
      {house && !DOORS[house] && !(house === "organ" && /annush|annuch|аннуш|аннуч|анют/i.test(lock?.name || "")) ? (
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
          labels={quietCamp ? CAMP_LABEL : snowYard ? NORTH_LABEL : undefined}
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
  onAngel,
  onBog,
  menu,
}: {
  onCity: () => void;
  onHome: () => void;
  onEnter: (plot: { id: string; name: string; kind: PlotKind; tools: string[]; owner: boolean; member?: boolean }) => void;
  onBuy: () => void;
  onField: () => void;
  onAngel: () => void;
  onBog: () => void;
  menu: { label: string; onClick: () => void }[];
}) {
  void menu;
  const phone = useStage() === "phone";
  const host = useWallet((s) => s.admin);
  const [rows, setRows] = useState<{ id: string; name: string; kind: PlotKind; mark?: string; tools: string[]; owner: boolean; member?: boolean; badge?: string; stateCode?: string; liege?: string }[]>([]);
  const [code, setCode] = useState("");
  useEffect(() => {
    void landDesk({ data: { action: "look" } }).then((res) => {
      if (res.ok) setRows((res.plots as typeof rows) || []);
    });
  }, []);
  const mine = rows.find((row) => row.owner);
  const frame = useRef<HTMLDivElement>(null);
  const view = useRef({ x: -80, y: -40, z: 1 });
  const [pan, setPan] = useState(view.current);

  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const onWheel = (event: WheelEvent) => {
      event.preventDefault();
      const prev = view.current;
      const z = Math.min(2.8, Math.max(0.45, prev.z * (event.deltaY > 0 ? 0.9 : 1.1)));
      const rect = node.getBoundingClientRect();
      const ox = event.clientX - rect.left;
      const oy = event.clientY - rect.top;
      const next = {
        z,
        x: ox - ((ox - prev.x) * z) / prev.z,
        y: oy - ((oy - prev.y) * z) / prev.z,
      };
      view.current = next;
      setPan(next);
    };
    node.addEventListener("wheel", onWheel, { passive: false });
    return () => node.removeEventListener("wheel", onWheel);
  }, []);

  function grab(event: ReactPointerEvent<HTMLDivElement>) {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    const startX = event.clientX;
    const startY = event.clientY;
    const origin = view.current;
    let dragged = false;
    const clicked = (event.target as HTMLElement).closest("button,a,input,label");
    const move = (ev: PointerEvent) => {
      if (ev.pointerType === "mouse" && (ev.buttons & 1) === 0) {
        end();
        return;
      }
      const dx = ev.clientX - startX;
      const dy = ev.clientY - startY;
      if (!dragged && Math.hypot(dx, dy) < 6) return;
      dragged = true;
      const next = { ...origin, x: origin.x + dx, y: origin.y + dy };
      view.current = next;
      setPan({ ...next });
    };
    const end = () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", end);
      if (dragged && clicked) {
        const swallow = (click: Event) => {
          click.preventDefault();
          click.stopPropagation();
          clicked.removeEventListener("click", swallow, true);
        };
        clicked.addEventListener("click", swallow, true);
      }
    };
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", end);
  }
  const wideSigns: { label: string; left: string; top: string; act: "buy" | "angel" | "bog" | "field" | "yaga" | "north" | "city" | "title" }[] = [
    { label: "Снежинка северянка", left: "28%", top: "11%", act: "north" },
    { label: "DJ Angel A", left: "73%", top: "27%", act: "angel" },
    { label: "Продаётся", left: "52%", top: "32%", act: "buy" },
    { label: "Продаётся", left: "66%", top: "47%", act: "buy" },
    { label: "Продаётся", left: "47%", top: "54%", act: "buy" },
    { label: "Продаётся", left: "60%", top: "66%", act: "buy" },
    { label: "Продаётся", left: "34%", top: "66%", act: "buy" },
    { label: "Продаётся", left: "30%", top: "75%", act: "buy" },
    { label: "Продаётся", left: "38%", top: "80%", act: "buy" },
    { label: "Феномен бабы яги", left: "16%", top: "38%", act: "yaga" },
    { label: "болота голума", left: "4%", top: "84%", act: "bog" },
    { label: "поле пресейвов", left: "78%", top: "68%", act: "field" },
  ];
  const phoneSigns: typeof wideSigns = [
    { label: "ГОРОД", left: "3.4%", top: "1.6%", act: "city" },
    { label: "карта музыкального мира", left: "35.6%", top: "1.4%", act: "title" },
    { label: "купить участок", left: "83.7%", top: "1.8%", act: "buy" },
    { label: "Снежинка северянка", left: "21.4%", top: "7.9%", act: "north" },
    { label: "Продаётся", left: "57.2%", top: "22.8%", act: "buy" },
    { label: "DJ Angel A", left: "70.8%", top: "31%", act: "angel" },
    { label: "Феномен бабы яги", left: "5.6%", top: "31.6%", act: "yaga" },
    { label: "Продаётся", left: "42%", top: "44.7%", act: "buy" },
    { label: "Продаётся", left: "65.8%", top: "43.9%", act: "buy" },
    { label: "Продаётся", left: "29.1%", top: "54%", act: "buy" },
    { label: "Продаётся", left: "55%", top: "59.3%", act: "buy" },
    { label: "Продаётся", left: "13.9%", top: "61.5%", act: "buy" },
    { label: "Продаётся", left: "20.1%", top: "68%", act: "buy" },
    { label: "поле пресейвов", left: "70.2%", top: "70.9%", act: "field" },
    { label: "болота голума", left: "4.3%", top: "78.3%", act: "bog" },
  ];
  const signs = phone ? phoneSigns : wideSigns;
  function pressSign(act: (typeof signs)[number]["act"]) {
    if (act === "title") return;
    if (act === "city") return onCity();
    if (act === "buy") return onBuy();
    if (act === "angel") return onAngel();
    if (act === "bog") return onBog();
    if (act === "field") return onField();
    const plot = rows.find((row) => {
      const text = row.name.toLowerCase();
      if (act === "yaga") return row.id === "baba-yaga" || (/баб/.test(text) && /яг/.test(text));
      return /северян|снежин/.test(text);
    });
    if (plot) onEnter(plot);
  }
  function Nest({ left, top, big }: { left: string; top: string; big?: boolean }) {
    return (
      <button type="button" className="absolute z-10 flex flex-col items-center bg-transparent p-0 text-center" style={{ left, top }} onClick={onHome}>
        <img src="/houses/nest.jpg" alt="" draggable={false} className={big ? "h-[4.4cm] w-[4.4cm] rounded-xl object-cover shadow" : "h-[3.4cm] w-[3.4cm] rounded-xl object-cover shadow"} />
        <span className="mt-1 max-w-[6cm] rounded bg-black/80 px-1.5 py-0.5 text-sm leading-tight text-[#f4e4c4]">XXV Kadr & Holding матрёшка</span>
      </button>
    );
  }
  const spots = [
    { left: "88%", top: "28%" },
    { left: "16%", top: "58%" },
    { left: "8%", top: "18%" },
  ];
  function plotSpot(plot: (typeof rows)[number], index: number) {
    const text = plot.name.toLowerCase();
    if (/andrei/.test(text) && /nik/.test(text)) return { left: "82%", top: "36%" };
    if (/annush|annuch|аннуш|аннуч|анют/i.test(text)) return { left: "22%", top: "58%" };
    if (/vano|вано/.test(text)) return { left: "18%", top: "62%" };
    if (/bager|багер/.test(text)) return { left: "58%", top: "40%" };
    if (/natalee|натал/.test(text)) return { left: "12%", top: "70%" };
    return spots[index % spots.length];
  }

  return (
    <div className="relative h-dvh w-full overflow-hidden bg-[#6d8f62]">
      {phone ? (
        <MapStage src="/m/earth-phone.jpg" alt="Мир" aspect="9 / 16" top="0">
          {signs.map((sign) => (
            <button
              key={sign.label + sign.left + sign.top}
              type="button"
              className={`absolute rounded-md px-1 py-0.5 text-left text-[11px] leading-none shadow ${sign.act === "title" ? "pointer-events-none bg-black/55 text-[#f4e4c4]" : sign.act === "buy" && sign.label === "купить участок" ? "bg-white text-[#1a120c]" : "bg-black/75 text-[#f4e4c4]"}`}
              style={{ left: sign.left, top: sign.top }}
              onClick={() => pressSign(sign.act)}
            >
              {sign.label}
            </button>
          ))}
          <Nest left="16%" top="44%" />
        </MapStage>
      ) : (
      <div
        ref={frame}
        className="absolute inset-0 z-10 cursor-grab touch-none overflow-hidden select-none active:cursor-grabbing"
        onPointerDown={grab}
      >
        <div
          className="absolute w-[220%]"
          style={{ transform: `translate(${pan.x}px, ${pan.y}px) scale(${pan.z})`, transformOrigin: "0 0" }}
        >
          <img src="/earth.jpg" alt="" draggable={false} className="pointer-events-none block h-auto w-full select-none" />
          <Nest left="38%" top="42%" big />
          {signs.map((sign) => (
            <button
              key={sign.label + sign.left + sign.top}
              type="button"
              className="absolute rounded-md bg-black/75 px-1.5 py-0.5 text-left text-[13px] leading-tight text-[#f4e4c4] shadow"
              style={{ left: sign.left, top: sign.top }}
              onClick={() => pressSign(sign.act)}
            >
              {sign.label}
            </button>
          ))}
          {rows
            .filter((plot) => !/angel|ангел|северян|снежин/i.test(plot.name) && !(plot.id === "baba-yaga" || (/баб/.test(plot.name.toLowerCase()) && /яг/.test(plot.name.toLowerCase()))))
            .map((plot, index) => (
            <button
              key={plot.id}
              type="button"
              className="absolute flex w-[3.4cm] flex-col items-center bg-transparent p-0 text-center text-[#f4e4c4]"
              style={plotSpot(plot, index)}
              onClick={() => onEnter(plot)}
            >
              <HouseMark id={houseOf(plot.name, plot.mark)} />
              <span className="mt-0.5 max-w-full truncate rounded bg-black/70 px-1 text-[11px]">{plot.name}</span>
            </button>
          ))}
        </div>
      </div>
      )}
      {phone ? null : (
      <div className="pointer-events-none absolute top-[max(4.6rem,calc(env(safe-area-inset-top)+4.2rem))] left-3 z-20 max-w-[16rem] rounded-xl bg-black/55 px-3 py-2 text-[#f4e4c4]">
        <p className="text-sm">карта музыкального мира</p>
        <p className="text-xs">луга, леса и северные земли</p>
      </div>
      )}
      {phone ? null : (
      <div className="absolute top-0 left-0 z-30 flex flex-wrap gap-2 px-3 pt-[max(0.6rem,env(safe-area-inset-top))]">
        <button type="button" className="rounded-full bg-black/45 px-3 py-1 text-sm text-white" onClick={onCity}>
          Город
        </button>
        <button type="button" className="rounded-full bg-white px-3 py-1 text-sm text-black" onClick={onBuy}>
          Купить участок
        </button>
      </div>
      )}
      {host ? (
        <button
          type="button"
          className="absolute top-[max(0.6rem,env(safe-area-inset-top))] right-3 z-30 rounded-full bg-[#f4e4c4] px-3 py-1 text-sm text-[#1a120c]"
          onClick={() => window.dispatchEvent(new Event("kadr-desk"))}
        >
          Админка
        </button>
      ) : null}
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
  labels?: Record<string, string>;
}) {
  const [full, setFull] = useState(false);
  const [who, setWho] = useState<null | "angel" | "tech">(null);
  const title = props.labels?.[props.house] || ZONES.find((z) => z.id === props.house)?.label || "";
  const creative = props.house === "stage" || props.house === "organ" || props.house === "record";
  return (
    <div className={full ? "absolute inset-0 z-10 flex flex-col bg-black/35" : "absolute inset-0 z-10 flex items-end bg-black/35"}>
      <div className={full ? "flex h-full w-full flex-col overflow-auto bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]" : "max-h-[78%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]"}>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-fg">{title}</h2>
          <div className="flex gap-2">
            <Button variant="secondary" onClick={() => setFull((v) => !v)}>
              {full ? "Окно" : "На весь экран"}
            </Button>
            <Button variant="secondary" onClick={() => setWho(creative ? "angel" : "tech")}>
              Позвать
            </Button>
            {props.roles.length ? (
              <Button variant="ghost" onClick={props.onClose}>
                На двор
              </Button>
            ) : null}
          </div>
        </div>
        {props.house === "gate" ? <GateCard roles={props.roles} onSave={props.onRoles} plotId={props.plotId || ""} /> : null}
        {props.house === "stage" ? <ReleaseCard onStage={props.onStage} /> : null}
        {props.house === "organ" ? <OrganCard plot={props.plotId || ""} /> : null}
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
      {who ? <HelperChat who={who} onClose={() => setWho(null)} /> : null}
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

