import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type Whisper = {
  id: string;
  from: string;
  to: string;
  text: string;
  at: number;
  image?: string;
  audio?: string;
  seen?: boolean;
};

let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>): Promise<T> {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

function filePath() {
  return join(process.cwd(), "data", "whispers.json");
}

async function readAll(): Promise<Whisper[]> {
  try {
    const raw = JSON.parse(await readFile(filePath(), "utf8")) as { rows?: Whisper[] };
    const all = Array.isArray(raw.rows) ? raw.rows : [];
    const cut = Date.now() - 48 * 60 * 60 * 1000;
    const rows = all.filter((row) => row.at >= cut);
    if (rows.length !== all.length) {
      await mkdir(dirname(filePath()), { recursive: true });
      await writeFile(filePath(), JSON.stringify({ rows }));
    }
    return rows;
  } catch {
    return [];
  }
}

const fingers = new Map<string, { name: string; to: string; at: number }>();

export function setTyping(from: string, name: string, to: string, on: boolean) {
  if (!from || !to || from === to || !on) {
    fingers.delete(from);
    return;
  }
  fingers.set(from, { name: name.slice(0, 32), to, at: Date.now() });
}

export function typingName(me: string, withId: string) {
  const row = fingers.get(withId);
  if (!row || row.to !== me || Date.now() - row.at > 4000) return "";
  return row.name;
}

export async function postWhisper(from: string, to: string, text: string, image = "", audio = "") {
  const clean = text.replace(/\s+/g, " ").trim().slice(0, 300);
  const pic = image.startsWith("data:image/jpeg;base64,") && image.length <= 160000 ? image : "";
  const voice = audio.startsWith("data:audio/") && audio.length <= 180000 ? audio : "";
  if (!from || !to || from === to || (!clean && !pic && !voice)) return null;
  return locked(async () => {
    const rows = await readAll();
    const row: Whisper = { id: randomUUID(), from, to, text: clean, at: Date.now(), seen: false };
    if (pic) row.image = pic;
    if (voice) row.audio = voice;
    rows.push(row);
    const path = filePath();
    await mkdir(dirname(path), { recursive: true });
    await writeFile(path, JSON.stringify({ rows: rows.slice(-400) }));
    return row;
  });
}

export async function threadFor(me: string, withId: string) {
  return locked(async () => {
    const rows = await readAll();
    let dirty = false;
    for (const row of rows) {
      if (row.to === me && row.from === withId && !row.seen) {
        row.seen = true;
        dirty = true;
      }
    }
    if (dirty) {
      const path = filePath();
      await mkdir(dirname(path), { recursive: true });
      await writeFile(path, JSON.stringify({ rows: rows.slice(-400) }));
    }
    return rows
      .filter((row) => (row.from === me && row.to === withId) || (row.from === withId && row.to === me))
      .slice(-80);
  });
}

export async function unreadFrom(me: string) {
  const rows = await readAll();
  return [...new Set(rows.filter((row) => row.to === me && !row.seen).map((row) => row.from))];
}
