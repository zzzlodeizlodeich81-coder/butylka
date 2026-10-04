import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { addPurse, currentGuest, readPurse, spendPurse } from "@/lib/purse.server";

const DAY = 24 * 3600 * 1000;
const CLEAN = 2;
const FENCE = 10;
const STAKE = 200;
const LADDER = [80, 150, 250, 400, 600, 800, 1000];

type Ask = { q: string; options: string[]; ok: number };
type Yard = { next: number; pile: number; fence: number };
type Play = { step: number; bank: number; free: boolean; asks: Ask[] };
type Book = { yards: Record<string, Yard>; free: Record<string, boolean>; used: Record<string, boolean>; play: Record<string, Play> };

const EASY: Ask[] = [
  { q: "Сколько струн у обычной гитары?", options: ["Четыре", "Пять", "Шесть", "Восемь"], ok: 2 },
  { q: "Кто написал цикл «Времена года»?", options: ["Бах", "Вивальди", "Шопен", "Лист"], ok: 1 },
  { q: "Откуда группа The Beatles?", options: ["Лондон", "Манчестер", "Ливерпуль", "Глазго"], ok: 2 },
  { q: "Как зовут вокалиста Queen?", options: ["Мик Джаггер", "Фредди Меркьюри", "Роберт Плант", "Роджер Долтри"], ok: 1 },
  { q: "Родина танго?", options: ["Испания", "Куба", "Аргентина", "Италия"], ok: 2 },
  { q: "Сколько клавиш у полного рояля?", options: ["76", "84", "88", "92"], ok: 2 },
  { q: "Знак, который повышает ноту на полтона?", options: ["Бемоль", "Бекар", "Диез", "Фермата"], ok: 2 },
  { q: "Кто солистка, которую все узнают по песне «Rolling in the Deep»?", options: ["Адель", "Даффи", "Сиа", "Пинк"], ok: 0 },
];

const HARD: Ask[] = [
  { q: "В каком году впервые вручили «Грэмми»?", options: ["1954", "1959", "1964", "1969"], ok: 1 },
  { q: "Кто написал либретто «Женитьбы Фигаро» Моцарта?", options: ["Метастазио", "Лоренцо да Понте", "Скриб", "Гофмансталь"], ok: 1 },
  { q: "Частота ля первой октавы по камертону?", options: ["432 Гц", "440 Гц", "444 Гц", "415 Гц"], ok: 1 },
  { q: "Кто дирижировал премьерой «Весны священной»?", options: ["Пьер Монтё", "Тосканини", "Караян", "Мравинский"], ok: 0 },
  { q: "Настоящее имя Элвиса Костелло?", options: ["Деклан Макманус", "Гордон Самнер", "Пол Хьюсон", "Дэвид Джонс"], ok: 0 },
  { q: "В каком году вышел первый коммерческий компакт-диск?", options: ["1979", "1982", "1985", "1988"], ok: 1 },
  { q: "Кто основал лейбл Motown?", options: ["Берри Горди", "Ахмет Эртегюн", "Клайв Дэвис", "Сэм Филлипс"], ok: 0 },
  { q: "Год смерти Шостаковича?", options: ["1971", "1973", "1975", "1977"], ok: 2 },
  { q: "Кто написал «Картинки с выставки»?", options: ["Римский-Корсаков", "Мусоргский", "Бородин", "Балакирев"], ok: 1 },
  { q: "Премьера «Щелкунчика» Чайковского?", options: ["1888", "1890", "1892", "1895"], ok: 2 },
  { q: "Первый звуковой фильм «Певец джаза» вышел в?", options: ["1925", "1927", "1929", "1931"], ok: 1 },
  { q: "В каком году умер Моцарт?", options: ["1789", "1791", "1795", "1801"], ok: 1 },
  { q: "Кто написал музыку гимна России?", options: ["Глинка", "Александров", "Шостакович", "Дунаевский"], ok: 1 },
  { q: "Альбом Led Zeppelin I вышел в?", options: ["1967", "1968", "1969", "1971"], ok: 2 },
  { q: "Опера «Борис Годунов» — чья?", options: ["Чайковский", "Римский-Корсаков", "Мусоргский", "Глинка"], ok: 2 },
  { q: "Как называется самая низкая струна скрипки?", options: ["Ми", "Ля", "Ре", "Соль"], ok: 3 },
];

