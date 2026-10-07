import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { spendPurse } from "@/lib/purse.server";

type Seat = { id: string; name: string; photo: string; points: number; seen?: number };
type Window = { id: string; name: string; photo: string; vote?: "yes" | "no" };
type Table = { seats: Seat[]; turn: number; phase: "wait" | "vote"; windows: Window[]; spunAt: number; invitedAt?: number; result?: Window[]; cheer?: number };

const BOTS: Seat[] = [
  { id: "bot-mira", name: "Мира", photo: "/bots/mira.jpg", points: 15 },
  { id: "bot-lada", name: "Лада", photo: "/bots/lada.jpg", points: 15 },
  { id: "bot-gleb", name: "Глеб", photo: "/bots/gleb.jpg", points: 15 },
  { id: "bot-mark", name: "Марк", photo: "/bots/mark.jpg", points: 15 },
];

function botId(id: string) {
  return id.startsWith("bot-");
}

function fill(table: Table) {
  const humans = table.seats.filter((seat) => !botId(seat.id));
  const need = Math.max(0, 5 - humans.length);
  const picked: Seat[] = [];
  for (const bot of BOTS) {
    if (picked.length >= need) break;
    const prev = table.seats.find((seat) => seat.id === bot.id);
    picked.push(prev && prev.points > 0 ? prev : { ...bot, points: 15 });
  }
  const current = table.seats[table.turn]?.id;
  table.seats = [...humans, ...picked];
  const found = table.seats.findIndex((seat) => seat.id === current);
  table.turn = found >= 0 ? found : 0;
}

function spinWindows(table: Table) {
  const live = table.seats.filter((seat) => seat.points > 0);
  const pool = [...live];
  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    const swap = pool[i];
    pool[i] = pool[j];
    pool[j] = swap;
  }
  const picked: Seat[] = [];
  for (const seat of pool) {
    if (picked.length === 3) break;
    if (!picked.some((row) => row.id === seat.id)) picked.push(seat);
  }
  if (!picked.length) return false;
  table.windows = picked.map((seat) => ({ id: seat.id, name: seat.name, photo: seat.photo }));
  table.phase = "vote";
  table.spunAt = Date.now();
  table.result = [];
  table.cheer = 0;
  return true;
}

function botsVote(table: Table) {
  if (table.phase !== "vote") return;
  for (const item of table.windows) {
    if (botId(item.id) && !item.vote) item.vote = Math.random() < 0.55 ? "yes" : "no";
  }
  const waiting = table.windows.some((item) => !item.vote && !botId(item.id));
  if (!waiting) score(table);
}

function playBots(table: Table, meId: string) {
  const now = Date.now();
  const current = table.seats[table.turn]?.id;
  table.seats = table.seats.filter((seat) => botId(seat.id) || seat.id === meId || Boolean(seat.seen && now - seat.seen <= 20000));
  const found = table.seats.findIndex((seat) => seat.id === current);
  table.turn = found >= 0 ? found : 0;
  fill(table);
  if (table.phase === "vote") {
    const late = Boolean(table.spunAt && now - table.spunAt >= 15000);
    for (const item of table.windows) {
      if (item.vote || botId(item.id)) continue;
      const still = table.seats.some((seat) => seat.id === item.id);
      if (!still || late) item.vote = "no";
    }
    botsVote(table);
  }
  if (table.phase !== "wait") return;
  for (let step = 0; step < table.seats.length; step++) {
    const actor = table.seats[table.turn];
    const stale = Boolean(actor && !botId(actor.id) && actor.id !== meId && (!actor.seen || now - actor.seen > 20000));
    const broke = Boolean(actor && actor.points <= 0);
    if (!stale && !broke) break;
    table.turn = (table.turn + 1) % table.seats.length;
  }
  if (botId(table.seats[table.turn]?.id || "") && table.seats.some((seat) => seat.points > 0)) spinWindows(table);
}

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
  table.result = windows.map((item) => ({ ...item }));
  table.cheer = allYes ? Date.now() : 0;
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
    }

    fill(table);
    const seatMe = table.seats.find((seat) => seat.id === me.id);
    if (seatMe) seatMe.seen = Date.now();
    playBots(table, me.id);

    if (input.op === "spin") {
      const actor = table.seats[table.turn];
      if (table.phase === "vote") {
        await writeBook(book);
        return { ok: true as const, table, me: me.id };
      }
      if (actor && botId(actor.id)) {
        spinWindows(table);
        await writeBook(book);
        return { ok: true as const, table, me: me.id };
      }
      if (!actor || actor.id !== me.id) return { ok: false as const, error: "Сейчас не твоя очередь.", table };
      if (actor.points <= 0) return { ok: false as const, error: "Баллы кончились.", table };
      const live = table.seats.filter((seat) => seat.points > 0);
      if (live.length < 2) return { ok: false as const, error: "За столом мало карточек.", table };
      spinWindows(table);
      await writeBook(book);
      return { ok: true as const, table, me: me.id };
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
      botsVote(table);
      await writeBook(book);
      return { ok: true as const, table, me: me.id };
    }

    if (input.op === "invite") {
      const { plotById, chatRooms } = await import("@/lib/lands.server");
      const { broadcastInvite } = await import("@/lib/yard-board");
      const hostPlot = await plotById(plot);
      const named = me.name.trim().toLowerCase();
      const yard = (hostPlot?.name || "").trim().toLowerCase();
      const sameName = named.length > 2 && (yard.includes(named) || named.includes(yard));
      const allowed = Boolean(hostPlot && (hostPlot.ownerId === me.id || hostPlot.members.includes(me.id) || sameName));
      if (!hostPlot || !allowed) return { ok: false as const, error: "Звать может хозяйка двора.", table };
      if (table.invitedAt && Date.now() - table.invitedAt < 10 * 60 * 1000) {
        return { ok: false as const, error: "Уже звала. Следующий раз через несколько минут.", table };
      }
      const line = `{{invite}}${hostPlot.name} приглашает поиграть`;
      await broadcastInvite(await chatRooms(), line, hostPlot.name);
      table.invitedAt = Date.now();
      await writeBook(book);
      return { ok: true as const, table, me: me.id };
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

    await writeBook(book);
    return { ok: true as const, table, me: me.id };
  });
}
