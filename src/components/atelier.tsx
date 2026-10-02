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
  const [src, setSrc] = useState("");
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
    const next = `/api/paint?model=${model}&w=${size.w}&h=${size.h}&prompt=${encodeURIComponent(text)}&t=${Date.now()}`;
    const img = new Image();
    img.onload = () => {
      setSrc(next);
      setBusy(false);
    };
    img.onerror = () => {
      setBusy(false);
      setError("Модель не ответила. Попробуй ещё раз или другую.");
    };
    img.src = next;
  }

  return (
    <div className="absolute inset-0 z-20 flex flex-col bg-[#2a1a0c] text-[#f4e4c4]">
      <div className="flex items-center justify-between gap-3 px-3 pt-[max(0.5rem,env(safe-area-inset-top))] pb-2">
        <h2 className="font-display text-2xl">Мастерская</h2>
        <Button variant="ghost" className="text-[#f4e4c4]" onClick={onClose}>
          На двор
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-auto px-3 pb-[max(1rem,env(safe-area-inset-bottom))]">
        <p className="text-sm text-[#c4a574]">
          Картинка бесплатная, ноты не списываются. Видео Grok и переход Kling остаются платными, они в киностудии.
        </p>
        <label className="mt-3 block text-xs tracking-widest text-[#c4a574]">МОДЕЛЬ</label>
        <div className="mt-1 flex gap-2">
          {[
            ["flux", "Flux"],
            ["sana", "Sana"],
          ].map(([id, label]) => (
            <button
              key={id}
              type="button"
              className={`rounded-full px-3 py-1 text-sm ${model === id ? "bg-[#f4e4c4] text-[#2a1a0c]" : "bg-black/30"}`}
              onClick={() => setModel(id)}
            >
              {label} · бесплатно
            </button>
          ))}
        </div>
        <label className="mt-3 block text-xs tracking-widest text-[#c4a574]">КАДР</label>
        <div className="mt-1 flex gap-2">
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
        {src ? (
          <a href={src} download="kadr.jpg" className="mt-3 block">
            <img src={src} alt="" className="w-full rounded-xl" />
            <span className="mt-1 block text-center text-sm underline">Скачать</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