function filePath() {
  return join(process.cwd(), "data", "gollum.json");
}

let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

async function readBook(): Promise<Book> {
  try {
    const raw = JSON.parse(await readFile(filePath(), "utf8")) as Book;
    return {
      yards: raw.yards || {},
      free: raw.free || {},
      used: raw.used || {},
      play: raw.play || {},
    };
  } catch {
    return { yards: {}, free: {}, used: {}, play: {} };
  }
}

async function writeBook(book: Book) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(book));
}

function pick<T>(list: T[], n: number) {
  const pool = [...list];
  const out: T[] = [];
  while (out.length < n && pool.length) {
    const index = Math.floor(Math.random() * pool.length);
    out.push(pool.splice(index, 1)[0]);
  }
  return out;
}

function localAsks() {
  return [...pick(EASY, 2), ...pick(HARD, 5)];
}

async function askModel() {
  const yandexKey = process.env.YANDEX_API_KEY || "";
  const folder = process.env.YANDEX_FOLDER_ID || "";
  if (!yandexKey || !folder) return localAsks();
  const system =
    "Ты ведущий викторины по истории музыки. Верни только JSON-массив из 7 объектов, без пояснений. Поля: q (вопрос по-русски), options (ровно 4 строки), ok (индекс верного, 0-3). Первые два вопроса лёгкие, их знает почти любой. Последние пять очень трудные: редкие даты, имена, факты, без подвоха и без выдумки. Не повторяй одни и те же вопросы.";
  try {
    const res = await fetch("https://llm.api.cloud.yandex.net/foundationModels/v1/completion", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Api-Key ${yandexKey}`,
        "x-folder-id": folder,
      },
      body: JSON.stringify({
        modelUri: `gpt://${folder}/${process.env.YANDEX_MODEL || "yandexgpt-lite"}/latest`,
        completionOptions: { stream: false, temperature: 0.9, maxTokens: "1800" },
        messages: [
          { role: "system", text: system },
          { role: "user", text: "Новая игра. Другие вопросы, не прошлые." },
        ],
      }),
    });
    if (!res.ok) return localAsks();
    const data = (await res.json()) as { result?: { alternatives?: { message?: { text?: string } }[] } };
    const text = data.result?.alternatives?.[0]?.message?.text || "";
    const start = text.indexOf("[");
    const end = text.lastIndexOf("]");
    if (start < 0 || end <= start) return localAsks();
    const parsed = JSON.parse(text.slice(start, end + 1)) as { q?: string; options?: string[]; ok?: number }[];
    const asks = parsed
      .map((row) => ({
        q: String(row.q || "").trim().slice(0, 180),
        options: Array.isArray(row.options) ? row.options.map((item) => String(item).trim().slice(0, 80)).slice(0, 4) : [],
        ok: Number(row.ok),
      }))
      .filter((row) => row.q && row.options.length === 4 && row.ok >= 0 && row.ok <= 3);
    return asks.length === 7 ? asks : localAsks();
  } catch {
    return localAsks();
  }
}

function view(play: Play | undefined) {
  if (!play) return { playing: false as const };
  const ask = play.asks[play.step];
  if (!ask) return { playing: false as const, bank: play.bank };
  return {
    playing: true as const,
    step: play.step + 1,
    total: play.asks.length,
    q: ask.q,
    options: ask.options,
    bank: play.bank,
    safe: play.step >= 2 ? 150 : 0,
  };
}

function gap() {
  return (3 + Math.floor(Math.random() * 2)) * DAY;
}

