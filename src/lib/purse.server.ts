import { createHmac, createHash, randomBytes, randomUUID, scryptSync, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { getRequest } from "@tanstack/react-start/server";

type Row = { id: string; name: string; notes: number; photo?: string; login?: string; pass?: string; vk?: string };
type Book = { rows: Row[] };

const DOOR = "kadr_door";
const GUEST = "kadr_guest";
const HERE = "kadr_here";

function doorPassword() {
  return (process.env.DOOR_PASSWORD || "").trim();
}

function adminPassword() {
  return (process.env.ADMIN_PASSWORD || "").trim();
}

function adminLogin() {
  return (process.env.ADMIN_LOGIN || "zzzlodeizlodeich").trim().toLowerCase();
}

export function isAdminLogin(login?: string) {
  const user = (login || "").trim().toLowerCase();
  return Boolean(user) && user === adminLogin();
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

export async function peoplePurse() {
  const book = await readBook();
  return book.rows.map((row) => ({ id: row.id, name: row.name, photo: row.photo || "" }));
}

export async function setFace(id: string, photo: string) {
  if (!photo.startsWith("data:image/jpeg;base64,") || photo.length > 120000) return null;
  return locked(async () => {
    const book = await readBook();
    const row = book.rows.find((item) => item.id === id);
    if (!row) return null;
    row.photo = photo;
    await writeBook(book);
    return { id: row.id, photo: row.photo };
  });
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

function hashPass(password: string) {
  const salt = randomBytes(16).toString("hex");
  const hash = scryptSync(password, salt, 32).toString("hex");
  return `${salt}:${hash}`;
}

function passOk(password: string, stored: string) {
  const [salt, hash] = stored.split(":");
  if (!salt || !hash) return false;
  const next = scryptSync(password, salt, 32);
  const prev = Buffer.from(hash, "hex");
  if (next.length !== prev.length) return false;
  return timingSafeEqual(next, prev);
}

function cleanLogin(login: string) {
  return login.trim().toLowerCase().slice(0, 20);
}

export async function registerAccount(login: string, password: string, name: string) {
  const user = cleanLogin(login);
  const shown = name.replace(/[|\n\r]/g, "").trim().slice(0, 24);
  if (user === adminLogin()) return { ok: false as const, error: "Этот логин занят." };
  if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(user)) return { ok: false as const, error: "Логин: 3–20 букв или цифр." };
  if (password.trim().length < 4) return { ok: false as const, error: "Пароль хотя бы из 4 знаков." };
  if (shown.length < 2) return { ok: false as const, error: "Имя хотя бы из двух букв." };
  return locked(async () => {
    const book = await readBook();
    if (book.rows.some((row) => row.login === user)) return { ok: false as const, error: "Такой логин уже занят." };
    const row: Row = { id: randomUUID(), name: shown, notes: 0, login: user, pass: hashPass(password.trim()) };
    book.rows.push(row);
    await writeBook(book);
    return { ok: true as const, row };
  });
}

export async function loginAccount(login: string, password: string) {
  const user = cleanLogin(login);
  const typed = password.trim();
  if (isAdminLogin(user) && checkAdminPassword(typed)) {
    return locked(async () => {
      const book = await readBook();
      let row = book.rows.find((item) => item.login === user);
      if (!row) {
        row = { id: randomUUID(), name: "Хозяин", notes: 0, login: user, pass: hashPass(typed) };
        book.rows.push(row);
        await writeBook(book);
      }
      return { ok: true as const, row };
    });
  }
  const book = await readBook();
  const row = book.rows.find((item) => item.login === user && item.pass);
  if (!row || !row.pass || !passOk(typed, row.pass)) return { ok: false as const, error: "Логин или пароль не тот." };
  return { ok: true as const, row };
}

export async function updateAccount(
  id: string,
  patch: { name?: string; login?: string; password?: string; current?: string },
) {
  return locked(async () => {
    const book = await readBook();
    const row = book.rows.find((item) => item.id === id);
    if (!row) return { ok: false as const, error: "Нет такого игрока." };
    const admin = isAdminLogin(row.login);
    const current = (patch.current || "").trim();
    const nextLogin = (patch.login || "").trim();
    const loginChange = Boolean(nextLogin) && cleanLogin(nextLogin) !== (row.login || "");
    const passChange = Boolean((patch.password || "").trim());
    if (loginChange || passChange) {
      const known = row.pass ? passOk(current, row.pass) : admin && checkAdminPassword(current);
      if (row.pass || admin) {
        if (!known) return { ok: false as const, error: "Старый пароль не тот." };
      }
    }
    if ((patch.name || "").trim()) {
      const shown = patch.name!.replace(/[|\n\r]/g, "").trim().slice(0, 24);
      if (shown.length < 2) return { ok: false as const, error: "Ник хотя бы из двух букв." };
      row.name = shown;
    }
    if (loginChange) {
      if (admin) return { ok: false as const, error: "Логин хозяина не меняется." };
      const user = cleanLogin(patch.login || "");
      if (user === adminLogin()) return { ok: false as const, error: "Этот логин занят." };
      if (!/^[\p{L}\p{N}_-]{3,20}$/u.test(user)) return { ok: false as const, error: "Логин: 3–20 букв или цифр." };
      if (book.rows.some((item) => item.login === user && item.id !== row.id)) {
        return { ok: false as const, error: "Такой логин уже занят." };
      }
      row.login = user;
    }
    if (passChange) {
      if (admin) return { ok: false as const, error: "Пароль админки меняется не здесь." };
      if (patch.password!.trim().length < 4) return { ok: false as const, error: "Пароль хотя бы из 4 знаков." };
      row.pass = hashPass(patch.password!.trim());
    }
    await writeBook(book);
    return { ok: true as const, row };
  });
}

export async function attachVk(currentId: string, vkId: string) {
  const id = vkId.replace(/\D/g, "").slice(0, 20);
  if (!id) return { ok: false as const, error: "ВК не отдал номер." };
  return locked(async () => {
    const book = await readBook();
    const current = book.rows.find((item) => item.id === currentId);
    if (!current) return { ok: false as const, error: "Нет такой учётки." };
    const taken = book.rows.find((item) => item.vk === id && item.id !== current.id);
    if (taken) return { ok: false as const, error: "Этот ВК уже привязан к другому двору." };
    current.vk = id;
    await writeBook(book);
    return { ok: true as const, row: current };
  });
}

export async function bindVkAccount(currentId: string, login: string, password: string) {
  const user = cleanLogin(login);
  const typed = password.trim();
  if (!user || !typed) return { ok: false as const, error: "Нужны старый логин и пароль." };
  return locked(async () => {
    const book = await readBook();
    const current = book.rows.find((item) => item.id === currentId);
    if (!current?.vk) return { ok: false as const, error: "Сначала зайди из ВК." };
    const old = book.rows.find((item) => item.login === user && item.pass && item.id !== current.id);
    if (!old || !old.pass || !passOk(typed, old.pass)) return { ok: false as const, error: "Логин или пароль не тот." };
    if (old.vk && old.vk !== current.vk) return { ok: false as const, error: "Этот двор уже привязан к другому ВК." };
    old.vk = current.vk;
    if (current.notes) old.notes = Math.round((old.notes + current.notes) * 10) / 10;
    const shell = (current.login || "").startsWith("vk") && current.notes === 0;
    if (shell) book.rows = book.rows.filter((item) => item.id !== current.id);
    else current.vk = undefined;
    await writeBook(book);
    return { ok: true as const, row: old };
  });
}

export async function loginVk(vkId: string, name: string) {
  const id = vkId.replace(/\D/g, "").slice(0, 20);
  if (!id) return null;
  const shown = name.replace(/[|\n\r]/g, "").trim().slice(0, 24) || `vk${id}`;
  return locked(async () => {
    const book = await readBook();
    let row = book.rows.find((item) => item.vk === id);
    if (!row) {
      row = { id: randomUUID(), name: shown, notes: 0, vk: id, login: `vk${id}` };
      book.rows.push(row);
      await writeBook(book);
    }
    return row;
  });
}

export async function deletePurse(id: string) {
  return locked(async () => {
    const book = await readBook();
    const row = book.rows.find((item) => item.id === id);
    if (!row) return null;
    if (isAdminLogin(row.login)) return null;
    book.rows = book.rows.filter((item) => item.id !== id);
    await writeBook(book);
    return { id: row.id, name: row.name };
  });
}

export async function addPurse(id: string, amount: number) {
  const delta = Math.round(Number(amount) * 10) / 10;
  if (!Number.isFinite(delta) || delta === 0 || Math.abs(delta) > 100000) return null;
  return locked(async () => {
    const book = await readBook();
    const row = book.rows.find((item) => item.id === id);
    if (!row) return null;
    row.notes = Math.max(0, Math.round((row.notes + delta) * 10) / 10);
    await writeBook(book);
    return row;
  });
}

export async function chargeTenths(id: string, cost: number) {
  const price = Math.max(0.1, Math.ceil(Number(cost) * 10) / 10);
  if (!Number.isFinite(price) || price > 100000) return { ok: false as const, error: "Странная цена.", notes: 0, charged: 0 };
  return locked(async () => {
    const book = await readBook();
    const hit = book.rows.find((row) => row.id === id);
    if (!hit) return { ok: false as const, error: "Нет такого игрока.", notes: 0, charged: 0 };
    if (hit.notes + 0.001 < price) return { ok: false as const, error: `Нужно ${price} нот.`, notes: hit.notes, charged: 0 };
    hit.notes = Math.round((hit.notes - price) * 10) / 10;
    await writeBook(book);
    return { ok: true as const, notes: hit.notes, charged: price };
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

export function hereFromRequest(req?: Request) {
  try {
    const target = req || getRequest();
    return cookieValue(target, HERE).replace(/[^\w-]/g, "").slice(0, 40);
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

export function clearCookie(req: Request, name: string) {
  const secure = new URL(req.url).protocol === "https:" ? "; Secure" : "";
  return `${name}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0${secure}`;
}

export const DOOR_COOKIE = DOOR;
export const GUEST_COOKIE = GUEST;
export const HERE_COOKIE = HERE;
