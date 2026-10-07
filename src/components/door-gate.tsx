import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/wallet";

type Guest = { id: string; name: string; notes: number; admin?: boolean };
type Player = { id: string; name: string; notes: number };

async function door(body: Record<string, unknown>) {
  const res = await fetch("/api/door", {
    method: "POST",
    headers: { "content-type": "application/json" },
    credentials: "same-origin",
    body: JSON.stringify(body),
  });
  return (await res.json()) as {
    ok?: boolean;
    error?: string;
    needDoor?: boolean;
    inside?: boolean;
    guest?: Guest | null;
    players?: Player[];
  };
}

function openedInVk() {
  if (typeof window === "undefined") return false;
  return /(?:^|[?&])vk_(?:user_id|app_id)=/.test(window.location.search);
}

export function DoorGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"load" | "lock" | "name" | "in" | "vkfail">("load");
  const [mode, setMode] = useState<"login" | "new">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [kassa, setKassa] = useState(false);
  const admin = useWallet((s) => s.admin);
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  async function sync() {
    const row = await door({ action: "status" });
    if (!row.needDoor) {
      setPhase("in");
      return;
    }
    if (!row.inside) {
      setPhase(openedInVk() ? "vkfail" : "lock");
      return;
    }
    if (!row.guest) {
      setPhase("name");
      return;
    }
    useWallet.getState().apply({
      notes: row.guest.notes,
      name: row.guest.name,
      ready: true,
      admin: Boolean(row.guest.admin),
    });
    setPhase("in");
  }

  useEffect(() => {
    const fromVk = openedInVk();
    void (async () => {
      if (fromVk) {
        const row = await door({ action: "vk", search: window.location.search });
        if (!row.ok) {
          setPhase("vkfail");
          return;
        }
      }
      await sync();
    })().catch(() => setPhase(fromVk ? "vkfail" : "lock"));
    const timer = window.setInterval(() => void sync().catch(() => undefined), 15000);
    const leave = () => {
      void (async () => {
        await door({ action: "out" });
        useWallet.getState().apply({ vkId: null, name: "", notes: 0, admin: false, inVk: false, shopOpen: false });
        setKassa(false);
        setPassword("");
        setPhase("lock");
      })();
    };
    const desk = () => {
      setKassa(true);
      void openKassa();
    };
    window.addEventListener("kadr-leave", leave);
    window.addEventListener("kadr-desk", desk);
    const notes = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) return;
      const count = (event.data as { type?: string; notes?: number } | null)?.notes;
      if ((event.data as { type?: string } | null)?.type === "kadr-notes" && typeof count === "number") {
        useWallet.getState().apply({ notes: count });
      }
    };
    window.addEventListener("message", notes);
    return () => {
      window.clearInterval(timer);
      window.removeEventListener("kadr-leave", leave);
      window.removeEventListener("kadr-desk", desk);
      window.removeEventListener("message", notes);
    };
  }, []);

  async function openKassa() {
    const row = await door({ action: "admin" });
    if (!row.ok) {
      toast.error(row.error || "Админка не открылась.");
      setPlayers(null);
      return;
    }
    setPlayers(row.players || []);
  }

  async function runAdmin(body: Record<string, unknown>, done: string) {
    const row = await door({ action: "admin", ...body });
    if (!row.ok) {
      toast.error(row.error || "Не вышло.");
      return;
    }
    setPlayers(row.players || []);
    toast.success(done);
    await sync();
  }

  return (
    <>
      {phase === "in" ? children : null}
      {phase !== "in" ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-[#0c0708] px-4 text-[#f4e4c4]">
          <form
            className="w-full max-w-sm"
            onSubmit={(event) => {
              event.preventDefault();
              void (async () => {
                const row = await door({
                  action: mode === "new" ? "register" : "login",
                  login,
                  password,
                  name,
                });
                if (!row.ok) {
                  toast.error(row.error || "Не пустило.");
                  return;
                }
                setPassword("");
                await sync();
              })();
            }}
          >
            <p className="font-display text-3xl">XXV Kadr</p>
            {phase === "load" ? <p className="mt-3 text-sm">Открываю калитку…</p> : null}
            {phase === "vkfail" ? (
              <p className="mt-3 text-sm text-[#f4e4c4]/70">
                Вход только из ВКонтакте, по человеку, который уже открыл сервис. Отдельный логин здесь не нужен.
              </p>
            ) : null}
            {phase === "lock" || phase === "name" ? (
              <>
                <p className="mt-3 text-sm text-[#f4e4c4]/70">
                  Вход по своему логину. Касса и выход — в меню «Ещё» наверху. Админка открывается только у хозяина.
                </p>
                <div className="mt-3 flex gap-2">
                  <Button type="button" variant={mode === "login" ? "default" : "secondary"} className="rounded-xl" onClick={() => setMode("login")}>
                    Вход
                  </Button>
                  <Button type="button" variant={mode === "new" ? "default" : "secondary"} className="rounded-xl" onClick={() => setMode("new")}>
                    Новый
                  </Button>
                </div>
                <Input
                  className="mt-3 bg-black/40 text-white"
                  placeholder="Логин"
                  value={login}
                  onChange={(event) => setLogin(event.target.value)}
                  autoComplete="username"
                />
                <Input
                  className="mt-2 bg-black/40 text-white"
                  type="password"
                  placeholder="Пароль"
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  autoComplete={mode === "new" ? "new-password" : "current-password"}
                />
                {mode === "new" ? (
                  <Input
                    className="mt-2 bg-black/40 text-white"
                    placeholder="Как писать на дворе"
                    value={name}
                    onChange={(event) => setName(event.target.value)}
                  />
                ) : null}
                <Button className="mt-3 w-full rounded-xl" type="submit">
                  {mode === "new" ? "Создать" : "Войти"}
                </Button>
              </>
            ) : null}
          </form>
        </div>
      ) : null}
      {kassa && admin ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[80dvh] w-full max-w-md overflow-auto rounded-2xl bg-[#1a120c] p-4 text-[#f4e4c4]">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-2xl">Админка</p>
              <button type="button" className="text-sm" onClick={() => setKassa(false)}>
                Закрыть
              </button>
            </div>
            <p className="mt-2 text-sm text-[#f4e4c4]/70">Ноты начисляешь ты. Чужим эта дверь не открывается.</p>
            <div className="mt-3 flex flex-col gap-2">
              {(players || []).map((player) => (
                <div key={player.id} className="rounded-xl border border-white/10 px-3 py-2 text-sm">
                  <p>
                    {player.name} · {player.notes} нот
                  </p>
                  <div className="mt-2 flex gap-2">
                    <Input
                      className="bg-black/40 text-white"
                      inputMode="numeric"
                      placeholder="сколько добавить"
                      value={amounts[player.id] || ""}
                      onChange={(event) => setAmounts((cur) => ({ ...cur, [player.id]: event.target.value }))}
                    />
                    <Button
                      type="button"
                      variant="secondary"
                      onClick={() => void runAdmin({ id: player.id, amount: Number(amounts[player.id] || 0) }, "Ноты легли.")}
                    >
                      Дать
                    </Button>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <Button type="button" variant="secondary" onClick={() => void runAdmin({ op: "chat", who: player.name }, "Сообщения стёрты.")}>
                      Из чата
                    </Button>
                    <Button type="button" variant="secondary" onClick={() => void runAdmin({ op: "drop", id: player.id }, "Учётка снята.")}>
                      Удалить
                    </Button>
                  </div>
                </div>
              ))}
              {players && players.length === 0 ? <p className="text-sm text-[#f4e4c4]/70">Пока никто не назвался.</p> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
