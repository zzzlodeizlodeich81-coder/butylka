/**
 * In-app currency: ноты.
 *
 * Pricing rule (owner asked for ~50% over cost, not more):
 *   sell_net = cost_usd * 1.5
 *
 * Assumptions (conservative, so the table is not in the red):
 *   SunoAPI V5_5 generate  ~ $0.15  (2 clips, ~80s)
 *   lyrics                 ~ $0.03
 *   minus (separate_vocal) ~ $0.10
 *   cover                  ~ $0.15
 *   timestamps             bundled with generate
 *
 * VK: user pays 7 ₽ / vote. After VK cut we net ~5 ₽ / vote ≈ $0.055.
 *   votes = ceil(sell_net / 0.055)
 *   1 vote = 10 notes
 */
export const NOTES_PER_VOTE = 10;

export type PaidKind = "lyrics" | "generate" | "minus" | "cover";

export const NOTE_PRICE: Record<PaidKind, number> = {
  lyrics: 10,
  generate: 50,
  minus: 30,
  cover: 50,
};

export const NOTE_LABEL: Record<PaidKind, string> = {
  lyrics: "Стихи Suno",
  generate: "Сварить трек",
  minus: "Снять минус",
  cover: "Кавер",
};

export type NotePack = {
  id: string;
  notes: number;
  votes: number;
  title: string;
  hint: string;
};

export const NOTE_PACKS: NotePack[] = [
  { id: "pack_30", notes: 30, votes: 3, title: "30 нот", hint: "минус или стихи" },
  { id: "pack_80", notes: 80, votes: 8, title: "80 нот", hint: "трек + минус" },
  { id: "pack_160", notes: 160, votes: 16, title: "160 нот", hint: "два трека" },
  { id: "pack_400", notes: 400, votes: 40, title: "400 нот", hint: "стол на вечер" },
];

export function packById(id: string) {
  return NOTE_PACKS.find((p) => p.id === id) ?? null;
}

export function cookCost() {
  return NOTE_PRICE.lyrics + NOTE_PRICE.generate + NOTE_PRICE.minus;
}
