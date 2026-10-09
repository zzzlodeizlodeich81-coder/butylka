export const PLOT_PRICE = {
  dugout: 40,
  house: 120,
  manor: 400,
  commune: 250,
} as const;

export type PlotKind = keyof typeof PLOT_PRICE;

export const PLOT_LABEL: Record<PlotKind, string> = {
  dugout: "Землянка",
  house: "Дом",
  manor: "Особняк",
  commune: "Сообщество",
};

export const TOOLS = [
  { id: "record", title: "Дом записи", price: 500 },
  { id: "factory", title: "Фабрика звука", price: 80 },
  { id: "frame", title: "Рама", price: 40 },
  { id: "atelier", title: "Мастерская", price: 300 },
  { id: "stage", title: "Сцена", price: 60 },
  { id: "cinema", title: "Киностудия", price: 150 },
] as const;

export const TOOLS_ALL = 900;
export const WAR_STAKE = 100;

export const HOUSES = [
  { id: "log", title: "Бревенчатый дом", price: 0 },
  { id: "chum", title: "Чум", price: 20 },
  { id: "bunker", title: "Блиндаж", price: 35 },
  { id: "boyar", title: "Боярский дом", price: 55 },
  { id: "brick", title: "Кирпичный особняк", price: 75 },
  { id: "wings", title: "Дом с крыльями", price: 90 },
  { id: "nest", title: "Дом-матрёшка", price: 120 },
] as const;

export type HouseId = (typeof HOUSES)[number]["id"];

export function houseOf(name: string, stored?: string): HouseId {
  const text = name.toLowerCase();
  if ((/vano|вано/.test(text)) && (!stored || stored === "log")) return "brick";
  if (stored && HOUSES.some((item) => item.id === stored)) return stored as HouseId;
  if (/annush|annuch|аннуш|аннуч|анют/i.test(text)) return "boyar";
  if (/andrei/.test(text) && /nik/.test(text)) return "brick";
  if ((/баб/.test(text) && /яг/.test(text)) || (/baba/.test(text) && /yaga/.test(text))) return "bunker";
  if (/северян|снежин/.test(text)) return "chum";
  if (/angel|ангел/.test(text)) return "wings";
  if (/матр|xxv|kadr|кадр/.test(text)) return "nest";
  return "log";
}

export type ToolId = (typeof TOOLS)[number]["id"];

/** Доля хозяина двора от чистой прибыли. null — обычный двор. */
export function partnerShare(name: string) {
  const text = name.trim();
  if (/andrei/i.test(text) && /nik/i.test(text)) return 1;
  if (/северян|снежин/i.test(text)) return 0.5;
  if ((/баб/i.test(text) && /яг/i.test(text)) || (/baba/i.test(text) && /yaga/i.test(text))) return 0.5;
  return null;
}
