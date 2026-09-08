/**
 * WebRTC signaling + shared table state.
 *
 * On Vercel, node-postgres / PGLite both 500 (TCP + missing WASM). This file
 * never imports `@/lib/db`. It talks to Neon over HTTP when DATABASE_URL is
 * set, otherwise an in-memory roster. A failure never returns 500 — empty
 * roster is better than a dead table.
 */
import { z } from "zod";
import type { PeerRow, RtcPollResponse, SignalRow } from "./p2p";

const ID = z.string().regex(/^[a-zA-Z0-9_-]{1,64}$/);
const signalSchema = z.object({
  op: z.literal("signal"),
  room: ID,
  from: ID,
  to: ID,
  kind: z.enum(["offer", "answer", "ice"]),
  payload: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 32_768, {
    message: "payload too large",
  }),
});
const leaveSchema = z.object({ op: z.literal("leave"), room: ID, peer: ID });
const snapSchema = z.object({
  op: z.literal("snap"),
  room: ID,
  from: ID,
  hostId: ID,
  snap: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 200_000, {
    message: "snap too large",
  }),
});
const actSchema = z.object({
  op: z.literal("act"),
  room: ID,
  from: ID,
  act: z.unknown().refine((v) => v !== undefined && JSON.stringify(v).length <= 32_768, {
    message: "act too large",
  }),
});
const postSchema = z.discriminatedUnion("op", [signalSchema, leaveSchema, snapSchema, actSchema]);

const PEER_TTL_MS = 30_000;
const SIGNAL_TTL_MS = 60_000;
const ACT_TTL_MS = 60_000;

type MemPeer = { name: string; seen: number };
type MemSig = { id: number; to: string; from: string; kind: SignalRow["kind"]; payload: unknown; at: number };
type MemAct = { id: number; from: string; act: unknown; at: number };
type MemRoom = {
  peers: Map<string, MemPeer>;
  signals: MemSig[];
  acts: MemAct[];
  nextId: number;
  hostId: string | null;
  snap: unknown | null;
};

const g = globalThis as typeof globalThis & { __rtcMem__?: Map<string, MemRoom> };
function mem() {
  g.__rtcMem__ ??= new Map();
  return g.__rtcMem__;
}

function roomOf(code: string): MemRoom {
  const rooms = mem();
  let r = rooms.get(code);
  if (!r) {
    r = { peers: new Map(), signals: [], acts: [], nextId: 1, hostId: null, snap: null };
    rooms.set(code, r);
  }
  return r;
}

function pruneMem(r: MemRoom, now = Date.now()) {
  for (const [id, p] of r.peers) if (now - p.seen > PEER_TTL_MS) r.peers.delete(id);
  r.signals = r.signals.filter((s) => now - s.at < SIGNAL_TTL_MS);
  r.acts = r.acts.filter((s) => now - s.at < ACT_TTL_MS);
  if (r.hostId && !r.peers.has(r.hostId)) r.hostId = null;
}

function json(body: unknown, status = 200): Response {
  const text = JSON.stringify(body, (_k, v) => (typeof v === "bigint" ? Number(v) : v));
  return new Response(text, {
    status,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  });
}

function emptyPoll(): RtcPollResponse {
  return { peers: [], signals: [], hostId: null, snap: null, acts: [] };
}

export function requestUrl(request: Request): URL {
  const raw = request.url || "/";
  try {
    return new URL(raw);
  } catch {
    const host = request.headers.get("x-forwarded-host") || request.headers.get("host") || "localhost";
    const proto = request.headers.get("x-forwarded-proto") || "http";
    return new URL(raw, `${proto}://${host}`);
  }
}

function dbUrl(): string {
  try {
    return (typeof process !== "undefined" && process.env.DATABASE_URL?.trim()) || "";
  } catch {
    return "";
  }
}

function withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(label)), ms);
    promise.then(
      (v) => {
        clearTimeout(t);
        resolve(v);
      },
      (e) => {
        clearTimeout(t);
        reject(e);
      },
    );
  });
}

function parseGet(url: URL) {
  return z
    .object({
      room: ID,
      peer: ID,
      name: z.string().max(64).default(""),
      since: z.coerce.number().int().min(0).default(0),
      actSince: z.coerce.number().int().min(0).default(0),
      host: z.string().max(8).optional(),
    })
    .safeParse({
      room: url.searchParams.get("room"),
      peer: url.searchParams.get("peer"),
      name: url.searchParams.get("name") ?? "",
      since: url.searchParams.get("since") ?? 0,
      actSince: url.searchParams.get("actSince") ?? 0,
      host: url.searchParams.get("host") ?? undefined,
    });
}

function claimHost(r: MemRoom, peer: string, wantHost: boolean) {
  if (wantHost) {
    r.hostId = peer;
    return;
  }
  if (r.hostId && r.peers.has(r.hostId)) return;
  r.hostId = peer;
}