export async function runGollum(data: { action: string; room?: string; pick?: number }) {
  const guest = currentGuest();
  if (!guest) return { ok: false as const, error: "Сначала зайди.", notes: 0 };
  return locked(async () => {
    const book = await readBook();
    const now = Date.now();
    const room = (data.room || "").slice(0, 16);

    if (data.action === "pile" || data.action === "clean" || data.action === "fence") {
      const row = book.yards[room] || { next: 0, pile: 0, fence: 0 };
      if (row.fence > now) row.pile = 0;
      else if (row.pile && row.pile <= now) row.pile = 0;
      if (data.action === "clean") {
        if (!(row.pile > now)) {
          const purse = await readPurse(guest.id);
          return { ok: false as const, error: "Уже чисто.", notes: purse?.notes ?? 0 };
        }
        const paid = await spendPurse(guest.id, CLEAN);
        if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
        row.pile = 0;
        book.yards[room] = row;
        await writeBook(book);
        return { ok: true as const, notes: paid.notes, pile: false };
      }
      if (data.action === "fence") {
        const paid = await spendPurse(guest.id, FENCE);
        if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
        row.pile = 0;
        row.fence = now + 30 * DAY;
        row.next = row.fence;
        book.yards[room] = row;
        await writeBook(book);
        return { ok: true as const, notes: paid.notes, pile: false };
      }
      if (!row.fence || row.fence <= now) {
        if (!row.next) {
          row.pile = now + DAY;
          row.next = row.pile + gap();
        } else if (now >= row.next && !(row.pile > now)) {
          row.pile = now + DAY;
          row.next = row.pile + gap();
        }
      }
      book.yards[room] = row;
      await writeBook(book);
      const purse = await readPurse(guest.id);
      return { ok: true as const, notes: purse?.notes ?? 0, pile: row.pile > now };
    }

    if (data.action === "ring") {
      if (book.used[guest.id]) return { ok: true as const, free: false, notes: (await readPurse(guest.id))?.notes ?? 0 };
      book.free[guest.id] = true;
      await writeBook(book);
      return { ok: true as const, free: true, notes: (await readPurse(guest.id))?.notes ?? 0 };
    }

    if (data.action === "play") {
      if (book.play[guest.id]) return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0, ...view(book.play[guest.id]) };
      const gift = Boolean(book.free[guest.id] && !book.used[guest.id]);
      let notes = (await readPurse(guest.id))?.notes ?? 0;
      if (!gift) {
        const paid = await spendPurse(guest.id, STAKE);
        if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
        notes = paid.notes;
      } else {
        book.used[guest.id] = true;
        book.free[guest.id] = false;
      }
      const asks = await askModel();
      book.play[guest.id] = { step: 0, bank: 0, free: gift, asks };
      await writeBook(book);
      return { ok: true as const, notes, free: gift, ...view(book.play[guest.id]) };
    }

    const play = book.play[guest.id];
    if (!play) return { ok: false as const, error: "Игры нет.", notes: 0 };

    if (data.action === "take") {
      const prize = play.bank;
      delete book.play[guest.id];
      await writeBook(book);
      const row = prize ? await addPurse(guest.id, prize) : await readPurse(guest.id);
      return { ok: true as const, notes: row?.notes ?? 0, prize, done: true };
    }

    if (data.action === "pick") {
      const ask = play.asks[play.step];
      if (!ask) return { ok: false as const, error: "Вопросы кончились.", notes: 0 };
      const right = Number(data.pick) === ask.ok;
      if (!right) {
        const prize = play.step >= 2 ? 150 : 0;
        delete book.play[guest.id];
        await writeBook(book);
        const row = prize ? await addPurse(guest.id, prize) : await readPurse(guest.id);
        return { ok: true as const, notes: row?.notes ?? 0, right: false, prize, done: true };
      }
      play.bank = LADDER[play.step] || 1000;
      play.step += 1;
      if (play.step >= play.asks.length) {
        const prize = play.bank;
        delete book.play[guest.id];
        await writeBook(book);
        const row = await addPurse(guest.id, prize);
        return { ok: true as const, notes: row?.notes ?? 0, right: true, prize, done: true };
      }
      book.play[guest.id] = play;
      await writeBook(book);
      const purse = await readPurse(guest.id);
      return { ok: true as const, notes: purse?.notes ?? 0, right: true, ...view(play) };
    }

    return { ok: false as const, error: "Не понял.", notes: 0 };
  });
}
