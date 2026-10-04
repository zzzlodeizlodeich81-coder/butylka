import { randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { PLOT_PRICE, TOOLS, TOOLS_ALL, WAR_STAKE, type PlotKind, type ToolId } from "@/lib/lands";
import { addPurse, currentGuest, readPurse, spendPurse } from "@/lib/purse.server";

type Plot = {
  id: string;
  owner: string;
  name: string;
  kind: PlotKind;
  tools: ToolId[];
  code: string;
  members: string[];
  bank: number;
  state: string;
};

type Track = { side: "a" | "b"; by: string; url: string };
type War = {
  id: string;
  a: string;
  b: string;
  tracks: Track[];
  votes: { by: string; url: string }[];
  until: number;
  pot: number;
  choice?: "paid" | "state";
};

type Book = { plots: Plot[]; wars: War[] };

function filePath() {
  return join(process.cwd(), "data", "lands.json");
}

async function readBook(): Promise<Book> {
  try {
    const raw = JSON.parse(await readFile(filePath(), "utf8")) as Book;
    return {
      plots: Array.isArray(raw.plots) ? raw.plots : [],
      wars: Array.isArray(raw.wars) ? raw.wars : [],
    };
  } catch {
    return { plots: [], wars: [] };
  }
}

async function writeBook(book: Book) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(book));
}

export async function plotRoom(id: string) {
  const clean = id.trim().slice(0, 16);
  if (!clean) return "";
  const book = await readBook();
  return book.plots.some((plot) => plot.id === clean) ? clean : "";
}

export async function hasHome(playerId: string) {
  const book = await readBook();
  return book.plots.some((plot) => plot.owner === playerId || plot.members.includes(playerId));
}

export async function communityOf(playerId: string) {
  const book = await readBook();
  const plot = book.plots.find((item) => item.kind === "commune" && (item.owner === playerId || item.members.includes(playerId)));
  return plot?.id || "";
}

function pub(plot: Plot, viewer: string) {
  return {
    id: plot.id,
    name: plot.name,
    kind: plot.kind,
    tools: plot.tools,
    code: plot.owner === viewer ? plot.code : "",
    bank: plot.bank,
    state: plot.state,
    owner: plot.owner === viewer,
    member: plot.owner === viewer || plot.members.includes(viewer),
    heads: plot.members.length + 1,
  };
}

function toolById(id: string) {
  return TOOLS.find((tool) => tool.id === id);
}

