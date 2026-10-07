import type { HouseId } from "@/lib/lands";

const SRC: Record<HouseId, string> = {
  log: "/houses/log.jpg",
  chum: "/houses/chum.jpg",
  bunker: "/houses/bunker.jpg",
  boyar: "/houses/boyar.jpg",
  brick: "/houses/brick.jpg",
  wings: "/houses/wings.jpg",
  nest: "/houses/nest.jpg",
};

export function HouseMark({ id, shop = false }: { id: HouseId; shop?: boolean }) {
  return (
    <img
      src={SRC[id]}
      alt=""
      draggable={false}
      className={shop ? "h-14 w-14 rounded-md object-cover" : "h-[1.5cm] w-[1.5cm] rounded-md object-cover shadow"}
    />
  );
}
