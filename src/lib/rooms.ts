import { createServerFn } from "@tanstack/react-start";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { addPurse, currentGuest, readPurse, spendPurse } from "@/lib/purse.server";

const STAKE = 2;
const HUNT_PAY = 5;
const SYMBOLS = ["dust", "note", "moon", "skull", "frame"] as const;
type SymbolId = (typeof SYMBOLS)[number];

type BoxRound = { win: number; due?: boolean };
type Book = {
  hunts?: Record<string, string>;
  bandits?: Record<string, string>;
  prizes?: Record<string, string>;
  boxes?: Record<string, BoxRound>;
};

function filePath() {
  return join(process.cwd(), "data", "rooms.json");
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
}

async function readBook(): Promise<Book> {
  try {
    const raw = JSON.parse(await readFile(filePath(), "utf8")) as Book;
    return raw && typeof raw === "object" ? raw : {};
  } catch {
    return {};
  }
}

async function writeBook(book: Book) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(book));
}

function payout(reels: SymbolId[]) {
  if (reels[0] !== reels[1] || reels[1] !== reels[2]) return 0;
  if (reels[0] === "frame") return 30;
  if (reels[0] === "note") return 8;
  if (reels[0] === "moon") return 4;
  return 0;
}

async function once(book: Book, map: "bandits" | "prizes", key: string, amount: number) {
  const table = book[map] || {};
  if (table[key] === today()) {
    return { ok: false as const, fresh: false, table };
  }
  table[key] = today();
  book[map] = table;
  await writeBook(book);
  return { ok: true as const, fresh: true, table, amount };
}

export const playRoom = createServerFn({ method: "POST" })
  .validator(
    (input: {
      action: "claim" | "spin" | "box" | "hint" | "bandit" | "prize";
      hints?: number;
      step?: "deal" | "pick";
      pick?: number;
      kind?: "cake" | "cards" | "brick";
    }) => input,
  )
  .handler(async ({ data }) => {
    const guest = currentGuest();
    if (!guest) return { ok: false as const, error: "Сначала зайди во двор.", notes: 0 };
    const book = await readBook();

    if (data.action === "hint") {
      const row = await readPurse(guest.id);
      const notes = row?.notes ?? 0;
      if (notes < 0.5) return { ok: false as const, error: "Нужно 0.5 ноты.", notes };
      const next = await addPurse(guest.id, -0.5);
      return { ok: true as const, notes: next?.notes ?? notes - 0.5 };
    }

    if (data.action === "bandit") {
      const hit = await once(book, "bandits", guest.id, 10);
      const row = hit.fresh ? await addPurse(guest.id, 10) : await readPurse(guest.id);
      if (!hit.fresh) return { ok: false as const, error: "Сегодня десять нот уже забрал.", notes: row?.notes ?? 0 };
      return { ok: true as const, notes: row?.notes ?? 10, pay: 10 };
    }

    if (data.action === "prize") {
      const kind = data.kind === "cake" || data.kind === "cards" || data.kind === "brick" ? data.kind : "cards";
      const pay = kind === "cake" ? 3 : 2;
      const hit = await once(book, "prizes", `${guest.id}:${kind}`, pay);
      const row = hit.fresh ? await addPurse(guest.id, pay) : await readPurse(guest.id);
      if (!hit.fresh) return { ok: false as const, error: "Эта загадка уже отдала ноты сегодня.", notes: row?.notes ?? 0 };
      return { ok: true as const, notes: row?.notes ?? pay, pay };
    }

    if (data.action === "box") {
      const boxes = book.boxes || {};
      const round = boxes[guest.id];
      if (data.step === "deal") {
        if (round?.due) {
          const paid = await spendPurse(guest.id, STAKE);
          if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
        }
        boxes[guest.id] = { win: Math.floor(Math.random() * 3), due: false };
        book.boxes = boxes;
        await writeBook(book);
        const row = await readPurse(guest.id);
        return { ok: true as const, notes: row?.notes ?? 0, dealt: true };
      }
      if (!round) return { ok: false as const, error: "Сначала открой шкатулки.", notes: 0 };
      const pick = Math.max(0, Math.min(2, Math.round(Number(data.pick) || 0)));
      if (pick === round.win) {
        delete boxes[guest.id];
        book.boxes = boxes;
        await writeBook(book);
        const row = await addPurse(guest.id, STAKE);
        return { ok: true as const, notes: row?.notes ?? STAKE, win: true, pay: STAKE };
      }
      boxes[guest.id] = { win: round.win, due: true };
      book.boxes = boxes;
      await writeBook(book);
      const row = await readPurse(guest.id);
      return { ok: true as const, notes: row?.notes ?? 0, win: false };
    }

    if (data.action === "claim") {
      const hunts = book.hunts || {};
      if (hunts[guest.id] === today()) {
        const row = await readPurse(guest.id);
        return { ok: false as const, error: "Кладовая уже отдала ноты сегодня.", notes: row?.notes ?? 0 };
      }
      const hints = Math.max(0, Math.min(10, Math.round(Number(data.hints) || 0)));
      const pay = Math.max(0, HUNT_PAY - hints * 0.5);
      hunts[guest.id] = today();
      book.hunts = hunts;
      await writeBook(book);
      if (pay <= 0) {
        const row = await readPurse(guest.id);
        return { ok: true as const, notes: row?.notes ?? 0, pay: 0 };
      }
      const row = await addPurse(guest.id, pay);
      return { ok: true as const, notes: row?.notes ?? pay, pay };
    }

    const paid = await spendPurse(guest.id, STAKE);
    if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
    const reels = [0, 1, 2].map(() => SYMBOLS[Math.floor(Math.random() * SYMBOLS.length)]) as [SymbolId, SymbolId, SymbolId];
    const win = payout(reels);
    let notes = paid.notes;
    if (win > 0) {
      const row = await addPurse(guest.id, win);
      notes = row?.notes ?? notes + win;
    }
    return { ok: true as const, notes, reels, win, stake: STAKE };
  });