function pollBody(r: MemRoom, peer: string, since: number, actSince: number): RtcPollResponse {
  const peers: PeerRow[] = [...r.peers.entries()].map(([id, p]) => ({ id, name: p.name }));
  const signals: SignalRow[] = r.signals
    .filter((s) => s.to === peer && s.id > since)
    .slice(0, 200)
    .map((s) => ({ id: s.id, from: s.from, kind: s.kind, payload: s.payload }));
  const acts = r.acts
    .filter((a) => a.id > actSince && a.from !== peer)
    .slice(0, 100)
    .map((a) => ({ id: a.id, from: a.from, act: a.act }));
  return { peers, signals, hostId: r.hostId, snap: r.snap, acts };
}

function handleGetMem(url: URL): Response {
  const parsed = parseGet(url);
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const { room, peer, name, since, actSince, host } = parsed.data;
  const r = roomOf(room);
  pruneMem(r);
  r.peers.set(peer, { name, seen: Date.now() });
  claimHost(r, peer, host === "1");
  return json(pollBody(r, peer, since, actSince));
}

function handlePostMem(msg: z.infer<typeof postSchema>): Response {
  const r = roomOf(msg.room);
  pruneMem(r);
  if (msg.op === "signal") {
    r.signals.push({
      id: r.nextId++,
      to: msg.to,
      from: msg.from,
      kind: msg.kind,
      payload: msg.payload,
      at: Date.now(),
    });
  } else if (msg.op === "leave") {
    r.peers.delete(msg.peer);
    if (r.hostId === msg.peer) r.hostId = null;
  } else if (msg.op === "snap") {
    r.hostId = msg.hostId;
    r.snap = msg.snap;
  } else {
    r.acts.push({ id: r.nextId++, from: msg.from, act: msg.act, at: Date.now() });
  }
  return json({ ok: true });
}

type Sql = { query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]> };

const globalRef = globalThis as typeof globalThis & {
  __rtcSchemaPromise__?: Promise<void>;
  __rtcNeon__?: Sql;
};

async function getNeonSql(): Promise<Sql | null> {
  const url = dbUrl();
  if (!url) return null;
  if (globalRef.__rtcNeon__) return globalRef.__rtcNeon__;
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url, { disableWarningInBrowsers: true });
  const wrapper: Sql = {
    query: async <T>(text: string, params: unknown[] = []) => {
      const rows = await sql.query(text, params);
      return (Array.isArray(rows) ? rows : []) as T[];
    },
  };
  globalRef.__rtcNeon__ = wrapper;
  return wrapper;
}

