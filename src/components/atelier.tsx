import { useState } from "react";
import { Button } from "@/components/ui/button";
import { videoNotes } from "@/lib/notes";
import { useWallet } from "@/lib/wallet";

const SIZES = [
  { id: "1:1", label: "Квадрат", w: 768, h: 768 },
  { id: "16:9", label: "Широкая", w: 1024, h: 576 },
  { id: "9:16", label: "Вертикаль", w: 576, h: 1024 },
];

const LENGTHS = [5, 10, 15] as const;

export function Atelier({ onClose }: { onClose: () => void }) {
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"photo" | "video">("photo");
  const [model, setModel] = useState("flux");
  const [size, setSize] = useState(SIZES[0]);
  const [length, setLength] = useState<(typeof LENGTHS)[number]>(5);
  const [shot, setShot] = useState("");
  const [shotKind, setShotKind] = useState<"photo" | "video">("photo");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [pending, setPending] = useState("");
  const [error, setError] = useState("");

  function takeNotes(header: string | null, bodyNotes?: number) {
    const raw = header ?? (typeof bodyNotes === "number" ? String(bodyNotes) : "");
    if (raw) useWallet.getState().apply({ notes: Number(raw) });
  }

  function remember(blob: Blob, kind: "photo" | "video") {
    if (shot) URL.revokeObjectURL(shot);
    setShotKind(kind);
    setShot(URL.createObjectURL(blob));
  }

  function paint() {
    const text = prompt.trim();
    if (text.length < 2) {
      setError("Напиши, что нарисовать.");
      return;
    }
    setError("");
    setBusy(true);
    setStatus("");
    void (async () => {
      try {
        if (mode === "video") {
          const res = await fetch("/api/clip", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ prompt: text, aspect: size.id, duration: length }),
          });
          const data = (await res.json().catch(() => null)) as { id?: string; error?: string; notes?: number } | null;
          takeNotes(null, data?.notes);
          if (!res.ok || !data?.id) {
            setError(data?.error || "Ролик не начался.");
            return;
          }
          for (let i = 0; i < 60; i++) {
            setStatus("Ролик варится…");
            await new Promise((r) => window.setTimeout(r, 5000));
            const st = await fetch(`/api/clip?id=${data.id}`);
            if (st.status === 202) continue;
            const type = st.headers.get("content-type") || "";
            if (!st.ok || type.includes("json")) {
              const again = (await st.json().catch(() => null)) as { error?: string; notes?: number } | null;
              takeNotes(null, again?.notes);
              setError(again?.error || "Ролик не вышел.");
              return;
            }
            remember(await st.blob(), "video");
            return;
          }
          setError("Ролик ещё варится. Нажми «Проверить» через минуту.");
          setPending(data.id);
          return;
        }
        const next = `/api/paint?model=${model}&w=${size.w}&h=${size.h}&aspect=${size.id}&prompt=${encodeURIComponent(text)}&t=${Date.now()}`;
        const res = await fetch(next);
        takeNotes(res.headers.get("X-Notes"));
        if (!res.ok) {
          setError((await res.text()) || "Модель не ответила.");
          return;
        }
        remember(await res.blob(), "photo");
      } catch {
        setError("Модель не ответила. Попробуй ещё раз или другую.");
      } finally {
        setBusy(false);
        setStatus("");
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
          Старый Grok: картинка 20 нот, ролик 60 / 110 / 160. Flux и Sana бесплатные. Если не вышло, ноты вернутся.
        </p>
        <div className="mt-3 flex gap-2">
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${mode === "photo" ? "bg-[#f4e4c4] text-[#2a1a0c]" : "bg-black/30"}`}
            onClick={() => setMode("photo")}
          >
            Картинка
          </button>
          <button
            type="button"
            className={`rounded-full px-3 py-1 text-sm ${mode === "video" ? "bg-[#f4e4c4] text-[#2a1a0c]" : "bg-black/30"}`}
            onClick={() => setMode("video")}
          >
            Ролик
          </button>
        </div>
        {mode === "photo" ? (
          <>
            <label className="mt-3 block text-xs tracking-widest text-[#c4a574]">МОДЕЛЬ</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {[
                ["flux", "Flux", "бесплатно"],
                ["sana", "Sana", "бесплатно"],
                ["art", "Яндекс", "10 нот"],
                ["grok", "Grok", "20 нот"],
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
          </>
        ) : (
          <>
            <label className="mt-3 block text-xs tracking-widest text-[#c4a574]">ДЛИНА</label>
            <div className="mt-1 flex flex-wrap gap-2">
              {LENGTHS.map((item) => (
                <button
                  key={item}
                  type="button"
                  className={`rounded-full px-3 py-1 text-sm ${length === item ? "bg-[#f4e4c4] text-[#2a1a0c]" : "bg-black/30"}`}
                  onClick={() => setLength(item)}
                >
                  {item} сек · {videoNotes(item)} нот
                </button>
              ))}
            </div>
          </>
        )}
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
          {busy ? status || "Рисует…" : mode === "video" ? "Снять ролик" : "Нарисовать"}
        </Button>
        {pending && !busy ? (
          <Button
            variant="secondary"
            className="mt-2 w-full rounded-xl"
            onClick={() => {
              setBusy(true);
              setError("");
              void (async () => {
                try {
                  const st = await fetch(`/api/clip?id=${pending}`);
                  if (st.status === 202) {
                    setError("Ещё варится.");
                    return;
                  }
                  const type = st.headers.get("content-type") || "";
                  if (!st.ok || type.includes("json")) {
                    const again = (await st.json().catch(() => null)) as { error?: string; notes?: number } | null;
                    takeNotes(null, again?.notes);
                    setError(again?.error || "Ролик не вышел.");
                    setPending("");
                    return;
                  }
                  remember(await st.blob(), "video");
                  setPending("");
                } finally {
                  setBusy(false);
                }
              })();
            }}
          >
            Проверить ролик
          </Button>
        ) : null}
        {error ? <p className="mt-2 text-sm text-[#e8a090]">{error}</p> : null}
        {shot && shotKind === "photo" ? (
          <a href={shot} download="kadr.jpg" className="mt-3 block text-center">
            <img src={shot} alt="" className="mx-auto max-h-48 w-auto max-w-full rounded-xl object-contain" />
            <span className="mt-1 block text-sm underline">Скачать</span>
          </a>
        ) : null}
        {shot && shotKind === "video" ? (
          <a href={shot} download="kadr.mp4" className="mt-3 block text-center">
            <video src={shot} controls className="mx-auto max-h-48 w-full rounded-xl" />
            <span className="mt-1 block text-sm underline">Скачать</span>
          </a>
        ) : null}
      </div>
    </div>
  );
}
