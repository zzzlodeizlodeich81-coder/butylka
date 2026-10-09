import { useEffect, useRef, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/lib/wallet";

type Draft = {
  id: string;
  title: string;
  body: string;
  font: string;
  size: number;
  createdAt: number;
  updatedAt: number;
};
type Pub = Draft & { publishedAt: number; author: string };

const FONTS = [
  ["Manrope", "Обычный"],
  ["Georgia", "Книжный"],
  ["Times New Roman", "Газета"],
  ["Palatino Linotype", "Антиква"],
  ["Courier New", "Машинка"],
  ["Verdana", "Крупный"],
] as const;
const SIZES = [14, 18, 22, 28];
const TAGS = ["[Intro]", "[Verse]", "[Chorus]", "[Bridge]", "[Outro]"];

function when(ms: number) {
  return new Date(ms).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

export function Notebook({ onClose }: { onClose: () => void }) {
  const [tab, setTab] = useState<"draft" | "book">("draft");
  const [drafts, setDrafts] = useState<Draft[]>([]);
  const [catalog, setCatalog] = useState<Pub[]>([]);
  const [id, setId] = useState("");
  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [font, setFont] = useState("Georgia");
  const [size, setSize] = useState(18);
  const [busy, setBusy] = useState("");
  const [createdAt, setCreatedAt] = useState(0);
  const area = useRef<HTMLTextAreaElement>(null);

  async function reload(nextId = id) {
    const res = await fetch("/api/verse");
    const data = (await res.json().catch(() => null)) as { drafts?: Draft[]; catalog?: Pub[] } | null;
    const rows = data?.drafts || [];
    setDrafts(rows);
    setCatalog(data?.catalog || []);
    const hit = rows.find((row) => row.id === nextId) || rows[0];
    if (hit && !nextId) open(hit);
  }

  function open(row: Draft) {
    setId(row.id);
    setTitle(row.title);
    setBody(row.body);
    setFont(row.font || "Georgia");
    setSize(row.size || 18);
    setCreatedAt(row.createdAt);
  }

  useEffect(() => {
    void reload("").catch(() => toast.error("Блокнот не открылся."));
  }, []);

  async function save() {
    setBusy("save");
    try {
      const res = await fetch("/api/verse", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "save", id, title, body, font, size }),
      });
      const data = (await res.json().catch(() => null)) as { draft?: Draft; error?: string } | null;
      if (!res.ok || !data?.draft) {
        toast.error(data?.error || "Не сохранилось.");
        return null;
      }
      setId(data.draft.id);
      setCreatedAt(data.draft.createdAt);
      await reload(data.draft.id);
      return data.draft;
    } finally {
      setBusy("");
    }
  }

  function insert(tag: string) {
    const node = area.current;
    const chunk = `${tag}\n`;
    if (!node) {
      setBody((cur) => `${cur}${cur.endsWith("\n") || !cur ? "" : "\n"}${chunk}`);
      return;
    }
    const at = node.selectionStart ?? body.length;
    const next = `${body.slice(0, at)}${chunk}${body.slice(at)}`;
    setBody(next);
    requestAnimationFrame(() => {
      node.focus();
      node.selectionStart = node.selectionEnd = at + chunk.length;
    });
  }

  async function ask(task: string) {
    const draft = await save();
    if (!draft && body.trim().length < 2) return;
    setBusy("ai");
    try {
      const res = await fetch("/api/host", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          mode: "notebook",
          text: `${task}\n\nНазвание: ${title || "без названия"}\n\n${body}`.slice(0, 4000),
        }),
      });
      const data = (await res.json().catch(() => null)) as { text?: string; error?: string; notes?: number; bill?: string } | null;
      if (typeof data?.notes === "number") useWallet.getState().apply({ notes: data.notes });
      if (!res.ok || !data?.text) {
        toast.error(data?.error || "Помощник молчит.");
        return;
      }
      if (!task.startsWith("Промпт")) setBody(data.text.replace(/^```[\w]*\n?|```$/g, "").trim());
      else toast.success(data.text);
      if (data.bill) toast.message(data.bill);
    } finally {
      setBusy("");
    }
  }

  return (
    <div className="fixed inset-0 z-[60] flex items-end justify-center bg-black/55 p-2 sm:items-center">
      <div className="flex max-h-[94dvh] w-full max-w-3xl flex-col overflow-hidden rounded-3xl bg-[#1a120c] text-[#f4e4c4]">
        <div className="flex items-center justify-between gap-2 px-3 pt-3">
          <h2 className="font-display text-2xl">Блокнот</h2>
          <button type="button" className="rounded-full bg-white/10 px-3 py-1 text-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="px-3 pt-1 text-xs text-[#c4a574]">
          Черновик правится только здесь. В сборник уходит копия: её уже не изменить. Дата и текст остаются на спор.
        </p>
        <div className="mt-2 flex gap-2 px-3">
          <button type="button" className={`rounded-full px-3 py-1 text-sm ${tab === "draft" ? "bg-[#f4e4c4] text-[#1a120c]" : "bg-black/30"}`} onClick={() => setTab("draft")}>
            Черновик
          </button>
          <button type="button" className={`rounded-full px-3 py-1 text-sm ${tab === "book" ? "bg-[#f4e4c4] text-[#1a120c]" : "bg-black/30"}`} onClick={() => setTab("book")}>
            Сборник двора
          </button>
        </div>
        {tab === "book" ? (
          <div className="mt-2 min-h-0 flex-1 space-y-2 overflow-auto px-3 pb-3">
            {catalog.length === 0 ? <p className="text-sm text-[#c4a574]">Пока пусто.</p> : null}
            {catalog.map((row) => (
              <article key={row.id} className="rounded-2xl bg-black/30 p-3">
                <p className="text-xs text-[#c4a574]">
                  {row.author} · {when(row.publishedAt)} · {row.id.slice(0, 8)}
                </p>
                <h3 className="font-display text-xl">{row.title}</h3>
                <pre className="mt-1 whitespace-pre-wrap font-sans text-sm" style={{ fontFamily: row.font, fontSize: row.size }}>
                  {row.body}
                </pre>
              </article>
            ))}
          </div>
        ) : (
          <div className="mt-2 flex min-h-0 flex-1 flex-col gap-2 overflow-auto px-3 pb-3">
            <div className="flex gap-2 overflow-auto">
              <button
                type="button"
                className="shrink-0 rounded-full bg-white/10 px-3 py-1 text-sm"
                onClick={() => {
                  setId("");
                  setTitle("");
                  setBody("");
                  setCreatedAt(0);
                }}
              >
                Новый
              </button>
              {drafts.map((row) => (
                <button key={row.id} type="button" className={`shrink-0 rounded-full px-3 py-1 text-sm ${row.id === id ? "bg-[#f4e4c4] text-[#1a120c]" : "bg-black/30"}`} onClick={() => open(row)}>
                  {row.title || "без названия"}
                </button>
              ))}
            </div>
            <input className="rounded-xl bg-black/30 px-3 py-2 text-sm outline-none" placeholder="Название" value={title} maxLength={80} onChange={(e) => setTitle(e.target.value)} />
            <div className="flex flex-wrap gap-2">
              {FONTS.map(([value, label]) => (
                <button key={value} type="button" className={`rounded-full px-2 py-1 text-xs ${font === value ? "bg-[#f4e4c4] text-[#1a120c]" : "bg-black/30"}`} onClick={() => setFont(value)}>
                  {label}
                </button>
              ))}
              {SIZES.map((item) => (
                <button key={item} type="button" className={`rounded-full px-2 py-1 text-xs ${size === item ? "bg-[#f4e4c4] text-[#1a120c]" : "bg-black/30"}`} onClick={() => setSize(item)}>
                  {item}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap gap-1">
              {TAGS.map((tag) => (
                <button key={tag} type="button" className="rounded-full bg-black/30 px-2 py-1 text-xs" onClick={() => insert(tag)}>
                  {tag}
                </button>
              ))}
            </div>
            <textarea
              ref={area}
              value={body}
              onChange={(e) => setBody(e.target.value)}
              spellCheck
              lang="ru"
              rows={10}
              maxLength={12000}
              placeholder="Текст. Красное подчёркивание — орфография браузера."
              className="min-h-40 w-full flex-1 rounded-xl bg-[#f6efe2] px-3 py-2 text-[#1a120c] outline-none"
              style={{ fontFamily: font, fontSize: size }}
            />
            <p className="text-xs text-[#c4a574]">
              {body.trim() ? body.trim().split(/\s+/).length : 0} слов
              {createdAt ? ` · создан ${when(createdAt)}` : ""}
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button className="rounded-xl" disabled={Boolean(busy)} onClick={() => void save().then((row) => row && toast.success("Черновик на месте."))}>
                {busy === "save" ? "…" : "Сохранить"}
              </Button>
              <Button
                variant="secondary"
                className="rounded-xl"
                disabled={Boolean(busy)}
                onClick={() =>
                  void (async () => {
                    const row = await save();
                    if (!row) return;
                    setBusy("pub");
                    try {
                      const res = await fetch("/api/verse", {
                        method: "POST",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ action: "publish", id: row.id }),
                      });
                      const data = (await res.json().catch(() => null)) as { error?: string } | null;
                      if (!res.ok) {
                        toast.error(data?.error || "Не вышло.");
                        return;
                      }
                      toast.success("В сборнике заморожено. Черновик остался.");
                      await reload(row.id);
                    } finally {
                      setBusy("");
                    }
                  })()
                }
              >
                В сборник
              </Button>
            </div>
            <p className="text-xs text-[#c4a574]">Помощник за ноты: себестоимость токенов плюс 50%. Списывается после ответа.</p>
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
              <Button variant="secondary" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void ask("Поправь орфографию и пунктуацию. Смысл и разбиение строк не меняй. Верни только текст.")}>
                Орфография
              </Button>
              <Button variant="secondary" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void ask("Разметь текст для Suno тегами [Intro] [Verse] [Chorus] [Bridge] [Outro]. Слова не переписывай. Верни только текст.")}>
                Для Suno
              </Button>
              <Button variant="secondary" className="rounded-xl" disabled={Boolean(busy)} onClick={() => void ask("Промпт для Suno на английском: жанр, темп, настроение, инструменты, вокал. Под ним короткий русский перевод. Текст песни в промпт не копируй.")}>
                Промпт
              </Button>
            </div>
            {id ? (
              <button
                type="button"
                className="text-xs underline"
                onClick={() =>
                  void fetch("/api/verse", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "drop", id }),
                  }).then(async (res) => {
                    if (!res.ok) {
                      toast.error("Не удалился.");
                      return;
                    }
                    setId("");
                    setTitle("");
                    setBody("");
                    await reload("");
                  })
                }
              >
                Удалить черновик. Сборник это не трогает.
              </button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
