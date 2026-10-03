/**
 * Ноты. 1 голос ВК = 7 ₽ с пользователя = 10 нот.
 * Кредит sunoapi.org: пакет $5 / 1000 = $0.005.
 * 12 кредитов генерации ≈ чуть меньше 6 ₽ (курс владельца). Берём 5.7 ₽ / 12.
 *
 * Генерация (2 трека, 12 кр.) — цена как у конкурентов, ~19 ₽.
 * Голос ВК только по 7 ₽, поэтому 3 голоса = 21 ₽.
 *
 * Допы: наценка 200% (цена ≈ 3× себестоимости), округление до голоса вверх.
 *   стихи     ~2 кр.   ~1 ₽   → 1 голос  (7 ₽)
 *   минус     10 кр.   4.8 ₽  → 2 голоса (14 ₽)
 *   кавер     12 кр.   5.7 ₽  → 3 голоса (21 ₽)
 *   стемы     50 кр.  23.8 ₽  → 11 голосов (77 ₽)
 *   grok      $0.02    ~2 ₽   → 2 голоса (14 ₽), старая цена картинки
 *   ролик 5с  $0.05/с  ~24 ₽  → 6 голосов (42 ₽), 480p
 *   ролик 10с          ~48 ₽  → 11 голосов (77 ₽)
 *   ролик 15с          ~71 ₽  → 16 голосов (112 ₽)
 * Тайминги (0.5 кр.) в цену генерации не входят отдельно.
 */
export const NOTES_PER_VOTE = 10;

export type PaidKind = "lyrics" | "generate" | "minus" | "stems" | "cover" | "grok" | "art" | "video5" | "video10" | "video15" | "host";

export const NOTE_PRICE: Record<PaidKind, number> = {
  lyrics: 10,
  generate: 30,
  minus: 20,
  stems: 110,
  cover: 30,
  grok: 20,
  art: 10,
  video5: 60,
  video10: 110,
  video15: 160,
  host: 10,
};

export const NOTE_LABEL: Record<PaidKind, string> = {
  lyrics: "Стихи",
  generate: "Два трека",
  minus: "Минус",
  stems: "Стемы",
  cover: "Кавер",
  grok: "Картинка Grok",
  art: "Картинка Яндекс",
  video5: "Ролик 5 сек",
  video10: "Ролик 10 сек",
  video15: "Ролик 15 сек",
  host: "Хозяин особняка",
};

export type NotePack = {
  id: string;
  notes: number;
  votes: number;
  title: string;
  hint: string;
};

export const NOTE_PACKS: NotePack[] = [
  { id: "pack_30", notes: 30, votes: 3, title: "30 нот", hint: "два трека · 21 ₽" },
  { id: "pack_60", notes: 60, votes: 6, title: "60 нот", hint: "трек, стихи, минус" },
  { id: "pack_110", notes: 110, votes: 11, title: "110 нот", hint: "стемы" },
  { id: "pack_240", notes: 240, votes: 24, title: "240 нот", hint: "вечер за столом" },
];

export function packById(id: string) {
  return NOTE_PACKS.find((p) => p.id === id) ?? null;
}

export function videoNotes(seconds: number) {
  if (seconds <= 5) return NOTE_PRICE.video5;
  if (seconds <= 10) return NOTE_PRICE.video10;
  return NOTE_PRICE.video15;
}

export function cookCost() {
  return NOTE_PRICE.lyrics + NOTE_PRICE.generate + NOTE_PRICE.minus;
}