function ensureSchema(sql: Sql): Promise<void> {
  globalRef.__rtcSchemaPromise__ ??= (async () => {
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_peers (
         room TEXT NOT NULL,
         peer_id TEXT NOT NULL,
         name TEXT NOT NULL DEFAULT '',
         last_seen TIMESTAMPTZ NOT NULL DEFAULT now(),
         PRIMARY KEY (room, peer_id)
       )`,
    );
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_signals (
         id BIGSERIAL PRIMARY KEY,
         room TEXT NOT NULL,
         to_peer TEXT NOT NULL,
         from_peer TEXT NOT NULL,
         kind TEXT NOT NULL,
         payload JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS webrtc_signals_inbox
         ON webrtc_signals (room, to_peer, id)`,
    );
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_rooms (
         room TEXT PRIMARY KEY,
         host_id TEXT,
         snap JSONB,
         updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE TABLE IF NOT EXISTS webrtc_acts (
         id BIGSERIAL PRIMARY KEY,
         room TEXT NOT NULL,
         from_peer TEXT NOT NULL,
         act JSONB NOT NULL,
         created_at TIMESTAMPTZ NOT NULL DEFAULT now()
       )`,
    );
    await sql.query(
      `CREATE INDEX IF NOT EXISTS webrtc_acts_inbox
         ON webrtc_acts (room, id)`,
    );
  })().catch((err) => {
    globalRef.__rtcSchemaPromise__ = undefined;
    throw err;
  });
  return globalRef.__rtcSchemaPromise__;
}

function asJson(value: unknown): string {
  return JSON.stringify(value ?? null);
}

async function handleSqlGet(url: URL): Promise<Response> {
  const parsed = parseGet(url);
  if (!parsed.success) return json({ error: "invalid query" }, 400);
  const sql = await getNeonSql();
  if (!sql) throw new Error("no neon");
  const { room, peer, name, since, actSince, host } = parsed.data;
  await ensureSchema(sql);
  await sql.query(
    `INSERT INTO webrtc_peers (room, peer_id, name, last_seen)
     VALUES ($1, $2, $3, now())
     ON CONFLICT (room, peer_id)
     DO UPDATE SET last_seen = now(), name = EXCLUDED.name`,
    [room, peer, name],
  );
  await sql.query(`DELETE FROM webrtc_peers WHERE last_seen < now() - interval '30 seconds'`);
  await sql.query(`DELETE FROM webrtc_signals WHERE created_at < now() - interval '60 seconds'`);
  await sql.query(`DELETE FROM webrtc_acts WHERE created_at < now() - interval '60 seconds'`);
  await sql.query(
    `INSERT INTO webrtc_rooms (room, host_id, updated_at)
     VALUES ($1, $2, now())
     ON CONFLICT (room) DO NOTHING`,
    [room, host === "1" ? peer : null],
  );
  if (host === "1") {
    await sql.query(`UPDATE webrtc_rooms SET host_id = $2, updated_at = now() WHERE room = $1`, [
      room,
      peer,
    ]);
  } else {
    await sql.query(
      `UPDATE webrtc_rooms SET host_id = $2, updated_at = now()
       WHERE room = $1 AND (host_id IS NULL
         OR host_id NOT IN (SELECT peer_id FROM webrtc_peers WHERE room = $1 AND last_seen > now() - interval '30 seconds'))`,
      [room, peer],
    );
  }
  const rows = await sql.query<{
    id: number | string;
    from_peer: string;
    kind: SignalRow["kind"];
    payload: unknown;
  }>(
    `SELECT id, from_peer, kind, payload FROM webrtc_signals
     WHERE room = $1 AND to_peer = $2 AND id > $3
     ORDER BY id LIMIT 200`,
    [room, peer, since],
  );
  const actRows = await sql.query<{ id: number | string; from_peer: string; act: unknown }>(
    `SELECT id, from_peer, act FROM webrtc_acts
     WHERE room = $1 AND id > $2 AND from_peer <> $3
     ORDER BY id LIMIT 100`,
    [room, actSince, peer],
  );
  const roster = await sql.query<{ peer_id: string; name: string }>(
    `SELECT peer_id, name FROM webrtc_peers
     WHERE room = $1 AND last_seen > now() - interval '30 seconds'
     ORDER BY peer_id LIMIT 32`,
    [room],
  );
  const roomRow = await sql.query<{ host_id: string | null; snap: unknown }>(
    `SELECT host_id, snap FROM webrtc_rooms WHERE room = $1`,
    [room],
  );
  const body: RtcPollResponse = {
    peers: roster.map((row) => ({ id: row.peer_id, name: row.name })),
    signals: rows.map((row) => ({
      id: Number(row.id),
      from: row.from_peer,
      kind: row.kind,
      payload: row.payload,
    })),
    hostId: roomRow[0]?.host_id ?? null,
    snap: roomRow[0]?.snap ?? null,
    acts: actRows.map((row) => ({ id: Number(row.id), from: row.from_peer, act: row.act })),
  };
  return json(body);
}

async function handleSqlPost(msg: z.infer<typeof postSchema>): Promise<Response> {
  const sql = await getNeonSql();
  if (!sql) throw new Error("no neon");
  await ensureSchema(sql);
  if (msg.op === "signal") {
    await sql.query(
      `INSERT INTO webrtc_signals (room, to_peer, from_peer, kind, payload)
       VALUES ($1, $2, $3, $4, $5::jsonb)`,
      [msg.room, msg.to, msg.from, msg.kind, asJson(msg.payload)],
    );
  } else if (msg.op === "leave") {
    await sql.query(`DELETE FROM webrtc_peers WHERE room = $1 AND peer_id = $2`, [msg.room, msg.peer]);
    await sql.query(
      `UPDATE webrtc_rooms SET host_id = NULL, updated_at = now() WHERE room = $1 AND host_id = $2`,
      [msg.room, msg.peer],
    );
  } else if (msg.op === "snap") {
    await sql.query(
      `INSERT INTO webrtc_rooms (room, host_id, snap, updated_at)
       VALUES ($1, $2, $3::jsonb, now())
       ON CONFLICT (room)
       DO UPDATE SET host_id = EXCLUDED.host_id, snap = EXCLUDED.snap, updated_at = now()`,
      [msg.room, msg.hostId, asJson(msg.snap)],
    );
  } else {
    await sql.query(`INSERT INTO webrtc_acts (room, from_peer, act) VALUES ($1, $2, $3::jsonb)`, [
      msg.room,
      msg.from,
      asJson(msg.act),
    ]);
  }
  return json({ ok: true });
}

export async function handleSignaling(request: Request): Promise<Response> {
  try {
    const url = requestUrl(request);
    if (request.method === "GET") {
      if (dbUrl()) {
        try {
          return await withTimeout(handleSqlGet(url), 5000, "sql get timeout");
        } catch (error) {
          console.error("[rtc] sql get failed, memory:", error);
        }
      }
      return handleGetMem(url);
    }
    if (request.method === "POST") {
      let body: unknown;
      try {
        body = await request.json();
      } catch {
        return json({ error: "invalid JSON" }, 400);
      }
      const parsed = postSchema.safeParse(body);
      if (!parsed.success) return json({ error: "invalid request" }, 400);
      if (dbUrl()) {
        try {
          return await withTimeout(handleSqlPost(parsed.data), 5000, "sql post timeout");
        } catch (error) {
          console.error("[rtc] sql post failed, memory:", error);
        }
      }
      return handlePostMem(parsed.data);
    }
    return json({ error: "method not allowed" }, 405);
  } catch (error) {
    console.error("[rtc] signaling error:", error);
    try {
      if (request.method === "GET") return handleGetMem(requestUrl(request));
      return json({ ok: true, degraded: true });
    } catch {
      return json({ ...emptyPoll(), error: "degraded" });
    }
  }
}
