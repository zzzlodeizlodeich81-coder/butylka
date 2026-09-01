import { FOLK_RAW, type FolkRegion } from "@/lib/folk-songs";

export type Genre =
  | "synthpop"
  | "ballad"
  | "disco"
  | "rnb"
  | "indie"
  | "hyperpop"
  | "lofi"
  | "folk";

export type SongPack = "studio" | "folk" | "mine";

export type LyricLine = {
  t: number;
  duration: number;
  text: string;
};

export type Song = {
  id: string;
  title: string;
  artist: string;
  genre: Genre;
  bpm: number;
  key: number;
  mood: string;
  lines: LyricLine[];
  audioUrl?: string;
  audioDuration?: number;
  generated?: boolean;
  minus?: boolean;
  pack?: SongPack;
  region?: FolkRegion;
};

export const GENRE_LABEL: Record<Genre, string> = {
  synthpop: "синтпоп",
  ballad: "баллада",
  disco: "диско",
  rnb: "r&b",
  indie: "инди",
  hyperpop: "гиперпоп",
  lofi: "лофай",
  folk: "народная",
};

export const GENRES: Genre[] = [
  "synthpop",
  "ballad",
  "disco",
  "rnb",
  "indie",
  "hyperpop",
  "lofi",
  "folk",
];

export function timeLyrics(
  texts: string[],
  bpm: number,
  beatsPerLine = 8,
  introBeats = 8,
): LyricLine[] {
  const beat = 60 / bpm;
  const duration = beatsPerLine * beat;
  return texts.map((text, i) => ({
    t: (introBeats + i * beatsPerLine) * beat,
    duration,
    text,
  }));
}

export function timeLyricsToFit(texts: string[], totalSec: number): LyricLine[] {
  const intro = Math.min(4, totalSec * 0.08);
  const outro = Math.min(2, totalSec * 0.04);
  const usable = Math.max(texts.length * 1.2, totalSec - intro - outro);
  const duration = usable / Math.max(1, texts.length);
  return texts.map((text, i) => ({
    t: intro + i * duration,
    duration,
    text,
  }));
}

export function songDuration(song: Song) {
  if (song.audioDuration && song.audioDuration > 0) return song.audioDuration;
  const last = song.lines[song.lines.length - 1];
  if (!last) return 24;
  return last.t + last.duration + 1.6;
}

export function buildSong(input: {
  id: string;
  title: string;
  artist: string;
  genre: Genre;
  bpm: number;
  key?: number;
  mood: string;
  texts: string[];
  audioUrl?: string;
  audioDuration?: number;
  generated?: boolean;
  minus?: boolean;
  pack?: SongPack;
  region?: FolkRegion;
  beatsPerLine?: number;
  lines?: LyricLine[];
}): Song {
  const lines = input.lines?.length
    ? input.lines
    : input.audioDuration
      ? timeLyricsToFit(input.texts, input.audioDuration)
      : timeLyrics(input.texts, input.bpm, input.beatsPerLine ?? 8);
  return {
    id: input.id,
    title: input.title,
    artist: input.artist,
    genre: input.genre,
    bpm: input.bpm,
    key: input.key ?? 57,
    mood: input.mood,
    lines,
    audioUrl: input.audioUrl,
    audioDuration: input.audioDuration,
    generated: input.generated,
    minus: input.minus,
    pack: input.pack,
    region: input.region,
  };
}

