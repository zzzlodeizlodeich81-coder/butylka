import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { createServerFn } from "@tanstack/react-start";
import { vkMiddleware } from "@/lib/vk/middleware";

export type YardSong = {
  id: string;
  kind: "draft" | "release";
  url: string;
  title: string;
  author: string;
  vk: string;
  at: number;
  hook: number;
  lyric: number;
  music: number;
  orig: number;
  n: number;
  up?: number;
  yard?: string;
};

export type YardLine = {
  id: string;
  name: string;
  text: string;
  at: number;
  room?: string;
  who?: string;
  photo?: string;
  image?: string;
  audio?: string;
};
export type YardSpot = { id: string; name: string; photo: string; spot: string };

export type Hero = {
  vk: string;
  name: string;
  notes: number;
  frames: number;
  tracks: number;
  hook: number;
  lyric: number;
  music: number;
  orig: number;
  votes: number;
  fame: number;
};

type Mem = {
  songs: YardSong[];
  rates: Set<string>;
  hears: Set<string>;
  chat: YardLine[];
};

type Presave = {
  id: string;
  owner: string;
  name: string;
  title: string;
  url: string;
  clicks: number;
  heard: string[];
  at: number;
};

const presaves: Presave[] = [];

const mem: Mem = { songs: [], rates: new Set(), hears: new Set(), chat: [] };
type Stall = { id: string; owner: string; name: string; about: string; url: string; until: number };
const stalls: Stall[] = [];
const spots: (YardSpot & { at: number; room?: string })[] = [];
const typing = new Map<string, { id: string; name: string; room: string; at: number }>();

function liveSpots(room = ""): YardSpot[] {
  const now = Date.now();
  return spots
    .filter((row) => now - row.at < 40000 && (row.room || "") === room)
    .map(({ id, name, photo, spot }) => ({ id, name, photo, spot }));
}

function presaveView(me: string) {
  return [...presaves]
    .slice()
    .reverse()
    .map((row) => ({
      id: row.id,
      name: row.name,
      title: row.title,
      url: row.clicks < 10 || row.owner === me ? row.url : "",
      clicks: row.clicks,
      live: row.clicks < 10,
      mine: row.owner === me,
      heard: row.heard.includes(me),
    }));
}

function liveTyping(room: string, except = "") {
  const now = Date.now();
  return [...typing.values()]
    .filter((row) => row.room === room && row.id !== except && now - row.at < 4000)
    .map(({ id, name }) => ({ id, name }));
}
const heroes = new Map<string, Hero>();
let boardReady: Promise<void> | null = null;

function boardFile() {
  return join(process.cwd(), "data", "yard-board.json");
}

function loadBoardFile() {
  boardReady ??= (async () => {
    try {
      const raw = JSON.parse(await readFile(boardFile(), "utf8")) as {
        songs?: YardSong[];
        chat?: YardLine[];
        stalls?: Stall[];
        presaves?: Presave[];
      };
      if (Array.isArray(raw.songs)) {
        mem.songs = raw.songs.slice(-80).map((song) => ({ ...song, title: song.title || "" }));
      }
      if (Array.isArray(raw.chat)) mem.chat = raw.chat.slice(-240);
      if (Array.isArray(raw.stalls)) stalls.splice(0, stalls.length, ...raw.stalls);
      if (Array.isArray(raw.presaves)) presaves.splice(0, presaves.length, ...raw.presaves.slice(-80));
    } catch {
      /* доски ещё нет */
    }
  })();
  return boardReady;
}

export async function forgetName(name: string, songs: boolean) {
  const who = name.trim();
  if (!who) return;
  await loadBoardFile();
  mem.chat = mem.chat.filter((line) => line.name !== who);
  if (songs) mem.songs = mem.songs.filter((song) => song.author !== who);
  await saveBoardFile();
}

export async function broadcastInvite(rooms: string[], text: string, name: string) {
  await loadBoardFile();
  const at = Date.now();
  for (const room of rooms) {
    mem.chat.push({ id: crypto.randomUUID(), name, text, at, room, who: "orpheus", photo: "" });
  }
  if (mem.chat.length > 240) mem.chat.splice(0, mem.chat.length - 240);
  await saveBoardFile();
}

async function saveBoardFile() {
  const path = boardFile();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ songs: mem.songs, chat: mem.chat, stalls, presaves }));
}

