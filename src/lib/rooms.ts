import { createServerFn } from "@tanstack/react-start";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { addPurse, currentGuest, readPurse, spendPurse } from "@/lib/purse.server";

const STAKE = 2;
const HUNT_PAY = 5;
const SYMBOLS = ["dust", "note", "moon", "skull", "frame"] as const;
type SymbolId = (typeof SYMBOLS)[number];

function filePath() {
  return join(process.cwd(), "data", "rooms.json");
}

function today() {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Moscow" }).format(new Date());
}

async function readHunts(): Promise<Record<string, string>> {
  try {
    const raw = JSON.parse(await readFile(filePath(), "utf8")) as { hunts?: Record<string, string> };
    return raw.hunts && typeof raw.hunts === "object" ? raw.hunts : {};
  } catch {
    return {};
  }
}

async function writeHunts(hunts: Record<string, string>) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ hunts }));
}

function payout(reels: SymbolId[]) {
  if (reels[0] !== reels[1] || reels[1] !== reels[2]) return 0;
  if (reels[0] === "frame") return 30;
  if (reels[0] === "note") return 8;
  if (reels[0] === "moon") return 4;
  return 0;
}

export const playRoom = createServerFn({ method: "POST" })
  .validator((input: { action: "claim" | "spin" }) => input)
  .handler(async ({ data }) => {
    const guest = currentGuest();
    if (!guest) return { ok: false as const, error: "Сначала зайди во двор.", notes: 0 };

    if (data.action === "claim") {
      const hunts = await readHunts();
      if (hunts[guest.id] === today()) {
        const row = await readPurse(guest.id);
        return { ok: false as const, error: "Кладовая уже отдала ноты сегодня.", notes: row?.notes ?? 0 };
      }
      hunts[guest.id] = today();
      await writeHunts(hunts);
      const row = await addPurse(guest.id, HUNT_PAY);
      return { ok: true as const, notes: row?.notes ?? HUNT_PAY, pay: HUNT_PAY };
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
