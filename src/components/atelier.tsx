import { useState } from "react";
import { Button } from "@/components/ui/button";

const SIZES = [
  { id: "1:1", label: "Квадрат", w: 768, h: 768 },
  { id: "16:9", label: "Широкая", w: 1024, h: 576 },
  { id: "9:16", label: "Вертикаль", w: 576, h: 1024 },
];

export function Atelier({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [model, setModel] = useState("flux");
  const [size, setSize] = useState(SIZES[0]);
  const [shot, setShot] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  function paint() {
    const text = prompt.trim();
    if (text.length < 2) {
      setError("Напиши, что нарисовать.");
      return;
    }
    setError("");
    setBusy(true);
    const next = `/api/paint?model=${model}&w=${size.w}&h=${size.h}&aspect=${size.id}&prompt=${encodeURIComponent(text)}&t=${Date.now()}`;
    void (async () => {
      try {
        const res = await fetch(next);
        if (!res.ok) {
          setError((await res.text()) || "Модель не ответила.");
          return;
        }
        const blob = await res.blob();
        if (shot) URL.revokeObjectURL(shot);
        setShot(URL.createObjectURL(blob));
      } catch {
        setError("Модель не ответила. Попробуй ещё раз или другую.");
      } finally {
        setBusy(false);
      }
    })();
  }

  return (
    <div className="absolute inset-0 z-20 flex items-end bg-black/40">
      <div className="max-h-[78%] w-full overflow-auto rounded-t-3xl bg-[#2a1a0c] px-3 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] text-[#f4e4c4]">
        <div className="flex items-center justify-between gap-3">
          <h2 className="font-display text-2xl">Мастерская</h2>
          <Button variant="ghost" className="text-[#f4e4c4]" onClick={onClose}>
            На двор
          </Button>
        </div>
        <p className="mt-2 text-sm text-[#c4a574]">
          Flux и Sana бесплатные. Grok рисует с твоего Replicate, ноты не списываются.
        </p>
        <label className="mt-3 block text-xs tracking-widest text-[#c4a574]">МОДЕЛЬ</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {[
            ["flux", "Flux", "бесплатно"],
            ["sana", "Sana", "бесплатно"],
            ["kandinsky", "Кандинский", "бесплатно"],
            ["grok", "Grok", "Replicate"],
          ].map(([id, label, price]) => (
            <button
              key={id}
              type="button"
              className={`rounded-full px-3 py-1 text-sm ${model === id ? "bg-[#f4e4c4] text-[#2a1a0c]" : "bg-black/30"}`}
              onClick={() => setModel(id)}
            >
              {label} · {price}
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs tracking-widest text-[#c4a574]">КАДР</label>
        <div className="mt-1 flex flex-wrap gap-2">
          {SIZES.map((item) => (
            <button
              key={item.id}
              type="button"
              className={`rounded-full px-3 py-1 text-sm ${size.id === item.id ? "bg-[#f4e4c4] text-[#2a1a0c]" : "bg-black/30"}`}
              onClick={() => setSize(item)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <textarea
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
          maxLength={400}
          placeholder="Фонарь во дворе, ночь, масло"
          className="mt-3 w-full rounded-xl bg-black/30 px-3 py-2 text-sm text-[#f4e4c4] outline-none"
        />
        <Button className="mt-3 w-full rounded-xl" disabled={busy} onClick={paint}>
          {busy ? "Рисует…" : "Нарисовать"}
        </Button>
        {error ? <p className="mt-2 text-sm text-[#e8a090]">{error}</p> : null}
        {shot ? (
          <a href={shot} download="kadr.jpg" className="mt-3 block text-center">
            <img src={shot} alt="" className="mx-auto max-h-48 w-auto max-w-full rounded-xl object-contain" />
            <span className="mt-1 block text-sm underline">Скачать</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
