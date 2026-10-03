import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { PLOT_LABEL, PLOT_PRICE, TOOLS, TOOLS_ALL, WAR_STAKE, type PlotKind } from "@/lib/lands";
import { landDesk } from "@/lib/land-desk";
import { useWallet } from "@/lib/wallet";

type Plot = { id: string; name: string; kind: PlotKind; tools: string[]; code: string; state: string; owner: boolean };
type War = {
  id: string;
  a: string;
  b: string;
  aId: string;
  bId: string;
  until: number;
  open: boolean;
  choice: string;
  tracks: { side: "a" | "b"; url: string }[];
};

export function LandCard({ onClose, onEnter }: { onClose: () => void; onEnter?: (plot: Plot) => void }) {
  const notes = useWallet((s) => s.notes);
  const [mine, setMine] = useState<Plot | null>(null);
  const [commune, setCommune] = useState<Plot | null>(null);
  const [plots, setPlots] = useState<Plot[]>([]);
  const [wars, setWars] = useState<War[]>([]);
  const [title, setTitle] = useState("");
  const [code, setCode] = useState("");
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const res = await landDesk({ data: { action: "look" } });
    if (!res.ok) {
      toast.error(res.error || "Карта не открылась.");
      return;
    }
    if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
    setMine((res.mine as Plot) || null);
    setCommune((res.commune as Plot) || null);
    setPlots((res.plots as Plot[]) || []);
    setWars((res.wars as War[]) || []);
  }

  useEffect(() => {
    void load();
  }, []);

  async function run(body: Parameters<typeof landDesk>[0]["data"]) {
    setBusy(true);
    try {
      const res = await landDesk({ data: body });
      if (typeof res.notes === "number") useWallet.getState().apply({ notes: res.notes });
      if (!res.ok) {
        toast.error(res.error || "Не вышло.");
        return;
      }
      await load();
    } finally {
      setBusy(false);
    }
  }

  const homeName = commune && commune.id !== mine?.id ? commune.name : "";

  return (
    <div className="absolute inset-0 z-10 flex items-end bg-black/35">
      <div className="max-h-[86%] w-full overflow-auto rounded-t-3xl bg-bg px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="font-display text-2xl text-fg">Большая карта</h2>
          <Button variant="ghost" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="text-sm text-muted">Ноты: {notes}. Палатку купить нельзя. Место одно на игрока.</p>
        <div className="relative mt-3 overflow-hidden rounded-xl">
          <img src="/district.jpg" alt="Город" className="h-40 w-full object-cover" />
          <p className="absolute bottom-2 left-2 rounded bg-black/60 px-2 py-0.5 text-xs text-white">Наш двор</p>
        </div>
        <div className="mt-2 flex flex-wrap gap-2">
          {plots.map((plot) => {
            const enter = plot.owner || commune?.id === plot.id;
            return (
              <button
                key={plot.id}
                type="button"
                className="rounded-full bg-[#2a1a0c] px-2 py-1 text-xs text-[#f4e4c4]"
                onClick={() => {
                  if (!enter) {
                    toast.message("Чужой участок. Войти можно только в свой или в своё сообщество.");
                    return;
                  }
                  onEnter?.(plot);
                }}
              >
                {PLOT_LABEL[plot.kind]} · {plot.name}
                {plot.state ? " · государство" : ""}
                {enter ? " · войти" : ""}
              </button>
            );
          })}
        </div>
        {!mine ? (
          <div className="mt-3 flex flex-col gap-2">
            {(Object.keys(PLOT_PRICE) as PlotKind[]).map((kind) => (
              <Button key={kind} variant="secondary" className="rounded-xl" disabled={busy} onClick={() => void run({ action: "buy", kind, title })}>
                {PLOT_LABEL[kind]} · {PLOT_PRICE[kind]} нот
              </Button>
            ))}
            <Input placeholder="Имя сообщества, если берёшь его" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
        ) : (
          <p className="mt-3 text-sm text-muted">
            Твоё место: {PLOT_LABEL[mine.kind]} {mine.name}. {mine.code ? `Код для своих: ${mine.code}` : ""}
          </p>
        )}
        {homeName ? <p className="mt-3 text-sm text-muted">Ты в сообществе {homeName}. Дома там ставит хозяин, войти можно по метке.</p> : null}
        {mine ? (
          <div className="mt-4">
            <p className="text-sm text-fg">
              Поставить на своём дворе: {PLOT_LABEL[mine.kind]} {mine.name}. Пока дом не куплен, на участке его нет. Пользование генератором по-прежнему за ноты.
            </p>
            <div className="mt-2 flex flex-col gap-2">
              {TOOLS.map((tool) => (
                <Button
                  key={tool.id}
                  variant="secondary"
                  className="rounded-xl"
                  disabled={busy || mine.tools.includes(tool.id)}
                  onClick={() => void run({ action: "tool", tool: tool.id })}
                >
                  {mine.tools.includes(tool.id) ? "Стоит" : "Купить"} {tool.title} · {tool.price}
                </Button>
              ))}
              <Button className="rounded-xl" disabled={busy || TOOLS.every((tool) => mine.tools.includes(tool.id))} onClick={() => void run({ action: "bundle" })}>
                Все сразу · {TOOLS_ALL} вместо {TOOLS.reduce((sum, tool) => sum + tool.price, 0)}
              </Button>
            </div>
          </div>
        ) : null}
        <div className="mt-4 flex gap-2">
          <Input placeholder="Код сообщества" value={code} onChange={(e) => setCode(e.target.value)} />
          <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "join", code })}>
            Войти
          </Button>
        </div>
        {mine?.kind === "commune" ? (
          <div className="mt-4 flex flex-col gap-2">
            <p className="text-sm text-muted">Война: 5 треков с каждой стороны, сутки на голоса. Свой трек стоит {WAR_STAKE} нот. Число людей у соседа скрыто.</p>
            {plots
              .filter((plot) => plot.kind === "commune" && plot.id !== mine.id)
              .map((plot) => (
                <Button key={plot.id} variant="secondary" className="rounded-xl" disabled={busy} onClick={() => void run({ action: "war", plot: plot.id })}>
                  Война с {plot.name}
                </Button>
              ))}
          </div>
        ) : null}
        {wars.map((war) => (
          <div key={war.id} className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">
            <p>
              {war.a} против {war.b}. {war.open ? "Идут сутки." : war.choice === "state" ? "Стали государством." : "Бой закрыт."}
            </p>
            {war.tracks.map((track) => (
              <div key={track.url} className="mt-1 flex items-center justify-between gap-2">
                <span className="truncate text-muted">{track.side === "a" ? war.a : war.b}</span>
                <Button variant="ghost" disabled={busy || !war.open} onClick={() => void run({ action: "vote", url: track.url })}>
                  Голос
                </Button>
              </div>
            ))}
            {war.open ? (
              <div className="mt-2 flex gap-2">
                <Input placeholder="https:// трек на войну" value={url} onChange={(e) => setUrl(e.target.value)} />
                <Button disabled={busy} onClick={() => void run({ action: "track", url })}>
                  {WAR_STAKE}
                </Button>
              </div>
            ) : null}
            {!war.open && !war.choice && mine && (mine.id === war.aId || mine.id === war.bId) ? (
              <div className="mt-2 flex gap-2">
                <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "settle", how: "paid" })}>
                  Отдать ноты
                </Button>
                <Button variant="secondary" disabled={busy} onClick={() => void run({ action: "settle", how: "state" })}>
                  В союз
                </Button>
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
