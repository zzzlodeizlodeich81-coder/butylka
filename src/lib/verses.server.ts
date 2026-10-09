import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";

export type VerseDraft = {
  id: string;
  guest: string;
  author: string;
  title: string;
  body: string;
  font: string;
  size: number;
  createdAt: number;
  updatedAt: number;
};

export type VersePub = {
  id: string;
  draftId: string;
  guest: string;
  author: string;
  title: string;
  body: string;
  font: string;
  size: number;
  publishedAt: number;
};

const FONTS = ["Manrope", "Georgia", "Times New Roman", "Palatino Linotype", "Courier New", "Verdana"];
const SIZES = [14, 18, 22, 28];

function filePath() {
  return join(process.cwd(), "data", "verses.json");
}

async function readBook(): Promise<{ drafts: VerseDraft[]; pubs: VersePub[] }> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as { drafts?: VerseDraft[]; pubs?: VersePub[] };
    return {
      drafts: Array.isArray(parsed.drafts) ? parsed.drafts : [],
      pubs: Array.isArray(parsed.pubs) ? parsed.pubs : [],
    };
  } catch {
    return { drafts: [], pubs: [] };
  }
}

async function writeBook(book: { drafts: VerseDraft[]; pubs: VersePub[] }) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(book));
}

function clean(raw: string, max: number) {
  return raw.replace(/\u0000/g, "").trim().slice(0, max);
}

export function cleanFont(raw: string) {
  return FONTS.includes(raw) ? raw : FONTS[0];
}

export function cleanSize(raw: number) {
  return SIZES.includes(raw) ? raw : 18;
}

export async function listVerses(guest: string) {
  const book = await readBook();
  return {
    drafts: book.drafts.filter((row) => row.guest === guest).sort((a, b) => b.updatedAt - a.updatedAt),
    mine: book.pubs.filter((row) => row.guest === guest).sort((a, b) => b.publishedAt - a.publishedAt),
    catalog: book.pubs.slice().sort((a, b) => b.publishedAt - a.publishedAt).slice(0, 200),
  };
}

export async function saveDraft(
  guest: string,
  author: string,
  input: { id?: string; title?: string; body?: string; font?: string; size?: number },
) {
  const book = await readBook();
  const title = clean(input.title || "", 80);
  const body = clean(input.body || "", 12000);
  const font = cleanFont(input.font || "");
  const size = cleanSize(Number(input.size));
  const now = Date.now();
  const existing = book.drafts.find((row) => row.id === input.id && row.guest === guest);
  if (existing) {
    existing.title = title;
    existing.body = body;
    existing.font = font;
    existing.size = size;
    existing.author = clean(author, 40) || existing.author;
    existing.updatedAt = now;
    await writeBook(book);
    return existing;
  }
  const own = book.drafts.filter((row) => row.guest === guest);
  if (own.length >= 80) return null;
  const row: VerseDraft = {
    id: randomUUID(),
    guest,
    author: clean(author, 40) || "без имени",
    title,
    body,
    font,
    size,
    createdAt: now,
    updatedAt: now,
  };
  book.drafts.push(row);
  await writeBook(book);
  return row;
}

export async function publishDraft(guest: string, author: string, id: string) {
  const book = await readBook();
  const draft = book.drafts.find((row) => row.id === id && row.guest === guest);
  if (!draft || draft.body.trim().length < 2) return null;
  if (book.pubs.length >= 2000) return null;
  const pub: VersePub = {
    id: randomUUID(),
    draftId: draft.id,
    guest,
    author: clean(author, 40) || draft.author,
    title: draft.title || "без названия",
    body: draft.body,
    font: draft.font,
    size: draft.size,
    publishedAt: Date.now(),
  };
  book.pubs.push(pub);
  await writeBook(book);
  return pub;
}

export async function dropDraft(guest: string, id: string) {
  const book = await readBook();
  const before = book.drafts.length;
  book.drafts = book.drafts.filter((row) => !(row.id === id && row.guest === guest));
  if (book.drafts.length === before) return false;
  await writeBook(book);
  return true;
}
