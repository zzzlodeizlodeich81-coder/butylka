export const NOTES_PER_FRAME = 100;
export const HOUSE_CUT = 0.1;

export const ROLES = [
  { id: "passer", label: "Прохожий", hint: "зашёл на рынок, жить не обязан" },
  { id: "artist", label: "Артист", hint: "выходит на сцену" },
  { id: "poet", label: "Поэт", hint: "пишет строки" },
  { id: "musician", label: "Музыкант", hint: "собирает трек" },
  { id: "live", label: "Живой звук", hint: "сам поёт и озвучивает" },
  { id: "promo", label: "Продвижение", hint: "чтобы человека услышали" },
] as const;

export type RoleId = (typeof ROLES)[number]["id"];

export const STALL_RENT = 286;
export const STALL_DAYS = 30;

export type Listing = {
  id: string;
  name: string;
  role: RoleId;
  service: string;
  price: number;
  mine?: boolean;
};

const CARD_KEY = "yard-roles";
const BOARD_KEY = "yard-board";
const FRAMES_KEY = "yard-frames";
const HOUSE_KEY = "yard-house-notes";

export function splitDeal(price: number) {
  const house = Math.max(1, Math.round(price * HOUSE_CUT));
  return { house, seller: Math.max(0, price - house) };
}

export function readRoles(): RoleId[] {
  try {
    const raw = JSON.parse(localStorage.getItem(CARD_KEY) || "[]") as RoleId[];
    return raw.filter((id) => ROLES.some((role) => role.id === id));
  } catch {
    return [];
  }
}

export function writeRoles(ids: RoleId[]) {
  localStorage.setItem(CARD_KEY, JSON.stringify(ids));
}

export function readBoard(): Listing[] {
  try {
    const raw = JSON.parse(localStorage.getItem(BOARD_KEY) || "null") as Listing[] | null;
    if (!raw?.length) return [];
    return raw.filter((row) => row.id && !String(row.id).startsWith("seed-"));
  } catch {
    return [];
  }
}

export function writeBoard(rows: Listing[]) {
  localStorage.setItem(BOARD_KEY, JSON.stringify(rows.slice(0, 40)));
}

export function readFrames() {
  return Number(localStorage.getItem(FRAMES_KEY) || 0) || 0;
}

export function addFrames(n: number) {
  const next = Math.max(0, readFrames() + n);
  localStorage.setItem(FRAMES_KEY, String(next));
  return next;
}

export function readHouseTake() {
  return Number(localStorage.getItem(HOUSE_KEY) || 0) || 0;
}

export function addHouseTake(n: number) {
  const next = readHouseTake() + n;
  localStorage.setItem(HOUSE_KEY, String(next));
  return next;
}
