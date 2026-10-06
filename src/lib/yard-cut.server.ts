import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { partnerShare } from "@/lib/lands";
import { plotById } from "@/lib/lands.server";
import { NOTE_COST, NOTE_PRICE, NOTE_RUB, type PaidKind } from "@/lib/notes";
import { addPurse, hereFromRequest } from "@/lib/purse.server";

const TWO_WEEKS = 14 * 24 * 3600 * 1000;

type Line = {
  at: number;
  ownerId: string;
  ownerName: string;
  kind: PaidKind;
  paid: number;
  cost: number;
  share: number;
  house: number;
};

function filePath() {
  return process.env.YARD_CUT_FILE || join(process.cwd(), "data", "yard-cuts.json");
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

async function readLines(): Promise<Line[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as Line[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

async function writeLines(lines: Line[]) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(lines.slice(-4000)), "utf8");
}

function periodOf(at: number) {
  return Math.floor(at / TWO_WEEKS);
}

function periodLabel(index: number) {
  const from = new Date(index * TWO_WEEKS);
  const to = new Date((index + 1) * TWO_WEEKS - 1);
  const fmt = (d: Date) => d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
  return `${fmt(from)} — ${fmt(to)}`;
}

export async function grantCut(kind: PaidKind) {
  const paid = NOTE_PRICE[kind];
  const cost = NOTE_COST[kind];
  const share = Math.max(0, paid - cost);
  if (!share) return;
  try {
    const plotId = hereFromRequest();
    if (!plotId) return;
    const plot = await plotById(plotId);
    const rate = plot ? partnerShare(plot.name) : null;
    if (!plot || rate === null) return;
    const his = Math.round(share * rate);
    const house = share - his;
    if (his) await addPurse(plot.ownerId, his);
    await locked(async () => {
      const lines = await readLines();
      lines.push({ at: Date.now(), ownerId: plot.ownerId, ownerName: plot.name, kind, paid, cost, share: his, house });
      await writeLines(lines);
    });
  } catch {
    /* отчёт не должен ронять покупку */
  }
}

export async function reportBook(viewerId: string, admin: boolean) {
  const lines = await readLines();
  const mine = admin ? lines : lines.filter((line) => line.ownerId === viewerId);
  const now = periodOf(Date.now());
  const groups = new Map<string, { period: number; ownerName: string; paid: number; cost: number; share: number; house: number; count: number }>();
  for (const line of mine) {
    const period = periodOf(line.at);
    const key = `${period}:${line.ownerId}`;
    const row = groups.get(key) || { period, ownerName: line.ownerName, paid: 0, cost: 0, share: 0, house: 0, count: 0 };
    row.paid += line.paid;
    row.cost += line.cost;
    row.share += line.share;
    row.house += line.house || 0;
    row.count += 1;
    groups.set(key, row);
  }
  return [...groups.values()]
    .sort((a, b) => b.period - a.period || a.ownerName.localeCompare(b.ownerName, "ru"))
    .map((row) => ({
      period: periodLabel(row.period),
      closed: row.period < now,
      from: row.ownerName,
      count: row.count,
      paid: row.paid,
      costRub: Math.round(row.cost * NOTE_RUB),
      share: row.share,
      shareRub: Math.round(row.share * NOTE_RUB),
      house: row.house,
      houseRub: Math.round(row.house * NOTE_RUB),
    }));
}
