import { useEffect, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useWallet } from "@/lib/wallet";

type Guest = { id: string; name: string; notes: number };
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

export function DoorGate({ children }: { children: ReactNode }) {
  const [phase, setPhase] = useState<"load" | "lock" | "name" | "in">("load");
  const [mode, setMode] = useState<"login" | "new">("login");
  const [login, setLogin] = useState("");
  const [password, setPassword] = useState("");
  const [name, setName] = useState("");
  const [kassa, setKassa] = useState(false);
  const [adminPassword, setAdminPassword] = useState("");
  const [players, setPlayers] = useState<Player[] | null>(null);
  const [amounts, setAmounts] = useState<Record<string, string>>({});

  async function sync() {
    const row = await door({ action: "status" });
    if (!row.needDoor) {
      setPhase("in");
      return;
    }
    if (!row.inside) {
      setPhase("lock");
      return;
    }
    if (!row.guest) {
      setPhase("name");
      return;
    }
    useWallet.getState().apply({ notes: row.guest.notes, name: row.guest.name, ready: true });
    setPhase("in");
  }

  useEffect(() => {
    void sync().catch(() => setPhase("lock"));
    const timer = window.setInterval(() => void sync().catch(() => undefined), 15000);
    return () => window.clearInterval(timer);
  }, []);

  async function openKassa() {
    const row = await door({ action: "admin", password: adminPassword });
    if (!row.ok) {
      toast.error(row.error || "Касса не открылась.");
      setPlayers(null);
      return;
    }
    setPlayers(row.players || []);
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
            {phase === "lock" || phase === "name" ? (
              <>
                <p className="mt-3 text-sm text-[#f4e4c4]/70">
                  Вход по своему логину или через VK ID. Пароль кассы по-прежнему только у хозяина.
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
                <a className="mt-3 block text-center text-sm underline" href="/api/vk-id">
                  Войти через VK ID
                </a>
              </>
            ) : null}
          </form>
        </div>
      ) : null}
      <button
        type="button"
        className="fixed right-3 bottom-[max(0.8rem,env(safe-area-inset-bottom))] z-[60] rounded-full bg-black/55 px-3 py-1 text-xs text-white"
        onClick={() => setKassa(true)}
      >
        Касса
      </button>
      {kassa ? (
        <div className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-4 sm:items-center">
          <div className="max-h-[80dvh] w-full max-w-md overflow-auto rounded-2xl bg-[#1a120c] p-4 text-[#f4e4c4]">
            <div className="flex items-center justify-between gap-3">
              <p className="font-display text-2xl">Касса</p>
              <button type="button" className="text-sm" onClick={() => setKassa(false)}>
                Закрыть
              </button>
            </div>
            <Input
              className="mt-3 bg-black/40 text-white"
              type="password"
              placeholder="Пароль кассы"
              value={adminPassword}
              onChange={(event) => setAdminPassword(event.target.value)}
            />
            <Button className="mt-2 w-full rounded-xl" type="button" onClick={() => void openKassa()}>
              Открыть список
            </Button>
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
                      onClick={() => {
                        void (async () => {
                          const row = await door({
                            action: "admin",
                            password: adminPassword,
                            id: player.id,
                            amount: Number(amounts[player.id] || 0),
                          });
                          if (!row.ok) {
                            toast.error(row.error || "Не начислилось.");
                            return;
                          }
                          setPlayers(row.players || []);
                          toast.success("Ноты легли.");
                          await sync();
                        })();
                      }}
                    >
                      Дать
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
