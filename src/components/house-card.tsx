import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { HOUSES, houseById, type TierId } from "@/lib/homes";
import { useGame } from "@/lib/store";
import { useWallet } from "@/lib/wallet";
import { yardBoard } from "@/lib/yard-desk";

type HomeState = {
  tier?: string;
  listens: number;
  ups: number;
  score: number;
  published: boolean;
  ready: string[];
};

function caller() {
  let heroId = "guest";
  try {
    heroId = localStorage.getItem("yard-hero") || "";
    if (!heroId) {
      heroId = crypto.randomUUID();
      localStorage.setItem("yard-hero", heroId);
    }
  } catch {
    /* без памяти дом всё равно покажем */
  }
  const name = useGame.getState().players.find((player) => player.id === useGame.getState().youId)?.name || "Гость";
  return { heroId, author: name };
}

export function HouseCard({ onClose }: { onClose: () => void }) {
  const notes = useWallet((s) => s.notes);
  const [home, setHome] = useState<HomeState | null>(null);
  const [busy, setBusy] = useState(false);
  const standing = houseById(home?.tier);

  async function load() {
    const res = await yardBoard({ data: { action: "home", ...caller() } });
    if (!res.ok) {
      toast.error(res.error || "Дом не открылся.");
      return;
    }
    setHome({
      tier: res.tier,
      listens: res.listens || 0,
      ups: res.ups || 0,
      score: res.score || 0,
      published: Boolean(res.published),
      ready: res.ready || [],
    });
  }

  useEffect(() => {
    void load();
  }, []);

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[86%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Дом</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        {home?.tier ? (
          <img src={standing.img} alt={standing.title} className="mb-3 mx-auto h-36 w-auto max-w-full rounded-xl object-contain" />
        ) : (
          <p className="mb-3 text-sm text-muted">Пока пустой участок. Палатка даётся сразу.</p>
        )}
        <p className="text-sm text-muted">
          На счету {notes} нот. Прослушивания {home?.listens ?? "…"} · тёплые отзывы {home?.ups ?? "…"} · рейтинг{" "}
          {home?.score ?? "…"} · треки на сцене {home ? (home.published ? "есть" : "нет") : "…"}
        </p>
        <p className="mt-1 text-xs text-muted">Тёплый отзыв — оценка от 4. Рейтинг — сумма всех оценок у шарманщика.</p>
        <div className="mt-3 flex flex-col gap-2">
          {HOUSES.map((house) => {
            const open = home?.ready.includes(house.id);
            const mine = home?.tier === house.id;
            return (
              <div key={house.id} className="flex items-center gap-3 rounded-xl border border-border bg-surface px-2 py-2">
                <img src={house.img} alt="" className="size-16 rounded-lg object-cover" />
                <div className="min-w-0 flex-1">
                  <p className="font-medium text-fg">
                    {house.title}
                    {mine ? " · стоит" : ""}
                  </p>
                  <p className="text-xs text-muted">
                    {house.who}. {house.need}
                    {house.cost ? ` · ${house.cost} нот` : ""}
                  </p>
                </div>
                <Button
                  variant="secondary"
                  className="shrink-0 rounded-xl"
                  disabled={!open || mine || busy}
                  onClick={() => {
                    void (async () => {
                      setBusy(true);
                      try {
                        const res = await yardBoard({ data: { action: "build", tier: house.id as TierId, ...caller() } });
                        if (!res.ok) {
                          toast.error(res.error || "Не поставилось.");
                          return;
                        }
                        if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
                        toast.success(`${house.title} стоит.`);
                        await load();
                      } finally {
                        setBusy(false);
                      }
                    })();
                  }}
                >
                  {mine ? "Твой" : house.cost ? `${house.cost}` : "Поставить"}
                </Button>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
