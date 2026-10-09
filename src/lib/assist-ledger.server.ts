import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type AssistLine = {
  at: number;
  guest: string;
  mode: string;
  tokens: number;
  costRub: number;
  notes: number;
};

function filePath() {
  return join(process.cwd(), "data", "assist-ledger.json");
}

async function readLines(): Promise<AssistLine[]> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as AssistLine[];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export async function addAssistLine(line: AssistLine) {
  const rows = await readLines();
  rows.push(line);
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(rows.slice(-4000)));
}

export async function assistFor(guest: string) {
  const rows = (await readLines()).filter((row) => row.guest === guest).slice(-40).reverse();
  const tokens = rows.reduce((sum, row) => sum + row.tokens, 0);
  const costRub = Math.round(rows.reduce((sum, row) => sum + row.costRub, 0) * 100) / 100;
  const notes = Math.round(rows.reduce((sum, row) => sum + row.notes, 0) * 10) / 10;
  return { rows: rows.slice(0, 12), tokens, costRub, notes };
}