const STUDIO_RAW: Array<{
  id: string;
  title: string;
  artist: string;
  genre: Genre;
  bpm: number;
  key: number;
  mood: string;
  texts: string[];
}> = [
  {
    id: "polvtorogo",
    title: "Полвторого",
    artist: "модель 7B",
    genre: "synthpop",
    bpm: 118,
    key: 57,
    mood: "ночная кухня",
    texts: [
      "На кухне горит один свет",
      "Холодильник поёт басом",
      "Ты говоришь — пошли уже",
      "Я отвечаю — подожди",
      "Полвторого, полвторого",
      "Город выключен, мы нет",
      "Полвторого, полвторого",
      "Ключи оставь на столе",
      "За окном ни души",
      "Только мы и проводной",
    ],
  },
  {
    id: "taxi",
    title: "Такси до нигде",
    artist: "пульс-12",
    genre: "disco",
    bpm: 122,
    key: 55,
    mood: "мокрый асфальт",
    texts: [
      "Жёлтый свет в зрачках",
      "Февраль липнет к стеклу",
      "Ты смеёшься в рукав",
      "Я рисую маршрут",
      "Такси до нигде, до нигде",
      "Скажи ему — прямо",
      "Такси до нигде, до нигде",
      "Мы не приедем — и ладно",
      "Счётчик тикает в такт",
      "Сердце громче в сто раз",
    ],
  },
  {
    id: "sol",
    title: "Соль на губах",
    artist: "тихий канал",
    genre: "rnb",
    bpm: 92,
    key: 53,
    mood: "флирт",
    texts: [
      "Не целуй — я в гриме",
      "Не звони — я в лифте",
      "Соль на губах от чипсов",
      "И от глупых новостей",
      "Если это любовь",
      "Пусть будет короткой",
      "Если это любовь",
      "Пусть будет громкой",
      "Свет в прихожей не жги",
      "Я найду дверь сама",
    ],
  },
  {
    id: "lift",
    title: "Лифт без кнопок",
    artist: "воксель",
    genre: "indie",
    bpm: 104,
    key: 50,
    mood: "город",
    texts: [
      "Едем между этажами",
      "Где никто не живёт",
      "Твоя куртка на поручне",
      "Мой метроном в груди",
      "Лифт без кнопок, без кнопок",
      "Выбери уже этаж",
      "Лифт без кнопок, без кнопок",
      "Мы застряли на «сейчас»",
      "Зеркало врёт спокойно",
      "Мы врём ещё тише",
    ],
  },
  {
    id: "okno",
    title: "Окно на пятом",
    artist: "комната 14",
    genre: "ballad",
    bpm: 76,
    key: 52,
    mood: "тоска",
    texts: [
      "Окно на пятом не спит",
      "Кто-то сушит бельё в январе",
      "Я считаю вагоны внизу",
      "Ты считаешь причины уйти",
      "Если я позову",
      "Ты сделаешь вид что ветер",
      "Если я позову",
      "Пусть хотя бы моргнёт лифт",
      "Город держит паузу",
      "Мы не знаем слов дальше",
    ],
  },
  {
    id: "beton",
    title: "Бетон и неон",
    artist: "SUN-комната",
    genre: "hyperpop",
    bpm: 138,
    key: 60,
    mood: "вечеринка",
    texts: [
      "Бетон, неон, ещё громче",
      "Сердце как кэш на диске",
      "Ты в этом свете дешевле",
      "Я в этом свете дороже",
      "Не лови меня глазами",
      "Лови меня басом",
      "Не лови меня глазами",
      "Завтра всё равно стёрто",
      "Бетон, неон, ещё",
      "Пока батарея жива",
    ],
  },
  {
    id: "chai",
    title: "Чай в три ночи",
    artist: "низкий бит",
    genre: "lofi",
    bpm: 84,
    key: 55,
    mood: "кухня",
    texts: [
      "Чай в три ночи остыл",
      "Паркет помнит наши шаги",
      "Ты листаешь старый чат",
      "Я слушаю кипение",
      "Не надо умных фраз",
      "Налей ещё чуть-чуть",
      "Не надо умных фраз",
      "Пусть ночь сама решит",
      "За стеной кто-то живёт",
      "И нам можно тише",
    ],
  },
  {
    id: "ne-zvoni",
    title: "Не звони вчера",
    artist: "версия 0.9",
    genre: "disco",
    bpm: 126,
    key: 57,
    mood: "абсурд",
    texts: [
      "Не звони вчера, я занят",
      "Календарь пошёл назад",
      "Твоё имя в пропущенных",
      "Как будто это план",
      "Не звони вчера, не звони",
      "Автоответчик устал",
      "Не звони вчера, не звони",
      "Я ещё не родился там",
      "Завтра будет вторник",
      "А мы всё ещё в пятницу",
    ],
  },
  {
    id: "palto",
    title: "Пальто на вешалке",
    artist: "сквозняк",
    genre: "indie",
    bpm: 110,
    key: 48,
    mood: "флирт",
    texts: [
      "Пальто на вешалке ждёт",
      "Ты говоришь «я на минуту»",
      "Минута знает нас лучше",
      "Чем все длинные годы",
      "Останься до лифта",
      "Останься до утра",
      "Останься до лифта",
      "Потом решай на ходу",
      "Прихожая слишком узкая",
      "Чтобы сказать «пока»",
    ],
  },
  {
    id: "skrip",
    title: "Скрип паркета",
    artist: "восемь стульев",
    genre: "synthpop",
    bpm: 114,
    key: 53,
    mood: "вечеринка",
    texts: [
      "Скрип паркета — наш хор",
      "Соседи снизу в такт",
      "Бутылка крутит судьбу",
      "Как дешёвый барабан",
      "Кто поёт — тот живой",
      "Кто молчит — тот следующий",
      "Кто поёт — тот живой",
      "Микрофон не прощает",
      "Ночь короткая очень",
      "Давайте ещё круг",
    ],
  },
];

export const STUDIO: Song[] = STUDIO_RAW.map((s) => buildSong({ ...s, pack: "studio" }));

export const FOLK: Song[] = FOLK_RAW.map((s) =>
  buildSong({
    ...s,
    genre: "folk",
    pack: "folk",
  }),
);

export const CATALOG: Song[] = [...FOLK, ...STUDIO];

export function pickThree(pool: Song[], excludeId?: string, fillFromCatalog = true): Song[] {
  const src = pool.filter((s) => s.id !== excludeId);
  const shuffled = [...src].sort(() => Math.random() - 0.5);
  const picked = shuffled.slice(0, 3);
  if (picked.length < 3 && fillFromCatalog) {
    const extra = [...CATALOG].sort(() => Math.random() - 0.5);
    for (const s of extra) {
      if (picked.length >= 3) break;
      if (!picked.some((p) => p.id === s.id)) picked.push(s);
    }
  }
  return picked;
}

export function pickTableThree(custom: Song[], excludeId?: string): Song[] {
  const live = custom.filter((s) => Boolean(s.audioUrl));
  if (live.length) return pickThree(live, excludeId, false);
  const folkOne = pickThree(FOLK, excludeId)[0];
  const rest = pickThree(STUDIO, excludeId).filter((s) => s.id !== folkOne?.id);
  return [folkOne, ...rest].filter(Boolean).slice(0, 3) as Song[];
}

export function parseGenre(value: string): Genre {
  return GENRES.includes(value as Genre) ? (value as Genre) : "indie";
}
