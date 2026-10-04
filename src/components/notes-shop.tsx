import { Music, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { NOTE_LABEL, NOTE_PACKS, NOTE_PRICE, cookCost } from "@/lib/notes";
import { useGame } from "@/lib/store";
import { useWallet } from "@/lib/wallet";

export function PriceSheet({ onClose }: { onClose: () => void }) {
  const rows = (Object.keys(NOTE_PRICE) as (keyof typeof NOTE_PRICE)[]).map((id) => ({
    id,
    label: NOTE_LABEL[id],
    notes: NOTE_PRICE[id],
  }));
  return (
    <div className="absolute inset-0 z-40 flex items-end bg-black/45">
      <div className="max-h-[80%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl text-fg">Прайс</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="text-sm text-muted">10 нот — 7 ₽. Кадр — 100 нот.</p>
        <ul className="mt-3 space-y-1 text-sm text-fg">
          {rows.map((row) => (
            <li key={row.id} className="flex items-center justify-between gap-3 border-b border-border py-1.5">
              <span>{row.label}</span>
              <span className="tabular-nums text-muted">{row.notes} нот</span>
            </li>
          ))}
          <li className="flex items-center justify-between gap-3 py-1.5">
            <span>Стихи + два трека + минус</span>
            <span className="tabular-nums text-muted">{cookCost()} нот</span>
          </li>
        </ul>
      </div>
    </div>
  );
}

export function NotesButton() {
  const notes = useWallet((s) => s.notes);
  const setShop = useWallet((s) => s.setShop);
  return (
    <button
      type="button"
      className="mr-1 flex items-center gap-1.5 text-sm text-muted"
      onClick={() => setShop(true)}
      aria-label="Ноты"
    >
      <Music className="size-3.5" />
      <span className="tabular-nums">{notes}</span>
    </button>
  );
}

export function KassaReturn() {
  useEffect(() => {
    const url = new URL(window.location.href);
    if (url.searchParams.get("kassa") !== "1") return;
    url.searchParams.delete("kassa");
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
    void (async () => {
      for (let i = 0; i < 6; i += 1) {
        const res = await fetch("/api/yookassa", {
          method: "POST",
          credentials: "same-origin",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "check" }),
        });
        const row = (await res.json()) as { paid?: boolean; notes?: number };
        if (row.paid && typeof row.notes === "number") {
          useWallet.getState().apply({ notes: row.notes });
          useGame.getState().setYouNotes(row.notes);
          toast.success("Ноты на балансе.");
          return;
        }
        await new Promise((resolve) => window.setTimeout(resolve, 2000));
      }
    })();
  }, []);
  return null;
}

export function NotesShop() {
  const open = useWallet((s) => s.shopOpen);
  const setShop = useWallet((s) => s.setShop);
  const notes = useWallet((s) => s.notes);
  const [email, setEmail] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) return null;

  async function buy(id: string) {
    setBusy(true);
    try {
      const res = await fetch("/api/yookassa", {
        method: "POST",
        credentials: "same-origin",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ pack: id, email }),
      });
      const row = (await res.json()) as { ok?: boolean; url?: string; error?: string };
      if (!row.ok || !row.url) {
        toast.error(row.error || "Оплата не открылась.");
        return;
      }
      window.location.href = row.url;
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-fg">Ноты</p>
            <p className="mt-1 text-sm text-muted">
              Баланс {notes}. Оплата картой.
            </p>
          </div>
          <Button variant="ghost" size="icon" aria-label="Закрыть" onClick={() => setShop(false)}>
            <X />
          </Button>
        </div>
        <ul className="mt-4 space-y-1 text-sm text-muted">
          <li>
            {NOTE_LABEL.generate} — {NOTE_PRICE.generate} нот
          </li>
          <li>
            {NOTE_LABEL.minus} — {NOTE_PRICE.minus} нот
          </li>
          <li>
            {NOTE_LABEL.lyrics} — {NOTE_PRICE.lyrics} нот
          </li>
          <li>
            {NOTE_LABEL.cover} — {NOTE_PRICE.cover} нот
          </li>
          <li>
            {NOTE_LABEL.grok} — {NOTE_PRICE.grok} нот
          </li>
          <li>
            {NOTE_LABEL.art} — {NOTE_PRICE.art} нот
          </li>
          <li>
            {NOTE_LABEL.video5} — {NOTE_PRICE.video5} нот
          </li>
          <li>
            {NOTE_LABEL.video10} — {NOTE_PRICE.video10} нот
          </li>
          <li>
            {NOTE_LABEL.video15} — {NOTE_PRICE.video15} нот
          </li>
          <li>
            {NOTE_LABEL.stems} — {NOTE_PRICE.stems} нот
          </li>
          <li>
            {NOTE_LABEL.host} — {NOTE_PRICE.host} нот
          </li>
          <li>
            {NOTE_LABEL.contest} — {NOTE_PRICE.contest} нот
          </li>
          <li>Стихи + два трека + минус — {cookCost()} нот</li>
        </ul>
        <Input
          className="mt-4"
          placeholder="Почта для чека, если ЮKassa спросит"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
        />
        <div className="mt-3 grid grid-cols-2 gap-2">
          {NOTE_PACKS.map((pack) => (
            <Button
              key={pack.id}
              variant="secondary"
              className="h-auto flex-col items-start rounded-xl py-3 text-left"
              disabled={busy}
              onClick={() => void buy(pack.id)}
            >
              <span className="font-medium text-fg">{pack.title}</span>
              <span className="text-xs text-muted">{pack.votes * 7} ₽</span>
            </Button>
          ))}
        </div>
      </div>
    </div>
  );
}
