import { Music, X } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { NOTE_LABEL, NOTE_PACKS, NOTE_PRICE, cookCost } from "@/lib/notes";
import { buyPack } from "@/lib/vk/boot";
import { useWallet } from "@/lib/wallet";

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

export function NotesShop() {
  const open = useWallet((s) => s.shopOpen);
  const setShop = useWallet((s) => s.setShop);
  const notes = useWallet((s) => s.notes);
  const inVk = useWallet((s) => s.inVk);
  const vkId = useWallet((s) => s.vkId);
  if (!open) return null;

  async function buy(id: string) {
    const hit = await buyPack(id);
    if (!hit.ok) {
      toast.error(hit.error ?? "Не купилось.");
      return;
    }
    toast.success("Ноты на балансе.");
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-fg/40 p-4 sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="font-display text-2xl text-fg">Ноты</p>
            <p className="mt-1 text-sm text-muted">
              Баланс {notes}. Покупка — голосами VK. Файлы качаем сразу, на сервере не храним.
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
          <li>Стихи + трек + минус — {cookCost()} нот</li>
        </ul>
        <div className="mt-4 grid grid-cols-2 gap-2">
          {NOTE_PACKS.map((pack) => (
            <Button
              key={pack.id}
              variant="secondary"
              className="h-auto flex-col items-start rounded-xl py-3 text-left"
              disabled={!inVk && vkId !== "preview"}
              onClick={() => void buy(pack.id)}
            >
              <span className="font-medium text-fg">{pack.title}</span>
              <span className="text-xs text-muted">
                {pack.votes} голосов · {pack.hint}
              </span>
            </Button>
          ))}
        </div>
        {!inVk ? (
          <p className="mt-3 text-sm text-muted">
            Голоса списываются только внутри ВКонтакте. Открой мини-приложение — и пачки заработают.
          </p>
        ) : null}
      </div>
    </div>
  );
}
