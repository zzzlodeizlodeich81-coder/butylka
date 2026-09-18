import { NOTE_PACKS, NOTE_PRICE, packById, type PaidKind } from "@/lib/notes";
import { isPreviewUser, type VkUser } from "@/lib/vk/session.server";

type Sql = { query: <T = Record<string, unknown>>(text: string, params?: unknown[]) => Promise<T[]> };

type WalletRow = { vk_id: string; name: string; notes: number };

const g = globalThis as typeof globalThis & {
  __notesNeon__?: Sql;
  __notesSchema__?: Promise<void>;
  __notesMem__?: Map<string, { name: string; notes: number; orders: Set<string> }>;
};

function mem() {
  g.__notesMem__ ??= new Map();
  return g.__notesMem__;
}

function dbUrl() {
  try {
    return process.env.DATABASE_URL?.trim() || "";
  } catch {
    return "";
  }
}

async function getSql(): Promise<Sql | null> {
  const url = dbUrl();
  if (!url) return null;
  if (g.__notesNeon__) return g.__notesNeon__;
  const { neon } = await import("@neondatabase/serverless");
  const sql = neon(url, { disableWarningInBrowsers: true });
  const wrapper: Sql = {
    query: async <T>(text: string, params: unknown[] = []) => {
      const rows = await sql.query(text, params);
      return (Array.isArray(rows) ? rows : []) as T[];
    },
  };
  g.__notesNeon__ = wrapper;
  return wrapper;
}

async function ensure(sql: Sql) {
  g.__notesSchema__ ??= (async () => {
    await sql.query(
      `create table if not exists vk_wallets (
         vk_id text primary key,
         name text not null default '',
         notes integer not null default 0,
         created_at timestamptz not null default now()
       )`,
    );
    await sql.query(
      `create table if not exists vk_orders (
         vk_order_id text primary key,
         vk_id text not null,
         item text not null,
         votes integer not null,
         notes integer not null,
         status text not null,
         created_at timestamptz not null default now()
       )`,
    );
    await sql.query(
      `create table if not exists vk_spends (
         id bigserial primary key,
         vk_id text not null,
         kind text not null,
         notes integer not null,
         created_at timestamptz not null default now()
       )`,
    );
  })().catch((err) => {
    g.__notesSchema__ = undefined;
    throw err;
  });
  return g.__notesSchema__;
}

function memWallet(vkId: string, name: string) {
  const rooms = mem();
  let row = rooms.get(vkId);
  if (!row) {
    row = { name, notes: isPreviewUser(vkId) ? 200 : 0, orders: new Set() };
    rooms.set(vkId, row);
  } else if (name && row.name !== name) {
    row.name = name;
  }
  return row;
}

export async function readWallet(user: VkUser): Promise<{ notes: number; name: string }> {
  const sql = await getSql();
  if (!sql) {
    const row = memWallet(user.vkId, user.name);
    return { notes: row.notes, name: row.name };
  }
  await ensure(sql);
  const rows = await sql.query<WalletRow>(
    `insert into vk_wallets (vk_id, name, notes)
     values ($1, $2, $3)
     on conflict (vk_id) do update set name = case when excluded.name = '' then vk_wallets.name else excluded.name end
     returning vk_id, name, notes`,
    [user.vkId, user.name, isPreviewUser(user.vkId) ? 200 : 0],
  );
  const row = rows[0];
  return { notes: Number(row?.notes ?? 0), name: row?.name || user.name };
}

export async function spendNotes(user: VkUser, kind: PaidKind): Promise<{ ok: true; notes: number } | { ok: false; error: string; notes: number }> {
  const cost = NOTE_PRICE[kind];
  const sql = await getSql();
  if (!sql) {
    const row = memWallet(user.vkId, user.name);
    if (row.notes < cost) {
      return { ok: false, error: `Нужно ${cost} нот.`, notes: row.notes };
    }
    row.notes -= cost;
    return { ok: true, notes: row.notes };
  }
  await ensure(sql);
  await readWallet(user);
  const rows = await sql.query<WalletRow>(
    `update vk_wallets set notes = notes - $2
     where vk_id = $1 and notes >= $2
     returning vk_id, name, notes`,
    [user.vkId, cost],
  );
  if (!rows[0]) {
    const cur = await readWallet(user);
    return { ok: false, error: `Нужно ${cost} нот.`, notes: cur.notes };
  }
  await sql.query(`insert into vk_spends (vk_id, kind, notes) values ($1, $2, $3)`, [
    user.vkId,
    kind,
    cost,
  ]);
  return { ok: true, notes: Number(rows[0].notes) };
}

export async function refundNotes(user: VkUser, kind: PaidKind): Promise<number> {
  const cost = NOTE_PRICE[kind];
  const sql = await getSql();
  if (!sql) {
    const row = memWallet(user.vkId, user.name);
    row.notes += cost;
    return row.notes;
  }
  await ensure(sql);
  const rows = await sql.query<WalletRow>(
    `update vk_wallets set notes = notes + $2 where vk_id = $1 returning notes`,
    [user.vkId, cost],
  );
  await sql.query(`insert into vk_spends (vk_id, kind, notes) values ($1, $2, $3)`, [
    user.vkId,
    `refund:${kind}`,
    -cost,
  ]);
  return Number(rows[0]?.notes ?? 0);
}

export async function creditPack(
  vkId: string,
  orderId: string,
  item: string,
): Promise<{ ok: true; notes: number } | { ok: false; error: string }> {
  const pack = packById(item);
  if (!pack) return { ok: false, error: "unknown item" };
  const sql = await getSql();
  if (!sql) {
    const row = memWallet(vkId, "");
    if (row.orders.has(orderId)) return { ok: true, notes: row.notes };
    row.orders.add(orderId);
    row.notes += pack.notes;
    return { ok: true, notes: row.notes };
  }
  await ensure(sql);
  await sql.query(
    `insert into vk_wallets (vk_id, name, notes) values ($1, '', 0)
     on conflict (vk_id) do nothing`,
    [vkId],
  );
  const exists = await sql.query<{ vk_order_id: string }>(
    `select vk_order_id from vk_orders where vk_order_id = $1`,
    [orderId],
  );
  if (exists[0]) {
    const cur = await sql.query<WalletRow>(`select vk_id, name, notes from vk_wallets where vk_id = $1`, [vkId]);
    return { ok: true, notes: Number(cur[0]?.notes ?? 0) };
  }
  await sql.query(
    `insert into vk_orders (vk_order_id, vk_id, item, votes, notes, status)
     values ($1, $2, $3, $4, $5, 'charged')`,
    [orderId, vkId, item, pack.votes, pack.notes],
  );
  const rows = await sql.query<WalletRow>(
    `update vk_wallets set notes = notes + $2 where vk_id = $1 returning vk_id, name, notes`,
    [vkId, pack.notes],
  );
  return { ok: true, notes: Number(rows[0]?.notes ?? pack.notes) };
}

export { NOTE_PACKS };
