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

type Mem = {
  songs: YardSong[];
  rates: Set<string>;
  hears: Set<string>;
  chat: YardLine[];
};

const mem: Mem = { songs: [], rates: new Set(), hears: new Set(), chat: [] };

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

type BoardRes = {
  ok: boolean;
  error?: string;
  shared?: boolean;
  songs?: YardSong[];
  chat?: YardLine[];
  notes?: number;
  credit?: number;
  local?: boolean;
};

export const yardBoard = createServerFn({ method: "POST" })
  .middleware([vkMiddleware])
  .validator(
    (input: {
      action: "list" | "add" | "rate" | "hear" | "say";
      kind?: "draft" | "release";
      url?: string;
      songId?: string;
      text?: string;
      hook?: number;
      lyric?: number;
      music?: number;
      orig?: number;
      author?: string;
    }) => input,
  )
  .handler(async ({ data, context }): Promise<BoardRes> => {
    const vk = context.vk;
    const vkId = vk?.vkId || "guest";
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
      return listMem();
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
