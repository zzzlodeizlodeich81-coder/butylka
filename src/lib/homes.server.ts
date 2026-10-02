import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { HOUSES, type TierId } from "@/lib/homes";

export type OrganStats = { listens: number; ups: number; score: number; published: boolean };

const RANK = Object.fromEntries(HOUSES.map((house) => [house.id, house.rank])) as Record<TierId, number>;

function filePath() {
  return join(process.cwd(), "data", "homes.json");
}

async function readAll(): Promise<Record<string, TierId>> {
  try {
    const raw = JSON.parse(await readFile(filePath(), "utf8")) as { rows?: Record<string, TierId> };
    return raw.rows && typeof raw.rows === "object" ? raw.rows : {};
  } catch {
    return {};
  }
}

export async function readHome(id: string): Promise<TierId | null> {
  const rows = await readAll();
  return rows[id] || null;
}

export async function writeHome(id: string, tier: TierId) {
  const rows = await readAll();
  rows[id] = tier;
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ rows }));
}

export function readyTiers(stats: OrganStats): TierId[] {
  const ids: TierId[] = ["tent"];
  if (stats.listens >= 10) ids.push("dugout");
  if (stats.ups >= 50) ids.push("wood");
  if (stats.published && stats.score >= 100) ids.push("brick");
  if (stats.published && stats.score >= 500) ids.push("star");
  if (stats.published && stats.score >= 1000) ids.push("manor");
  return ids;
}

export function canRaise(current: TierId | null, next: TierId) {
  if (!current) return true;
  return RANK[next] > RANK[current];
}
