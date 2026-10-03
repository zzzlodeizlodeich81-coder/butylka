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

export type ToolId = (typeof TOOLS)[number]["id"];
