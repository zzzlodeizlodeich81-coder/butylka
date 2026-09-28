import { createServerFn } from "@tanstack/react-start";
import { vkMiddleware } from "@/lib/vk/middleware";

export type YardSong = {
  id: string;
  kind: "draft" | "release";
  url: string;
  author: string;
  vk: string;
  at: number;
  hook: number;
  lyric: number;
  music: number;
  orig: number;
  n: number;
};

export type YardLine = { id: string; name: string; text: string; at: number };

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

const mem: Mem = { songs: [], rates: new Set(), hears: new Set(), chat: [] };
const heroes = new Map<string, Hero>();

function cleanUrl(raw: string) {
  const url = raw.trim().slice(0, 300);
  return /^https:\/\/\S+$/i.test(url) ? url : "";
}

function score(n: unknown) {
  const v = Math.round(Number(n));
  return v >= 1 && v <= 5 ? v : 0;
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

function listMem() {
  return {
    ok: true as const,
    shared: false,
    songs: [...mem.songs].reverse().slice(0, 40),
    chat: [...mem.chat].slice(-30),
  };
}

function recount(vkId: string, name: string, frames: number | null) {
  if (!vkId) return;
  const drafts = mem.songs.filter((s) => s.vk === vkId && s.kind === "draft");
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

type BoardRes = {
  ok: boolean;
  error?: string;
  shared?: boolean;
  songs?: YardSong[];
  chat?: YardLine[];
  heroes?: Hero[];
  notes?: number;
  credit?: number;
  local?: boolean;
};

export const yardBoard = createServerFn({ method: "POST" })
  .middleware([vkMiddleware])
  .validator(
    (input: {
      action: "list" | "add" | "rate" | "hear" | "say" | "glory";
      kind?: "draft" | "release";
      url?: string;
      songId?: string;
      text?: string;
      hook?: number;
      lyric?: number;
      music?: number;
      orig?: number;
      author?: string;
      heroId?: string;
      frames?: number;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<BoardRes> => {
    const vk = context.vk;
    const vkId = vk?.vkId || String(data.heroId || "guest").slice(0, 48);
    const name = (data.author || vk?.name || "Гость").slice(0, 32);
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

    if (data.action === "list") return listMem();

    if (data.action === "add") {
      const url = cleanUrl(data.url || "");
      if (!url) return { ok: false as const, error: "Нужна ссылка https://…" };
      const kind = data.kind === "release" ? "release" : "draft";
      const row: YardSong = {
        id: crypto.randomUUID(),
        kind,
        url,
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
      song.hook += hook;
      song.lyric += lyric;
      song.music += music;
      song.orig += orig;
      song.n += 1;
      recount(song.vk, song.author, null);
      return listMem();
    }

    if (data.action === "glory") {
      recount(vkId, name, Math.max(0, Math.round(Number(data.frames || 0))));
      return { ok: true, shared: false, heroes: heroRows() };
    }

    if (data.action === "hear") {
      const song = mem.songs.find((s) => s.id === data.songId && s.kind === "release");
      if (!song) return { ok: false as const, error: "Песни нет." };
      if (song.vk === vkId) return { ok: false as const, error: "Своя песня нот не даёт." };
      const key = `${song.id}:${vkId}`;
      if (mem.hears.has(key)) return { ok: false as const, error: "Уже засчитано." };
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
    if (!text) return { ok: false as const, error: "Пусто." };
    mem.chat.push({ id: crypto.randomUUID(), name, text, at: Date.now() });
    if (mem.chat.length > 80) mem.chat.shift();
    return listMem();
  });