function cleanUrl(raw: string) {
  const text = raw.trim().slice(0, 1200);
  const fromFrame = text.match(/src=["'](https:\/\/[^"'\s]+)["']/i)?.[1] || "";
  const url = (fromFrame || text.split(/\s+/)[0] || "").trim().slice(0, 300);
  if (!/^https:\/\/\S+$/i.test(url)) return "";
  if (!fromFrame) return url;
  try {
    const page = new URL(url);
    if (!/^music\.yandex\.(ru|com)$/i.test(page.hostname)) return "";
    if (!page.pathname.includes("/iframe")) return "";
  } catch {
    return "";
  }
  return url;
}

function score(n: unknown) {
  const v = Math.round(Number(n));
  return v >= 1 && v <= 5 ? v : 0;
}

function upsOf(song: YardSong) {
  if (typeof song.up === "number") return song.up;
  const avg = song.n ? (song.hook + song.lyric + song.music + song.orig) / (4 * song.n) : 0;
  return avg >= 4 ? song.n : 0;
}

async function sheetCall(body: Record<string, unknown>) {
  let url = "";
  let secret = "";
  try {
    url = process.env.NOTES_SHEET_WEBHOOK?.trim() || "";
    secret = process.env.NOTES_SHEET_SECRET?.trim() || "";
  } catch {
    return null;
  }
  if (!url) return null;
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ secret, op: "yard", ...body }),
      signal: AbortSignal.timeout(18000),
    });
    const json = (await res.json().catch(() => null)) as { ok?: boolean; error?: string } | null;
    if (!json || json.error === "unknown op") return null;
    return json as {
      ok: boolean;
      error?: string;
      shared?: boolean;
      songs?: YardSong[];
      chat?: YardLine[];
      heroes?: Hero[];
      notes?: number;
      credit?: number;
    };
  } catch {
    return null;
  }
}

function songsOf(room: string) {
  return [...mem.songs].reverse().filter((song) => (song.yard || "") === room).slice(0, 40);
}

function listMem(room = "") {
  return {
    ok: true as const,
    shared: true,
    songs: songsOf(room),
    chat: [...mem.chat].slice(-30),
  };
}

function recount(vkId: string, name: string, frames: number | null, yard = "") {
  if (!vkId) return;
  const drafts = mem.songs.filter((s) => s.vk === vkId && s.kind === "draft" && (s.yard || "") === yard);
  const totals = drafts.reduce(
    (sum, song) => ({
      hook: sum.hook + song.hook,
      lyric: sum.lyric + song.lyric,
      music: sum.music + song.music,
      orig: sum.orig + song.orig,
      votes: sum.votes + song.n,
    }),
    { hook: 0, lyric: 0, music: 0, orig: 0, votes: 0 },
  );
  const prev = heroes.get(vkId);
  const votes = totals.votes;
  const fame = votes ? Math.round(((totals.hook + totals.lyric + totals.music + totals.orig) / (4 * votes)) * 10) / 10 : 0;
  heroes.set(vkId, {
    vk: vkId,
    name: name || prev?.name || "Гость",
    notes: prev?.notes || 0,
    frames: frames === null ? prev?.frames || 0 : frames,
    tracks: drafts.length,
    ...totals,
    fame,
  });
}

function heroRows() {
  return [...heroes.values()].sort((a, b) => b.fame - a.fame || b.votes - a.votes).slice(0, 20);
}

function vkPage(raw: string) {
  const text = raw.trim();
  if (!text) return "";
  const withProto = /^https?:\/\//i.test(text) ? text : `https://${text}`;
  try {
    const url = new URL(withProto);
    if (!/(^|\.)vk\.(com|ru)$/i.test(url.hostname)) return "";
    return url.toString().slice(0, 200);
  } catch {
    return "";
  }
}

type BoardRes = {
  ok: boolean;
  error?: string;
  shared?: boolean;
  songs?: YardSong[];
  chat?: YardLine[];
  heroes?: Hero[];
  spots?: YardSpot[];
  typing?: { id: string; name: string }[];
  room?: string;
  notes?: number;
  credit?: number;
  local?: boolean;
  tier?: string;
  listens?: number;
  ups?: number;
  score?: number;
  published?: boolean;
  ready?: string[];
  stalls?: { id: string; name: string; about: string; url: string; until: number; mine: boolean }[];
  presaves?: { id: string; name: string; title: string; url: string; clicks: number; live: boolean; mine: boolean; heard: boolean }[];
};

