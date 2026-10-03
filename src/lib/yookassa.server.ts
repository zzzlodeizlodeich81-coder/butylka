import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { packById } from "@/lib/notes";
import { addPurse, readPurse } from "@/lib/purse.server";

type Pay = {
  id: string;
  guest: string;
  pack: string;
  notes: number;
  rub: string;
  status: "pending" | "paid";
};

type RemotePay = {
  id?: string;
  status?: string;
  paid?: boolean;
  amount?: { value?: string; currency?: string };
  metadata?: { guest?: string; pack?: string };
  confirmation?: { confirmation_url?: string };
  description?: string;
};

function shopId() {
  return (process.env.YOOKASSA_SHOP_ID || "").trim();
}

function secret() {
  return (process.env.YOOKASSA_SECRET_KEY || "").trim();
}

export function yooOn() {
  return Boolean(shopId() && secret());
}

function authHeader() {
  return `Basic ${Buffer.from(`${shopId()}:${secret()}`).toString("base64")}`;
}

function payFile() {
  return process.env.YOOKASSA_FILE || join(process.cwd(), "data", "yookassa.json");
}

async function readPays() {
  try {
    const parsed = JSON.parse(await readFile(payFile(), "utf8")) as { pays?: Pay[] };
    return Array.isArray(parsed.pays) ? parsed.pays : [];
  } catch {
    return [] as Pay[];
  }
}

async function writePays(pays: Pay[]) {
  const path = payFile();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify({ pays: pays.slice(-400) }), "utf8");
}

let chain: Promise<unknown> = Promise.resolve();

function locked<T>(fn: () => Promise<T>) {
  const run = chain.then(fn, fn);
  chain = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
}

export function packRub(id: string) {
  const pack = packById(id);
  if (!pack) return null;
  return { pack, rub: (pack.votes * 7).toFixed(2) };
}

async function pullPayment(id: string) {
  const res = await fetch(`https://api.yookassa.ru/v3/payments/${encodeURIComponent(id)}`, {
    headers: { Authorization: authHeader() },
  });
  if (!res.ok) return null;
  return (await res.json()) as RemotePay;
}

async function applyOne(pays: Pay[], id: string) {
  const row = pays.find((item) => item.id === id);
  if (!row) return { ok: false as const, error: "Платёж не наш.", notes: 0 };
  if (row.status === "paid") {
    const guest = await readPurse(row.guest);
    return { ok: true as const, notes: guest?.notes ?? 0 };
  }
  const remote = await pullPayment(id);
  if (!remote || remote.status !== "succeeded") return { ok: false as const, error: "Оплата ещё не прошла.", notes: 0 };
  if (remote.amount?.currency !== "RUB" || remote.amount.value !== row.rub) {
    return { ok: false as const, error: "Сумма не сошлась.", notes: 0 };
  }
  if (remote.metadata?.guest !== row.guest || remote.metadata?.pack !== row.pack) {
    return { ok: false as const, error: "Платёж чужой.", notes: 0 };
  }
  const credited = await addPurse(row.guest, row.notes);
  if (!credited) return { ok: false as const, error: "Ноты не легли.", notes: 0 };
  row.status = "paid";
  return { ok: true as const, notes: credited.notes };
}

export async function startPay(guestId: string, packId: string, returnUrl: string, email: string) {
  const priced = packRub(packId);
  if (!priced) return { ok: false as const, error: "Нет такой пачки." };
  if (!yooOn()) return { ok: false as const, error: "ЮKassa ещё не включена." };
  const body: Record<string, unknown> = {
    amount: { value: priced.rub, currency: "RUB" },
    capture: true,
    confirmation: { type: "redirect", return_url: returnUrl },
    description: `${priced.pack.title} · XXV Kadr`,
    metadata: { guest: guestId, pack: packId },
  };
  const mail = email.trim().slice(0, 80);
  if (mail.includes("@")) {
    body.receipt = {
      customer: { email: mail },
      items: [
        {
          description: priced.pack.title,
          quantity: "1.00",
          amount: { value: priced.rub, currency: "RUB" },
          vat_code: Number(process.env.YOOKASSA_VAT || 1) || 1,
          payment_mode: "full_payment",
          payment_subject: "service",
        },
      ],
    };
  }
  const res = await fetch("https://api.yookassa.ru/v3/payments", {
    method: "POST",
    headers: {
      Authorization: authHeader(),
      "Idempotence-Key": randomUUID(),
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  const data = (await res.json().catch(() => null)) as RemotePay | null;
  const url = data?.confirmation?.confirmation_url || "";
  if (!res.ok || !data?.id || !url) return { ok: false as const, error: data?.description || "ЮKassa не открыла оплату." };
  const pay: Pay = {
    id: data.id,
    guest: guestId,
    pack: packId,
    notes: priced.pack.notes,
    rub: priced.rub,
    status: "pending",
  };
  await locked(async () => {
    const pays = await readPays();
    pays.push(pay);
    await writePays(pays);
  });
  return { ok: true as const, url };
}

export async function settlePay(id: string) {
  if (!yooOn() || !id) return { ok: false as const, error: "Нет платежа.", notes: 0 };
  return locked(async () => {
    const pays = await readPays();
    const res = await applyOne(pays, id);
    if (res.ok) await writePays(pays);
    return res;
  });
}

export async function settleGuest(guestId: string) {
  if (!yooOn()) return { ok: false as const, notes: 0 };
  return locked(async () => {
    const pays = await readPays();
    const pending = pays.filter((item) => item.guest === guestId && item.status === "pending").slice(-5);
    let notes = 0;
    let hit = false;
    for (const row of pending) {
      const res = await applyOne(pays, row.id);
      if (res.ok) {
        notes = res.notes;
        hit = true;
      }
    }
    if (hit) await writePays(pays);
    return { ok: hit, notes };
  });
}
