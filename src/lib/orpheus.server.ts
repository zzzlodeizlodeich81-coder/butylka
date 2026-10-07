import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spendPurse } from "@/lib/purse.server";

type Seat = { id: string; name: string; photo: string; points: number };
type Window = { id: string; name: string; photo: string; vote?: "yes" | "no" };
type Table = { seats: Seat[]; turn: number; phase: "wait" | "vote"; windows: Window[]; spunAt: number };

type Book = { tables: Record<string, Table> };

function empty(): Table {
  return { seats: [], turn: 0, phase: "wait", windows: [], spunAt: 0 };
}

function filePath() {
  return join(process.cwd(), "data", "orpheus.json");
}

async function readBook(): Promise<Book> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as Book;
    if (!parsed || typeof parsed.tables !== "object") return { tables: {} };
    return parsed;
  } catch {
    return { tables: {} };
  }
}

async function writeBook(book: Book) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(book));
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

function nextTurn(table: Table, from: number) {
  if (!table.seats.length) return 0;
  for (let step = 1; step <= table.seats.length; step++) {
    const index = (from + step) % table.seats.length;
    if (table.seats[index].points > 0) return index;
  }
  return from;
}

function score(table: Table) {
  const windows = table.windows;
  if (!windows.length || windows.some((item) => !item.vote)) return;
  const allYes = windows.every((item) => item.vote === "yes");
  const seen = new Set<string>();
  for (const item of windows) {
    if (seen.has(item.id)) continue;
    seen.add(item.id);
    const seat = table.seats.find((row) => row.id === item.id);
    if (!seat) continue;
    const mine = windows.filter((row) => row.id === item.id);
    const refused = mine.some((row) => row.vote === "no");
    if (refused) seat.points = Math.max(0, seat.points - 1);
    else seat.points += allYes ? 2 : 1;
  }
  table.phase = "wait";
  table.windows = [];
  table.turn = nextTurn(table, table.turn);
}

export async function runOrpheus(input: {
  op: string;
  plot: string;
  who: { id: string; name: string; photo: string };
  vote?: string;
  points?: number;
}) {
  const plot = input.plot.replace(/[^\w-]/g, "").slice(0, 40) || "annuch";
  return locked(async () => {
    const book = await readBook();
    const table = book.tables[plot] || empty();
    book.tables[plot] = table;
    const me = input.who;

    if (input.op === "sit") {
      if (!table.seats.some((seat) => seat.id === me.id)) {
        table.seats.push({ id: me.id, name: me.name, photo: me.photo, points: 15 });
      }
      await writeBook(book);
    }

    if (input.op === "spin") {
      const live = table.seats.filter((seat) => seat.points > 0);
      const actor = table.seats[table.turn];
      if (!actor || actor.id !== me.id) return { ok: false as const, error: "Сейчас не твоя очередь.", table };
      if (actor.points <= 0) return { ok: false as const, error: "Баллы кончились.", table };
      if (table.phase !== "wait") return { ok: false as const, error: "Сначала пусть карточки решат.", table };
      if (!live.length) return { ok: false as const, error: "За столом никого.", table };
      table.windows = [0, 1, 2].map(() => {
        const pick = live[Math.floor(Math.random() * live.length)];
        return { id: pick.id, name: pick.name, photo: pick.photo };
      });
      table.phase = "vote";
      table.spunAt = Date.now();
      await writeBook(book);
    }

    if (input.op === "vote") {
      const vote = input.vote === "no" ? "no" : "yes";
      let touched = false;
      for (const item of table.windows) {
        if (item.id === me.id && !item.vote) {
          item.vote = vote;
          touched = true;
        }
      }
      if (!touched) return { ok: false as const, error: "Тебя в окошках нет.", table };
      score(table);
      await writeBook(book);
    }

    if (input.op === "buy") {
      const count = Math.max(1, Math.min(30, Math.round(Number(input.points) || 1)));
      const paid = await spendPurse(me.id, count);
      if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes, table };
      const seat = table.seats.find((row) => row.id === me.id);
      if (seat) seat.points += count;
      else table.seats.push({ id: me.id, name: me.name, photo: me.photo, points: count });
      await writeBook(book);
      return { ok: true as const, table, notes: paid.notes, me: me.id };
    }

    return { ok: true as const, table, me: me.id };
  });
}
