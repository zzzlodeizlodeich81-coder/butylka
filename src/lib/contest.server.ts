import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NOTE_PRICE } from "@/lib/notes";
import { addPurse, isAdminLogin, readPurse, spendPurse } from "@/lib/purse.server";

const PASS = 10;
const AUDIO_MAX = 25 * 1024 * 1024;

type Entry = {
  id: string;
  owner: string;
  artist: string;
  title: string;
  lyrics: string;
  at: number;
  month: string;
  ext: string;
  votes: string[];
  songId?: string;
};

type Book = { entries: Entry[]; ranks: Record<string, number> };

function dir() {
  return join(process.cwd(), "data", "contest");
}

function bookFile() {
  return join(dir(), "book.json");
}

function monthKey(at = Date.now()) {
  const parts = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow", year: "numeric", month: "2-digit" }).format(at);
  return parts.slice(0, 7);
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
    const parsed = JSON.parse(await readFile(bookFile(), "utf8")) as Book;
    if (!parsed || !Array.isArray(parsed.entries)) return { entries: [], ranks: {} };
    return { entries: parsed.entries, ranks: parsed.ranks || {} };
  } catch {
    return { entries: [], ranks: {} };
  }
}

async function writeBook(book: Book) {
  await mkdir(dir(), { recursive: true });
  await writeFile(bookFile(), JSON.stringify(book));
}

function places(entries: Entry[]) {
  const months = new Map<string, Entry[]>();
  for (const row of entries) {
    const list = months.get(row.month) || [];
    list.push(row);
    months.set(row.month, list);
  }
  const flag = new Map<string, { place: number; passed: boolean }>();
  for (const list of months.values()) {
    const ranked = [...list].sort((a, b) => b.votes.length - a.votes.length || a.at - b.at);
    ranked.forEach((row, index) => {
      flag.set(row.id, { place: index + 1, passed: index < PASS && row.votes.length > 0 });
    });
  }
  return flag;
}

function viewOf(book: Book, me: string, admin: boolean) {
  const month = monthKey();
  const flag = places(book.entries);
  const entries = [...book.entries]
    .map((row) => {
      const spot = flag.get(row.id) || { place: 0, passed: false };
      return {
        id: row.id,
        artist: row.artist,
        title: row.title,
        votes: row.votes.length,
        voted: row.votes.includes(me),
        mine: row.owner === me,
        month: row.month,
        place: spot.place,
        passed: spot.passed,
        songId: row.songId || "",
        lyrics: admin ? row.lyrics : "",
      };
    })
    .sort((a, b) => Number(b.month === month) - Number(a.month === month) || a.place - b.place);
  return {
    month,
    taken: book.entries.filter((row) => row.month === month).length,
    rank: book.ranks[me] || 0,
    price: NOTE_PRICE.contest,
    entries,
  };
}

export async function contestView(me: string, admin: boolean) {
  const book = await readBook();
  return viewOf(book, me, admin);
}

export async function contestFile(id: string, part: "audio" | "cover") {
  const book = await readBook();
  const row = book.entries.find((item) => item.id === id);
  if (!row) return null;
  const name = part === "cover" ? `${id}.jpg` : `${id}${row.ext}`;
  try {
    const body = await readFile(join(dir(), name));
    const type =
      part === "cover"
        ? "image/jpeg"
        : row.ext === ".wav"
          ? "audio/wav"
          : row.ext === ".ogg"
            ? "audio/ogg"
            : row.ext === ".flac"
              ? "audio/flac"
              : row.ext === ".m4a"
                ? "audio/mp4"
                : "audio/mpeg";
    return { body, type, filename: `${row.artist} — ${row.title}${part === "cover" ? ".jpg" : row.ext}` };
  } catch {
    return null;
  }
}

export async function submitContest(input: {
  guestId: string;
  artist: string;
  title: string;
  lyrics: string;
  audio: Buffer;
  ext: string;
  cover: Buffer;
  songId?: string;
}) {
  return locked(async () => {
    const artist = input.artist.replace(/\s+/g, " ").trim().slice(0, 60);
    const title = input.title.replace(/\s+/g, " ").trim().slice(0, 80);
    const lyrics = input.lyrics.trim().slice(0, 8000);
    if (!artist || !title || lyrics.length < 2) return { ok: false as const, error: "Нужны имя, название и текст." };
    if (input.audio.length < 800 || input.audio.length > AUDIO_MAX) return { ok: false as const, error: "Трек пустой или больше 25 МБ." };
    if (input.cover.length < 80) return { ok: false as const, error: "Нужна квадратная картинка." };
    const book = await readBook();
    const songId = (input.songId || "").slice(0, 80);
    if (!songId) return { ok: false as const, error: "Сначала выбери свой трек у шарманщика." };
    let foreign = false;
    try {
      const board = JSON.parse(await readFile(join(process.cwd(), "data", "yard-board.json"), "utf8")) as {
        songs?: { id?: string; vk?: string }[];
      };
      const song = board.songs?.find((row) => row.id === songId);
      foreign = Boolean(song?.vk && song.vk !== input.guestId);
    } catch {
      foreign = false;
    }
    if (foreign) return { ok: false as const, error: "Чужой трек на конкурс не отправить." };
    if (book.entries.some((row) => row.songId === songId)) {
      return { ok: false as const, error: "Этот трек уже на конкурсе." };
    }
    const month = monthKey();
    const paid = await spendPurse(input.guestId, NOTE_PRICE.contest);
    if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
    const id = crypto.randomUUID();
    const ext = /^\.(mp3|wav|flac|m4a|ogg|aac|wma|aiff|aif)$/i.test(input.ext) ? input.ext.toLowerCase() : ".bin";
    try {
      await mkdir(dir(), { recursive: true });
      await writeFile(join(dir(), `${id}${ext}`), input.audio);
      await writeFile(join(dir(), `${id}.jpg`), input.cover);
      book.entries.push({ id, owner: input.guestId, artist, title, lyrics, at: Date.now(), month, ext, votes: [], songId });
      await writeBook(book);
    } catch {
      const back = await addPurse(input.guestId, NOTE_PRICE.contest);
      return { ok: false as const, error: "Файл не лёг на диск. Ноты вернул.", notes: back?.notes ?? paid.notes + NOTE_PRICE.contest };
    }
    return { ok: true as const, notes: paid.notes, ...viewOf(book, input.guestId, false) };
  });
}

export async function voteContest(guestId: string, id: string) {
  return locked(async () => {
    const book = await readBook();
    const row = book.entries.find((item) => item.id === id);
    if (!row) return { ok: false as const, error: "Трека уже нет." };
    if (row.owner === guestId) return { ok: false as const, error: "За свой трек статус не растёт." };
    if (row.votes.includes(guestId)) return { ok: true as const, ...viewOf(book, guestId, false) };
    row.votes.push(guestId);
    book.ranks[guestId] = (book.ranks[guestId] || 0) + 1;
    await writeBook(book);
    return { ok: true as const, gained: 1 as const, ...viewOf(book, guestId, false) };
  });
}

export async function adminOf(guestId: string) {
  const row = await readPurse(guestId);
  return isAdminLogin(row?.login);
}