export async function runLand(data: {
  action: "look" | "buy" | "tool" | "bundle" | "join" | "war" | "track" | "vote" | "settle" | "roster" | "kick";
  kind?: PlotKind;
  title?: string;
  tool?: string;
  code?: string;
  plot?: string;
  url?: string;
  how?: "paid" | "state";
  who?: string;
}) {
    const guest = currentGuest();
    if (!guest) return { ok: false as const, error: "Сначала зайди.", notes: 0 };
    const book = await readBook();
    const mine = book.plots.find((plot) => plot.owner === guest.id);

    if (data.action === "look") {
      const wars = book.wars.map((war) => ({
        id: war.id,
        a: book.plots.find((plot) => plot.id === war.a)?.name || "…",
        b: book.plots.find((plot) => plot.id === war.b)?.name || "…",
        aId: war.a,
        bId: war.b,
        until: war.until,
        open: Date.now() < war.until && !war.choice,
        choice: war.choice || "",
        tracks: war.tracks.map((track) => ({ side: track.side, url: track.url })),
        mine: mine?.id === war.a || mine?.id === war.b ? war.votes.filter((vote) => vote.by === guest.id).length : 0,
      }));
      return {
        ok: true as const,
        notes: (await readPurse(guest.id))?.notes ?? 0,
        mine: mine ? { ...pub(mine, guest.id), heads: mine.members.length + 1 } : null,
        commune: (() => {
          const joined = book.plots.find((plot) => plot.kind === "commune" && (plot.owner === guest.id || plot.members.includes(guest.id)));
          return joined ? pub(joined, guest.id) : null;
        })(),
        plots: book.plots.map((plot) => pub(plot, guest.id)),
        wars,
      };
    }

    if (data.action === "buy") {
      const kind = data.kind;
      if (!kind || !(kind in PLOT_PRICE)) return { ok: false as const, error: "Такого места нет." };
      if (kind === ("tent" as PlotKind)) return { ok: false as const, error: "Палатку на карту не ставят." };
      if (mine) return { ok: false as const, error: "Место уже куплено." };
      const title = (data.title || "").trim().slice(0, 32);
      if (kind === "commune" && title.length < 2) return { ok: false as const, error: "Сообществу нужно имя." };
      const paid = await spendPurse(guest.id, PLOT_PRICE[kind]);
      if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
      const plot: Plot = {
        id: randomBytes(4).toString("hex"),
        owner: guest.id,
        name: title || guest.name,
        kind,
        tools: [],
        code: randomBytes(2).toString("hex"),
        members: [],
        bank: 0,
        state: "",
      };
      book.plots.push(plot);
      for (const other of book.plots) {
        if (other.id !== plot.id) other.members = other.members.filter((id) => id !== guest.id);
      }
      await writeBook(book);
      return { ok: true as const, notes: paid.notes, mine: pub(plot, guest.id) };
    }

    if (data.action === "join") {
      const plot = book.plots.find((item) => item.code === (data.code || "").trim().toLowerCase());
      if (!plot) return { ok: false as const, error: "Кода нет." };
      if (mine && mine.id !== plot.id) return { ok: false as const, error: "Свой двор уже есть. В чужой можно только в гости." };
      for (const other of book.plots) {
        if (other.id !== plot.id) other.members = other.members.filter((id) => id !== guest.id);
      }
      if (plot.owner !== guest.id && !plot.members.includes(guest.id)) plot.members.push(guest.id);
      await writeBook(book);
      return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0 };
    }

    if (data.action === "roster") {
      const plot = book.plots.find((item) => item.id === data.plot);
      if (!plot) return { ok: false as const, error: "Двора нет." };
      const ids = [plot.owner, ...plot.members];
      const people = [];
      for (const id of ids) {
        const row = await readPurse(id);
        people.push({ id, name: row?.name || "Житель", owner: id === plot.owner });
      }
      return {
        ok: true as const,
        notes: (await readPurse(guest.id))?.notes ?? 0,
        name: plot.name,
        owner: plot.owner === guest.id,
        code: plot.owner === guest.id ? plot.code : "",
        people,
      };
    }

    if (data.action === "kick") {
      const plot = book.plots.find((item) => item.id === data.plot && item.owner === guest.id);
      if (!plot) return { ok: false as const, error: "Список только у хозяина двора." };
      plot.members = plot.members.filter((id) => id !== data.who);
      await writeBook(book);
      return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0 };
    }

    const sideOf = (plotId: string) => {
      const plot = book.plots.find((item) => item.id === plotId);
      if (!plot) return "";
      if (plot.owner === guest.id || plot.members.includes(guest.id)) return plot.id;
      return "";
    };

    if (data.action === "track" || data.action === "vote") {
      const open = book.wars.find((item) => !item.choice && Date.now() < item.until && (sideOf(item.a) || sideOf(item.b)));
      if (!open) return { ok: false as const, error: "Своей войны сейчас нет." };
      if (data.action === "vote") {
        const url = (data.url || "").trim();
        if (!open.tracks.some((track) => track.url === url)) return { ok: false as const, error: "Такого трека нет." };
        if (open.votes.some((vote) => vote.by === guest.id)) return { ok: false as const, error: "Голос уже отдан." };
        open.votes.push({ by: guest.id, url });
        await writeBook(book);
        return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0 };
      }
      const side = sideOf(open.a) ? "a" : "b";
      const url = (data.url || "").trim().slice(0, 300);
      if (!/^https:\/\//i.test(url)) return { ok: false as const, error: "Нужна ссылка https://…" };
      if (open.tracks.filter((track) => track.side === side).length >= 5) return { ok: false as const, error: "Пять треков уже стоят." };
      const paid = await spendPurse(guest.id, WAR_STAKE);
      if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
      open.tracks.push({ side, by: guest.id, url });
      open.pot += WAR_STAKE;
      await writeBook(book);
      return { ok: true as const, notes: paid.notes };
    }

    if (data.action === "tool" || data.action === "bundle") {
      if (!mine) return { ok: false as const, error: "Сначала купи место." };
      const want = data.action === "bundle" ? TOOLS.map((tool) => tool.id) : [data.tool || ""];
      const fresh = want.filter((id): id is ToolId => Boolean(toolById(id)) && !mine.tools.includes(id as ToolId));
      if (!fresh.length) return { ok: false as const, error: "Это уже стоит." };
      const price = data.action === "bundle" ? TOOLS_ALL : fresh.reduce((sum, id) => sum + (toolById(id)?.price || 0), 0);
      const paid = await spendPurse(guest.id, price);
      if (!paid.ok) return { ok: false as const, error: paid.error, notes: paid.notes };
      mine.tools.push(...fresh);
      await writeBook(book);
      return { ok: true as const, notes: paid.notes, mine: pub(mine, guest.id) };
    }

    if (!mine || mine.kind !== "commune") return { ok: false as const, error: "Войны объявляет сообщество." };

    if (data.action === "war") {
      const other = book.plots.find((plot) => plot.id === data.plot && plot.kind === "commune" && plot.id !== mine.id);
      if (!other) return { ok: false as const, error: "Некого звать." };
      if (mine.state && mine.state === other.state) return { ok: false as const, error: "Вы уже одно государство." };
      const busy = book.wars.some((war) => !war.choice && (war.a === mine.id || war.b === mine.id || war.a === other.id || war.b === other.id));
      if (busy) return { ok: false as const, error: "Уже идёт война." };
      book.wars.push({
        id: randomBytes(4).toString("hex"),
        a: mine.id,
        b: other.id,
        tracks: [],
        votes: [],
        until: Date.now() + 24 * 3600 * 1000,
        pot: 0,
      });
      await writeBook(book);
      return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0 };
    }

    const war = book.wars.find((item) => !item.choice && (item.a === mine.id || item.b === mine.id));

    if (data.action === "settle") {
      const open = war && Date.now() >= war.until ? war : undefined;
      if (!open) return { ok: false as const, error: "Рано или это не твоя война." };
      const score = (side: "a" | "b") => open.votes.filter((vote) => open.tracks.find((track) => track.url === vote.url)?.side === side).length;
      const left = score("a");
      const right = score("b");
      const winnerId = left === right ? "" : left > right ? open.a : open.b;
      const loserId = winnerId === open.a ? open.b : winnerId === open.b ? open.a : "";
      if (!winnerId) {
        open.choice = "paid";
        const half = Math.floor(open.pot / 2);
        const a = book.plots.find((plot) => plot.id === open.a);
        const b = book.plots.find((plot) => plot.id === open.b);
        await writeBook(book);
        if (a) await addPurse(a.owner, half);
        if (b) await addPurse(b.owner, open.pot - half);
        return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0 };
      }
      if (data.how === "state" && loserId === mine.id) {
        const state = randomBytes(3).toString("hex");
        const a = book.plots.find((plot) => plot.id === open.a);
        const b = book.plots.find((plot) => plot.id === open.b);
        if (a) a.state = state;
        if (b) b.state = state;
        open.choice = "state";
        await writeBook(book);
        const half = Math.floor(open.pot / 2);
        if (a) await addPurse(a.owner, half);
        if (b) await addPurse(b.owner, open.pot - half);
        return { ok: true as const, notes: (await readPurse(guest.id))?.notes ?? 0 };
      }
      if (data.how === "paid" && loserId === mine.id) {
        const winner = book.plots.find((plot) => plot.id === winnerId);
        open.choice = "paid";
        await writeBook(book);
        const row = winner ? await addPurse(winner.owner, open.pot) : null;
        return { ok: true as const, notes: row?.notes ?? 0 };
      }
      return { ok: false as const, error: "Решает проигравший: отдать ноты или вступить в союз." };
    }

    return { ok: false as const, error: "Не понял.", notes: (await readPurse(guest.id))?.notes ?? 0 };
}
