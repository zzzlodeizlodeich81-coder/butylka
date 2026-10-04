import { useState } from "react";
import { Button } from "@/components/ui/button";
import { NOTE_PRICE } from "@/lib/notes";
import { useWallet } from "@/lib/wallet";

type Line = { role: "user" | "assistant"; content: string };

export function HostChat({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function ask() {
    const next = text.trim();
    if (next.length < 2 || busy) return;
    setText("");
    setError("");
    setBusy(true);
    const history = lines;
    setLines((cur) => [...cur, { role: "user", content: next }]);
    void (async () => {
      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: next, history }),
        });
        const data = (await res.json().catch(() => null)) as { text?: string; error?: string; notes?: number } | null;
        if (typeof data?.notes === "number") useWallet.getState().apply({ notes: data.notes });
        if (!res.ok || !data?.text) {
          setError(data?.error || "Хозяин молчит.");
          return;
        }
        setLines((cur) => [...cur, { role: "assistant", content: data.text || "" }]);
      } catch {
        setError("Хозяин молчит.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="absolute inset-0 z-30 flex items-end bg-black/45">
      <div className="flex max-h-[78%] w-full flex-col rounded-t-3xl bg-[#1a120c] px-3 pt-3 pb-[max(0.8rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Хозяин</h2>
          <Button variant="ghost" className="text-[#f4e4c4]" onClick={onClose}>
            Закрыть
          </Button>
        </div>
        <p className="mt-1 text-sm text-[#c4a574]">
          Стихи, песни, промпты и карточка BandLink. Ответ {NOTE_PRICE.host} нот. Если молчит, ноты вернутся.
        </p>
        <div className="mt-3 min-h-24 flex-1 space-y-2 overflow-auto">
          {lines.length === 0 ? (
            <p className="text-sm text-[#c4a574]">
              Для карточки BandLink напиши стиль и текст песни. Если текст жалко отдавать, своими словами скажи, о чём она. Хозяин текст целиком в описание не вставит.
            </p>
          ) : null}
          {lines.map((line, index) => (
            <p
              key={index}
              className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${line.role === "user" ? "bg-black/40" : "bg-[#2a1a0c]"}`}
            >
              {line.content}
            </p>
          ))}
        </div>
        {error ? <p className="mt-2 text-sm text-[#e8a090]">{error}</p> : null}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Стиль и текст, или своими словами о чём песня"
          className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
        />
        <Button className="mt-2 w-full rounded-xl" disabled={busy} onClick={ask}>
          {busy ? "Думает…" : `Спросить · ${NOTE_PRICE.host} нот`}
        </Button>
      </div>
    </div>
  );
}