export const yardBoard = createServerFn({ method: "POST" })
  .middleware([vkMiddleware])
  .validator(
    (input: {
      action: "list" | "add" | "rate" | "hear" | "drop" | "say" | "glory" | "home" | "build" | "spot" | "stalls" | "rent" | "type" | "field" | "sow" | "tap" | "resow";
      kind?: "draft" | "release";
      url?: string;
      title?: string;
      songId?: string;
      tier?: string;
      text?: string;
      image?: string;
      audio?: string;
      hook?: number;
      lyric?: number;
      music?: number;
      orig?: number;
      author?: string;
      heroId?: string;
      frames?: number;
      plot?: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<BoardRes> => {
    const vk = context.vk;
    const guest = (await import("@/lib/purse.server")).currentGuest();
    const vkId = guest?.id || vk?.vkId || String(data.heroId || "guest").slice(0, 48);
    const name = (guest?.name || vk?.name || data.author || "Гость").slice(0, 32);
    const { plotRoom } = await import("@/lib/lands.server");
    const room = await plotRoom(String(data.plot || ""));
    await loadBoardFile();
    const cut = Date.now() - 48 * 60 * 60 * 1000;
    if (mem.chat.some((line) => line.at < cut)) {
      mem.chat = mem.chat.filter((line) => line.at >= cut);
      await saveBoardFile();
    }

    if (data.action === "stalls" || data.action === "rent") {
      const now = Date.now();
      const live = () =>
        stalls
          .filter((row) => row.until > now)
          .map((row) => ({ id: row.id, name: row.name, about: row.about, url: row.url, until: row.until, mine: row.owner === vkId }));
      if (data.action === "stalls") return { ok: true, stalls: live() };
      if (!guest) return { ok: false, error: "Сначала зайди." };
      const about = String(data.text || "").replace(/\s+/g, " ").trim().slice(0, 120);
      const url = vkPage(data.url || "");
      if (!about) return { ok: false, error: "Напиши, что делаешь." };
      if (!url) return { ok: false, error: "Нужна ссылка на страницу ВК: vk.com или vk.ru." };
      const { spendPurse } = await import("@/lib/purse.server");
      const { STALL_DAYS, STALL_RENT } = await import("@/lib/yard");
      const paid = await spendPurse(guest.id, STALL_RENT);
      if (!paid.ok) return { ok: false, error: paid.error, notes: paid.notes };
      const prev = stalls.find((row) => row.owner === guest.id);
      const from = prev && prev.until > now ? prev.until : now;
      const next: Stall = {
        id: prev?.id || crypto.randomUUID(),
        owner: guest.id,
        name,
        about,
        url,
        until: from + STALL_DAYS * 24 * 60 * 60 * 1000,
      };
      const index = stalls.findIndex((row) => row.owner === guest.id);
      if (index >= 0) stalls[index] = next;
      else stalls.push(next);
      await saveBoardFile();
      return { ok: true, notes: paid.notes, stalls: live() };
    }

    if (data.action === "type") {
      const on = Boolean((data.text || "").trim());
      if (!on) typing.delete(vkId);
      else typing.set(vkId, { id: vkId, name, room, at: Date.now() });
      return { ok: true, typing: liveTyping(room, vkId) };
    }

    if (data.action === "field" || data.action === "sow" || data.action === "tap" || data.action === "resow") {
      if (!guest) return { ok: false, error: "Сначала зайди во двор." };
      if (data.action === "field") return { ok: true, presaves: presaveView(vkId) };
      const { spendPurse, addPurse } = await import("@/lib/purse.server");
      if (data.action === "sow") {
        const title = (data.title || "").replace(/\s+/g, " ").trim().slice(0, 80);
        const url = cleanUrl(data.url || "");
        if (!title) return { ok: false, error: "Напиши, что сеешь." };
        if (!url) return { ok: false, error: "Нужна ссылка https://…" };
        const paid = await spendPurse(guest.id, 2);
        if (!paid.ok) return { ok: false, error: paid.error, notes: paid.notes };
        presaves.push({ id: crypto.randomUUID(), owner: guest.id, name, title, url, clicks: 0, heard: [], at: Date.now() });
        if (presaves.length > 80) presaves.shift();
        await saveBoardFile();
        return { ok: true, notes: paid.notes, presaves: presaveView(vkId) };
      }
      const row = presaves.find((item) => item.id === data.songId);
      if (!row) return { ok: false, error: "Карточки уже нет." };
      if (data.action === "resow") {
        if (row.owner !== vkId) return { ok: false, error: "Чужой посев не продлить." };
        if (row.clicks < 10) return { ok: false, error: "Она ещё живая." };
        const paid = await spendPurse(guest.id, 2);
        if (!paid.ok) return { ok: false, error: paid.error, notes: paid.notes };
        row.clicks = 0;
        row.heard = [];
        await saveBoardFile();
        return { ok: true, notes: paid.notes, presaves: presaveView(vkId) };
      }
      if (row.clicks >= 10) return { ok: false, error: "Этот пресейв уже отсеялся." };
      if (row.owner === vkId || row.heard.includes(vkId)) {
        return { ok: true, presaves: presaveView(vkId) };
      }
      const credited = await addPurse(guest.id, 0.1);
      if (!credited) return { ok: false, error: "0.1 ноты не легла." };
      row.heard.push(vkId);
      row.clicks += 1;
      await saveBoardFile();
      return { ok: true, notes: credited.notes, credit: 0.1, presaves: presaveView(vkId) };
    }

    if (room && (data.action === "list" || data.action === "add" || data.action === "rate" || data.action === "drop" || data.action === "glory")) {
      const { yardPost } = await import("@/lib/lands.server");
      const gate = await yardPost(room, guest?.id || "");
      const listed = () => ({ ...listMem(room), room, chat: mem.chat.filter((line) => (line.room || "") === room).slice(-30), spots: liveSpots(room), typing: liveTyping(room, vkId) });
      if (data.action === "list") return listed();
      if (data.action === "glory") {
        heroes.clear();
        const authors = new Map<string, string>();
        for (const song of mem.songs) {
          if (song.vk && (song.yard || "") === room && song.kind === "draft") authors.set(song.vk, song.author);
        }
        const { readPurse } = await import("@/lib/purse.server");
        for (const [id, author] of authors) {
          const row = await readPurse(id);
          recount(id, row?.name || author, null, room);
          const hero = heroes.get(id);
          if (hero && row) hero.notes = row.notes;
        }
        return { ok: true, shared: true, heroes: heroRows().filter((hero) => hero.tracks > 0) };
      }
      let admin = false;
      if (guest) {
        const { isAdminLogin, readPurse } = await import("@/lib/purse.server");
        admin = isAdminLogin((await readPurse(guest.id))?.login);
      }
      if (data.action === "add") {
        if (data.kind === "release") return { ok: false as const, error: "Чужие релизы кидают на общей сцене." };
        if (gate.north && !gate.resident && !admin) return { ok: false as const, error: "На северном дворе кидают только жители." };
        const url = cleanUrl(data.url || "");
        if (!url) return { ok: false as const, error: "Нужна ссылка https://…" };
        mem.songs.push({
          id: crypto.randomUUID(),
          kind: "draft",
          url,
          title: (data.title || "").replace(/\s+/g, " ").trim().slice(0, 80),
          author: name,
          vk: vkId,
          at: Date.now(),
          hook: 0,
          lyric: 0,
          music: 0,
          orig: 0,
          n: 0,
          yard: room,
        });
        if (mem.songs.length > 80) mem.songs.shift();
        await saveBoardFile();
        return listed();
      }
      const song = mem.songs.find((item) => item.id === data.songId && (item.yard || "") === room);
      if (!song) return { ok: false as const, error: "Этого трека на дворе нет." };
      if (data.action === "drop") {
        const mine = song.vk === vkId || song.author === name;
        if (!mine && !admin) return { ok: false as const, error: "Чужую ссылку не убрать." };
        mem.songs = mem.songs.filter((item) => item.id !== song.id);
        await saveBoardFile();
        return listed();
      }
      const hook = score(data.hook);
      const lyric = score(data.lyric);
      const music = score(data.music);
      const orig = score(data.orig);
      if (song.kind !== "draft" || !hook || !lyric || !music || !orig) return { ok: false as const, error: "Оценка от 1 до 5." };
      const key = `${song.id}:${vkId}`;
      if (mem.rates.has(key)) return { ok: false as const, error: "Ты уже оценил." };
      mem.rates.add(key);
      song.hook += hook;
      song.lyric += lyric;
      song.music += music;
      song.orig += orig;
      song.n += 1;
      if ((hook + lyric + music + orig) / 4 >= 4) song.up = (song.up || 0) + 1;
      recount(song.vk, song.author, null, room);
      await saveBoardFile();
      return listed();
    }

    const remote = await sheetCall({ ...data, vkId, name });
    if (remote?.ok) {
      if (data.action === "hear" && vk && remote.credit) {
        const { sheetRefund } = await import("@/lib/notes-sheet.server");
        try {
          const notes = await sheetRefund(vk, "listen", 0.5);
          return { ...remote, shared: true, notes: Number(notes ?? remote.notes ?? 0) };
        } catch {
          return { ...remote, shared: true };
        }
      }
      return { ...remote, shared: true };
    }
    if (remote && remote.ok === false) return { ok: false as const, error: remote.error || "Не вышло.", shared: true };

    if (data.action === "list") {
      const listed = listMem();
      return { ...listed, room, chat: (listed.chat || []).filter((line) => (line.room || "") === room), spots: liveSpots(room), typing: liveTyping(room, vkId) };
    }

    if (data.action === "spot") {
      const spot = String(data.tier || "yard").slice(0, 24);
      let photo = "";
      if (guest) {
        const row = await (await import("@/lib/purse.server")).readPurse(guest.id);
        photo = row?.photo || "";
      }
      const next = { id: vkId, name, photo, spot, at: Date.now(), room };
      const index = spots.findIndex((row) => row.id === vkId);
      if (index >= 0) spots[index] = next;
      else spots.push(next);
      return { ok: true, spots: liveSpots(room) };
    }

    if (data.action === "add") {
      const kind = data.kind === "release" ? "release" : "draft";
      const raw = data.url || "";
      if (kind === "release" && !/<iframe[\s\S]*music\.yandex\.(ru|com)\/iframe/i.test(raw)) {
        return { ok: false as const, error: "На сцену вставляй код с Яндекса, не ссылку." };
      }
      const url = cleanUrl(raw);
      if (!url) return { ok: false as const, error: kind === "release" ? "В коде нет плеера Яндекса." : "Нужна ссылка https://…" };
      const row: YardSong = {
        id: crypto.randomUUID(),
        kind,
        url,
        title: (data.title || "").replace(/\s+/g, " ").trim().slice(0, 80),
        author: name,
        vk: vkId,
        at: Date.now(),
        hook: 0,
        lyric: 0,
        music: 0,
        orig: 0,
        n: 0,
      };
      mem.songs.push(row);
      if (mem.songs.length > 80) mem.songs.shift();
      await saveBoardFile();
      return listMem();
    }

    if (data.action === "rate") {
      const song = mem.songs.find((s) => s.id === data.songId && s.kind === "draft");
      const hook = score(data.hook);
      const lyric = score(data.lyric);
      const music = score(data.music);
      const orig = score(data.orig);
      if (!song || !hook || !lyric || !music || !orig) return { ok: false as const, error: "Оценка от 1 до 5." };
      const key = `${song.id}:${vkId}`;
      if (mem.rates.has(key)) return { ok: false as const, error: "Ты уже оценил." };
      mem.rates.add(key);
      if (typeof song.up !== "number") {
        const prev = song.n ? (song.hook + song.lyric + song.music + song.orig) / (4 * song.n) : 0;
        song.up = prev >= 4 ? song.n : 0;
      }
      song.hook += hook;
      song.lyric += lyric;
      song.music += music;
      song.orig += orig;
      song.n += 1;
      if ((hook + lyric + music + orig) / 4 >= 4) song.up += 1;
      recount(song.vk, song.author, null);
      await saveBoardFile();
      return listMem();
    }

    if (data.action === "drop") {
      const song = mem.songs.find((item) => item.id === data.songId);
      if (!song) return { ok: false as const, error: "Ссылки уже нет." };
      const mine = song.vk === vkId || song.author === name;
      let admin = false;
      if (guest) {
        const { isAdminLogin, readPurse } = await import("@/lib/purse.server");
        const row = await readPurse(guest.id);
        admin = isAdminLogin(row?.login);
      }
      if (!mine && !admin) return { ok: false as const, error: "Чужую ссылку не убрать." };
      mem.songs = mem.songs.filter((item) => item.id !== song.id);
      await saveBoardFile();
      return listMem();
    }

    if (data.action === "glory") {
      await loadBoardFile();
      heroes.clear();
      const authors = new Map<string, string>();
      for (const song of mem.songs) {
        if (song.vk && !song.yard && song.kind === "draft") authors.set(song.vk, song.author);
      }
      if (vkId) authors.set(vkId, name);
      const { readPurse } = await import("@/lib/purse.server");
      for (const [id, author] of authors) {
        const row = await readPurse(id);
        recount(id, row?.name || author, id === vkId ? Math.max(0, Math.round(Number(data.frames || 0))) : null);
        const hero = heroes.get(id);
        if (hero && row) hero.notes = row.notes;
      }
      return { ok: true, shared: true, heroes: heroRows().filter((hero) => hero.tracks > 0 || hero.votes > 0) };
    }

    if (data.action === "home" || data.action === "build") {
      const { canRaise, readHome, readyTiers, writeHome } = await import("@/lib/homes.server");
      const { HOUSES, houseById } = await import("@/lib/homes");
      const mine = mem.songs.filter((song) => song.vk === vkId || song.author === name);
      const drafts = mine.filter((song) => song.kind === "draft");
      const stats = {
        listens: drafts.reduce((sum, song) => sum + song.n, 0),
        ups: drafts.reduce((sum, song) => sum + upsOf(song), 0),
        score: drafts.reduce((sum, song) => sum + song.hook + song.lyric + song.music + song.orig, 0),
        published: mine.some((song) => song.kind === "release"),
      };
      const ready = readyTiers(stats);
      const current = await readHome(vkId);
      if (data.action === "build") {
        const next = HOUSES.find((house) => house.id === data.tier);
        if (!next || !ready.includes(next.id)) return { ok: false as const, error: "Этот дом ещё не заработан." };
        if (!canRaise(current, next.id)) return { ok: false as const, error: "Дом ниже того, что уже стоит." };
        if (next.cost > 0) {
          const { currentGuest, spendPurse } = await import("@/lib/purse.server");
          const guest = currentGuest();
          if (!guest) return { ok: false as const, error: "Сначала зайди во двор.", notes: 0 };
          const paid = await spendPurse(guest.id, next.cost);
          if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
          await writeHome(vkId, next.id);
          return { ok: true, tier: next.id, ...stats, ready, notes: paid.notes };
        }
        await writeHome(vkId, next.id);
      }
      return {
        ok: true,
        tier: (data.action === "build" ? houseById(data.tier).id : current) || undefined,
        ...stats,
        ready,
      };
    }

    if (data.action === "hear") {
      const song = mem.songs.find((s) => s.id === data.songId && s.kind === "release");
      if (!song) return { ok: false as const, error: "Песни нет." };
      if (song.vk === vkId) return { ok: false as const, error: "Своя песня нот не даёт." };
      const key = `${song.id}:${vkId}`;
      if (mem.hears.has(key)) return { ok: false as const, error: "Уже засчитано." };
      if (process.env.DOOR_PASSWORD?.trim()) {
        const { currentGuest, addPurse } = await import("@/lib/purse.server");
        const guest = currentGuest();
        if (!guest) return { ok: false as const, error: "Сначала войди во двор." };
        const row = await addPurse(guest.id, 0.5);
        if (!row) return { ok: false as const, error: "Ноты не легли." };
        mem.hears.add(key);
        return { ok: true, shared: false, credit: 0.5, notes: row.notes };
      }
      mem.hears.add(key);
      if (vk) {
        try {
          const { sheetRefund } = await import("@/lib/notes-sheet.server");
          const notes = await sheetRefund(vk, "listen", 0.5);
          return { ok: true, shared: false, credit: 0.5, notes: Number(notes ?? 0) };
        } catch {
          /* ноты двора сами допишут половину */
        }
      }
      return { ok: true, shared: false, credit: 0.5, local: true };
    }

    const text = (data.text || "").trim().slice(0, 200);
    const image = typeof data.image === "string" && data.image.startsWith("data:image/jpeg;base64,") && data.image.length <= 160000 ? data.image : "";
    const audio = typeof data.audio === "string" && data.audio.startsWith("data:audio/") && data.audio.length <= 180000 ? data.audio : "";
    if (!text && !image && !audio) return { ok: false as const, error: "Пусто." };
    let photo = spots.find((row) => row.id === vkId)?.photo || "";
    if (!photo && guest) {
      const row = await (await import("@/lib/purse.server")).readPurse(guest.id);
      photo = row?.photo || "";
    }
    mem.chat.push({ id: crypto.randomUUID(), name, text, at: Date.now(), room, who: vkId, photo, ...(image ? { image } : {}), ...(audio ? { audio } : {}) });
    if (mem.chat.length > 80) mem.chat.shift();
    typing.delete(vkId);
    await saveBoardFile();
    const listed = listMem();
    return { ...listed, room, chat: (listed.chat || []).filter((line) => (line.room || "") === room), spots: liveSpots(room), typing: liveTyping(room, vkId) };
  });
