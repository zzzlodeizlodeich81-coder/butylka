import { createHmac, createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getRequest } from "@tanstack/react-start/server";

type Row = { id: string; name: string; notes: number };
type Book = { rows: Row[] };

const DOOR = "kadr_door";
const GUEST = "kadr_guest";

function doorPassword() {
  return (process.env.DOOR_PASSWORD || "").trim();
}

function adminPassword() {
  return (process.env.ADMIN_PASSWORD || "").trim();
}

function macSecret() {
  return doorPassword() || "kadr-dev";
}

function same(a: string, b: string) {
  return timingSafeEqual(createHash("sha256").update(a).digest(), createHash("sha256").update(b).digest());
}

function sign(body: string) {
  return createHmac("sha256", macSecret()).update(body).digest("hex");
}

export function doorEnabled() {
  return Boolean(doorPassword());
}

export function checkDoorPassword(password: string) {
  const want = doorPassword();
  if (!want) return false;
  return same(want, password.trim());
}

export function checkAdminPassword(password: string) {
  const want = adminPassword();
  if (!want) return false;
  return same(want, password.trim());
}

function filePath() {
  return process.env.PURSE_FILE || join(process.cwd(), "data", "purse.json");
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
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as Book;
    if (!parsed || !Array.isArray(parsed.rows)) return { rows: [] };
    return parsed;
  } catch {
    return { rows: [] };
  }
}

async function writeBook(book: Book) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(book), "utf8");
}

export async function listPurse() {
  const book = await readBook();
  return book.rows.map((row) => ({ id: row.id, name: row.name, notes: row.notes }));
}

export async function readPurse(id: string) {
  const book = await readBook();
  return book.rows.find((row) => row.id === id) ?? null;
}

export async function joinPurse(name: string) {
  const clean = name.replace(/[|\n\r]/g, "").trim().slice(0, 24);
  if (clean.length < 2) return null;
  return locked(async () => {
    const book = await readBook();
    const row = { id: randomUUID(), name: clean, notes: 0 };
    book.rows.push(row);
    await writeBook(book);
    return row;
  });
}

export async function addPurse(id: string, amount: number) {
  const delta = Math.round(amount);
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) return null;
  return locked(async () => {
    const book = await readBook();
    const row = book.rows.find((item) => item.id === id);
    if (!row) return null;
    row.notes = Math.max(0, row.notes + delta);
    await writeBook(book);
    return row;
  });
}

export async function spendPurse(id: string, cost: number) {
  const price = Math.round(cost);
  if (!Number.isFinite(price) || price < 1) return { ok: false as const, error: "Странная цена.", notes: 0 };
  return locked(async () => {
    const book = await readBook();
    const hit = book.rows.find((row) => row.id === id);
    if (!hit) return { ok: false as const, error: "Нет такого игрока.", notes: 0 };
    if (hit.notes < price) return { ok: false as const, error: `Нужно ${price} нот.`, notes: hit.notes };
    hit.notes -= price;
    await writeBook(book);
    return { ok: true as const, notes: hit.notes };
  });
}

function cookieValue(req: Request, name: string) {
  const raw = req.headers.get("cookie") || "";
  const hit = raw
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  if (!hit) return "";
  try {
    return decodeURIComponent(hit.slice(name.length + 1));
  } catch {
    return "";
  }
}

export function doorCookieValue() {
  return sign("door-ok");
}

export function validDoorCookie(value: string) {
  if (!doorEnabled()) return true;
  const left = Buffer.from(value || "");
  const right = Buffer.from(doorCookieValue());
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

export function guestToken(row: { id: string; name: string }) {
  const exp = Date.now() + 30 * 24 * 3600 * 1000;
  const body = `${row.id}|${row.name}|${exp}`;
  return `${body}|${sign(body)}`;
}

export function parseGuestToken(token: string): { id: string; name: string } | null {
  const parts = token.split("|");
  if (parts.length !== 4) return null;
  const [id, name, expRaw, mac] = parts;
  const exp = Number(expRaw);
  if (!id || !name || !Number.isFinite(exp) || Date.now() > exp) return null;
  const expect = sign(`${id}|${name}|${expRaw}`);
  const left = Buffer.from(mac);
  const right = Buffer.from(expect);
  if (left.length !== right.length || !timingSafeEqual(left, right)) return null;
  return { id, name };
}

export function guestFromRequest(req: Request) {
  return parseGuestToken(cookieValue(req, GUEST));
}

export function doorFromRequest(req: Request) {
  if (!doorEnabled()) return true;
  return validDoorCookie(cookieValue(req, DOOR));
}

export function currentGuest() {
  try {
    return guestFromRequest(getRequest());
  } catch {
    return null;
  }
}

export function setCookie(req: Request, name: string, value: string) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=${encodeURIComponent(value)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000${secure}`;
}

export const DOOR_COOKIE = DOOR;
export const GUEST_COOKIE = GUEST;
