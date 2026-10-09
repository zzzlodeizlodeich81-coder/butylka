import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { artistCardLine } from "@/components/release-path";

function shrinkFace(file: File) {
  return new Promise<string>((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = 96;
      canvas.height = 96;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(url);
        reject(new Error("canvas"));
        return;
      }
      const side = Math.min(img.width, img.height);
      ctx.drawImage(img, (img.width - side) / 2, (img.height - side) / 2, side, side, 0, 0, 96, 96);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/jpeg", 0.7));
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("img"));
    };
    img.src = url;
  });
}

export function ProfileCard({ onClose, onPath }: { onClose: () => void; onPath?: () => void }) {
  const [name, setName] = useState("");
  const [login, setLogin] = useState("");
  const [current, setCurrent] = useState("");
  const [password, setPassword] = useState("");
  const [oldLogin, setOldLogin] = useState("");
  const [oldPass, setOldPass] = useState("");
  const [busy, setBusy] = useState(false);
  const [linked, setLinked] = useState(false);
  const [reports, setReports] = useState<
    { period: string; closed: boolean; from: string; count: number; paid: number; costRub: number; share: number; shareRub: number; house?: number; houseRub?: number }[]
  >([]);
  const [reportAdmin, setReportAdmin] = useState(false);

  useEffect(() => {
    void fetch("/api/door", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "status" }),
    })
      .then((res) => res.json())
      .then((data) => {
        setName(data?.guest?.name || "");
        setLogin(data?.guest?.login || "");
        setLinked(Boolean(data?.guest?.linked));
      })
      .catch(() => undefined);
    void fetch("/api/door", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "reports" }),
    })
      .then((res) => res.json())
      .then((data) => {
        if (!data?.ok) return;
        setReportAdmin(Boolean(data.admin));
        setReports(Array.isArray(data.rows) ? data.rows : []);
      })
      .catch(() => undefined);
  }, []);

  async function save() {
    setBusy(true);
    try {
      const res = await fetch("/api/door", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "profile", name, login, password, current }),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok || !data?.ok) {
        toast.error(data?.error || "Не сохранилось.");
        return;
      }
      setPassword("");
      setCurrent("");
      toast.success("Кабинет обновлён. Если менял логин, входи уже новым.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-3 sm:items-center">
      <div className="w-full max-w-sm rounded-3xl bg-[#1a120c] p-4 text-[#f4e4c4]">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-2xl">Кабинет</h2>
          <button type="button" className="rounded-full bg-white/10 px-3 py-1 text-sm" onClick={onClose}>
            Закрыть
          </button>
        </div>
        <p className="mt-1 text-xs text-[#c4a574]">Ник, логин, пароль и лицо. Анкету не собираем.</p>
        <button type="button" className="mt-3 w-full rounded-xl bg-[#f4e4c4] px-3 py-2 text-left text-sm text-[#1a120c]" onClick={() => onPath?.()}>
          <span className="block font-medium">Путь релиза</span>
          <span className="block text-xs">{artistCardLine() || "Карточка артиста ещё пустая. Анджел проведёт от текста до посева."}</span>
        </button>
        <label className="mt-3 block text-xs">
          Ник
          <input className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none" value={name} onChange={(e) => setName(e.target.value)} />
        </label>
        <label className="mt-2 block text-xs">
          Логин
          <input className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none" value={login} onChange={(e) => setLogin(e.target.value)} />
        </label>
        <label className="mt-2 block text-xs">
          Новый пароль, если меняешь
          <input
            type="password"
            className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        <label className="mt-2 block text-xs">
          Старый пароль, если меняешь логин или пароль
          <input
            type="password"
            className="mt-1 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
          />
        </label>
        <label className="mt-3 block cursor-pointer rounded-xl bg-white/10 px-3 py-2 text-sm">
          Сменить аватар
          <input
            className="hidden"
            type="file"
            accept="image/*"
            onChange={(event) => {
              const file = event.target.files?.[0];
              event.target.value = "";
              if (!file) return;
              void shrinkFace(file)
                .then(async (photo) => {
                  const res = await fetch("/api/door", {
                    method: "POST",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ action: "face", photo }),
                  });
                  const data = await res.json().catch(() => null);
                  if (!res.ok || !data?.ok) toast.error(data?.error || "Лицо не встало.");
                  else toast.success("Аватар встал.");
                })
                .catch(() => toast.error("Это фото не читается."));
            }}
          />
        </label>
        <Button className="mt-3 w-full rounded-xl" disabled={busy} onClick={() => void save()}>
          {busy ? "Сохраняю…" : "Сохранить"}
        </Button>
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="font-display text-xl">VK ID</p>
          {linked ? (
            <p className="mt-1 text-xs text-[#c4a574]">Страница ВК привязана. Ноты и двор на этой учётке.</p>
          ) : (
            <>
              <p className="mt-1 text-xs text-[#c4a574]">
                Заходил логином и паролем — привяжи VK ID здесь. Ноты и двор никуда не переедут. Новые жители регистрируются через VK ID ещё на входе.
              </p>
              <a className="mt-2 block rounded-xl bg-[#4c75a3] px-3 py-2 text-center text-sm" href="/api/vk-id">
                Привязать VK ID
              </a>
            </>
          )}
        </div>
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="font-display text-xl">Старый двор</p>
          <p className="mt-1 text-xs text-[#c4a574]">
            Если раньше входил логином, впиши его один раз. Ноты и двор останутся там, новая пустая учётка не нужна.
          </p>
          <input
            className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
            placeholder="Старый логин"
            value={oldLogin}
            onChange={(e) => setOldLogin(e.target.value)}
          />
          <input
            type="password"
            className="mt-2 w-full rounded-xl bg-black/30 px-3 py-2 text-sm outline-none"
            placeholder="Старый пароль"
            value={oldPass}
            onChange={(e) => setOldPass(e.target.value)}
          />
          <Button
            className="mt-2 w-full rounded-xl"
            variant="secondary"
            disabled={busy}
            onClick={() => {
              setBusy(true);
              void fetch("/api/door", {
                method: "POST",
                headers: { "content-type": "application/json" },
                credentials: "same-origin",
                body: JSON.stringify({ action: "bind", login: oldLogin, password: oldPass }),
              })
                .then((res) => res.json().then((data) => ({ res, data })))
                .then(({ res, data }) => {
                  if (!res.ok || !data?.ok) {
                    toast.error(data?.error || "Не привязалось.");
                    return;
                  }
                  setOldPass("");
                  setName(data.guest?.name || name);
                  setLogin(data.guest?.login || oldLogin);
                  toast.success("Это тот же двор. Ноты на месте.");
                })
                .catch(() => toast.error("Не привязалось."))
                .finally(() => setBusy(false));
            }}
          >
            Привязать
          </Button>
        </div>
        <div className="mt-4 border-t border-white/10 pt-3">
          <p className="font-display text-xl">Отчёты</p>
          <p className="mt-1 text-xs text-[#c4a574]">
            {reportAdmin
              ? "Раз в две недели закрывается отчёт: от кого и сколько ему начислено. Себестоимость остаётся на тебе."
              : "Твоя доля с инструментов двора. Раз в две недели тот же отчёт видит хозяин."}
          </p>
          {reports.length === 0 ? <p className="mt-2 text-sm text-[#c4a574]">Пока пусто.</p> : null}
          {reports.map((row) => (
            <div key={`${row.period}-${row.from}`} className="mt-2 rounded-xl bg-black/30 px-3 py-2 text-sm">
              <p className="font-medium">
                {row.closed ? "Закрыт" : "Текущие две недели"} · {row.period}
              </p>
              <p>От кого: {row.from}</p>
              <p>
                Услуг {row.count}. Заплатили {row.paid} нот. Себестоимость {row.costRub} ₽.
              </p>
              <p>
                {reportAdmin ? "Ему" : "Тебе"} {row.share} нот ({row.shareRub} ₽)
                {row.house ? `. Тебе ${row.house} нот (${row.houseRub} ₽)` : ""}
              </p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
