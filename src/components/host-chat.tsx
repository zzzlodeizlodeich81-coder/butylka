import { useState } from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";

type Line = { role: "user" | "assistant"; content: string; image?: string; bill?: string };

function shrinkShot(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const edge = 960;
      const scale = Math.min(1, edge / Math.max(img.width, img.height));
      const canvas = document.createElement("canvas");
      canvas.width = Math.max(1, Math.round(img.width * scale));
      canvas.height = Math.max(1, Math.round(img.height * scale));
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      URL.revokeObjectURL(url);
      let quality = 0.72;
      let data = canvas.toDataURL("image/jpeg", quality);
      while (data.length > 500000 && quality > 0.4) {
        quality -= 0.08;
        data = canvas.toDataURL("image/jpeg", quality);
      }
      if (data.length > 700000) {
        reject(new Error("big"));
        return;
      }
      resolve(data);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img"));
    };
    img.src = url;
  });
}

export function HostChat({ onClose }: { onClose: () => void }) {
  const [lines, setLines] = useState<Line[]>([]);
  const [text, setText] = useState("");
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function ask() {
    const next = text.trim();
    if ((next.length < 2 && !shot) || busy) return;
    const image = shot;
    setText("");
    setShot("");
    setError("");
    setBusy(true);
    const history = lines.map(({ role, content }) => ({ role, content }));
    const caption = next || "Посмотри скрин. Что на нём пустое?";
    setLines((cur) => [...cur, { role: "user", content: caption, image }]);
    void (async () => {
      try {
        const res = await fetch("/api/host", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: next, image, history }),
        });
        const data = (await res.json().catch(() => null)) as { text?: string; error?: string; notes?: number; bill?: string } | null;
        if (typeof data?.notes === "number") useWallet.getState().apply({ notes: data.notes });
        if (!res.ok || !data?.text) {
          setError(data?.error || "Хозяин молчит.");
          return;
        }
        setLines((cur) => [...cur, { role: "assistant", content: data.text || "", bill: data.bill }]);
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
          Стихи, песни, промпты, карточка BandLink и скрин. Ответ по токенам: себестоимость плюс 50%. Если молчит, ноты не списываются.
        </p>
        <div className="mt-3 min-h-24 flex-1 space-y-2 overflow-auto">
          {lines.length === 0 ? (
            <p className="text-sm text-[#c4a574]">
              Для карточки напиши стиль и текст, или своими словами о чём песня. Скрин BandLink можно приложить: хозяин скажет, какие поля пустые.
            </p>
          ) : null}
          {lines.map((line, index) => (
            <div
              key={index}
              className={`whitespace-pre-wrap rounded-xl px-3 py-2 text-sm ${line.role === "user" ? "bg-black/40" : "bg-[#2a1a0c]"}`}
            >
              {line.image ? <img src={line.image} alt="" className="mb-2 max-h-28 rounded-lg" /> : null}
              {line.content}
              {line.bill ? <p className="mt-1 text-[11px] text-[#c4a574]">{line.bill}</p> : null}
            </div>
          ))}
        </div>
        {error ? <p className="mt-2 text-sm text-[#e8a090]">{error}</p> : null}
        {shot ? <img src={shot} alt="" className="mt-2 max-h-20 rounded-lg" /> : null}
        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          rows={2}
          maxLength={4000}
          placeholder="Стиль и текст, или своими словами о чём песня"
          className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
        />
        <div className="mt-2 flex gap-2">
          <label className="inline-flex shrink-0 cursor-pointer items-center rounded-xl bg-black/30 px-3 text-sm">
            скрин
            <input
              className="hidden"
              type="file"
              accept="image/*"
              onChange={(event) => {
                const file = event.target.files?.[0];
                event.target.value = "";
                if (!file) return;
                void shrinkShot(file).then(setShot).catch(() => setError("Скрин не влез."));
              }}
            />
          </label>
          <Button className="flex-1 rounded-xl" disabled={busy} onClick={ask}>
            {busy ? "Думает…" : "Спросить"}
          </Button>
        </div>
      </div>
    </div>
  );
}