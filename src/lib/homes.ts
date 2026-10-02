export type TierId = "tent" | "dugout" | "wood" | "brick" | "star" | "manor";

export type HouseDef = {
  id: TierId;
  title: string;
  who: string;
  need: string;
  cost: number;
  img: string;
  rank: number;
};

export const HOUSES: HouseDef[] = [
  { id: "tent", title: "Палатка", who: "Уличный музыкант", need: "Даётся сразу", cost: 0, img: "/houses/tent.jpg", rank: 0 },
  { id: "dugout", title: "Землянка", who: "Самодеятельность", need: "10 прослушиваний у шарманщика", cost: 0, img: "/houses/dugout.jpg", rank: 1 },
  { id: "wood", title: "Деревянный дом", who: "Артист местного значения", need: "50 тёплых отзывов", cost: 0, img: "/houses/wood.jpg", rank: 2 },
  { id: "brick", title: "Кирпичный дом", who: "Артист", need: "Свои треки на сцене и рейтинг от 100", cost: 0, img: "/houses/brick.jpg", rank: 3 },
  { id: "star", title: "Дом звезды", who: "Звезда", need: "Треки на сцене и рейтинг от 500", cost: 50, img: "/houses/brick.jpg", rank: 4 },
  { id: "manor", title: "Особняк", who: "Суперзвезда", need: "Треки на сцене и рейтинг от 1000", cost: 500, img: "/houses/manor.jpg", rank: 5 },
];

export function houseById(id: string | null | undefined) {
  return HOUSES.find((house) => house.id === id) || HOUSES[0];
}
