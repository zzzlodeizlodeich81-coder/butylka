import { useEffect, useRef } from "react";
import { playerById, useGame, type Player } from "@/lib/store";
import { playSpinWhoosh, playStopClink, playUiTick } from "@/lib/audio";
import { Button } from "@/components/ui/button";

function slotAngle(index: number, count: number) {
  return -Math.PI / 2 + (index / count) * Math.PI * 2;
}

function easeOutQuint(t: number) {
  return 1 - Math.pow(1 - t, 5);
}

function woodFill(ctx: CanvasRenderingContext2D, x: number, y: number, r: number) {
  const g = ctx.createRadialGradient(x - r * 0.2, y - r * 0.25, r * 0.1, x, y, r);
  g.addColorStop(0, "#3a2c20");
  g.addColorStop(0.45, "#2a1e16");
  g.addColorStop(1, "#16100c");
  ctx.fillStyle = g;
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.fill();

  ctx.save();
  ctx.beginPath();
  ctx.arc(x, y, r, 0, Math.PI * 2);
  ctx.clip();
  ctx.strokeStyle = "rgba(90,70,48,0.18)";
  ctx.lineWidth = 2;
  for (let i = 0; i < 14; i++) {
    ctx.beginPath();
    ctx.ellipse(x, y + (i - 7) * (r / 9), r * 1.05, r * 0.22, 0, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.restore();
}

function drawBottle(
  ctx: CanvasRenderingContext2D,
  angle: number,
  scale: number,
  spinning: boolean,
  omen: boolean,
) {
  ctx.save();
  ctx.rotate(angle);

  ctx.fillStyle = "rgba(0,0,0,0.55)";
  ctx.beginPath();
  ctx.ellipse(scale * 0.06, scale * 0.1, scale * 0.34, scale * 1.05, 0, 0, Math.PI * 2);
  ctx.fill();

  const glass = ctx.createLinearGradient(-scale * 0.4, 0, scale * 0.45, 0);
  if (omen) {
    glass.addColorStop(0, "#070707");
    glass.addColorStop(0.35, "#1a1012");
    glass.addColorStop(0.5, "#3a2428");
    glass.addColorStop(0.72, "#12090b");
    glass.addColorStop(1, "#050505");
  } else {
    glass.addColorStop(0, "#1a2c22");
    glass.addColorStop(0.32, "#3d5c48");
    glass.addColorStop(0.5, "#9dccab");
    glass.addColorStop(0.68, "#2f4a38");
    glass.addColorStop(1, "#15241c");
  }
  ctx.fillStyle = glass;

  ctx.beginPath();
  ctx.roundRect(-scale * 0.36, -scale * 0.12, scale * 0.72, scale * 1.12, scale * 0.34);
  ctx.fill();

  ctx.beginPath();
  ctx.roundRect(-scale * 0.13, -scale * 1.02, scale * 0.26, scale * 0.98, scale * 0.12);
  ctx.fill();

  ctx.fillStyle = omen ? "#1a1214" : "#d8cfc3";
  ctx.beginPath();
  ctx.roundRect(-scale * 0.14, -scale * 1.16, scale * 0.28, scale * 0.18, scale * 0.06);
  ctx.fill();
  ctx.fillStyle = omen ? "#5a2a2e" : "#8a8378";
  ctx.fillRect(-scale * 0.14, -scale * 1.04, scale * 0.28, scale * 0.04);

  ctx.fillStyle = omen ? "#2a1618" : "#e8dfd4";
  ctx.beginPath();
  ctx.roundRect(-scale * 0.26, scale * 0.12, scale * 0.52, scale * 0.4, scale * 0.06);
  ctx.fill();
  ctx.fillStyle = omen ? "#c4b5a0" : "#141210";
  ctx.font = `600 ${Math.max(10, scale * 0.17)}px Unbounded, sans-serif`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.fillText(omen ? "ОН" : "НЕЙРО", 0, scale * 0.28);
  ctx.font = `500 ${Math.max(7, scale * 0.1)}px Manrope, sans-serif`;
  ctx.fillStyle = omen ? "#8a6a68" : "#6f6860";
  ctx.fillText(omen ? "ПОЁТ" : "KARAOKE", 0, scale * 0.42);

  ctx.restore();

  ctx.save();
  ctx.globalCompositeOperation = "lighter";
  ctx.fillStyle = omen
    ? spinning
      ? "rgba(181,82,74,0.22)"
      : "rgba(181,82,74,0.1)"
    : spinning
      ? "rgba(232,223,212,0.18)"
      : "rgba(232,223,212,0.11)";
  ctx.beginPath();
  ctx.ellipse(-scale * 0.14, 0, scale * 0.08, scale * 0.62, -0.18, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

function normalize(a: number) {
  let x = a % (Math.PI * 2);
  if (x < 0) x += Math.PI * 2;
  return x;
}

function isPointing(bottleAngle: number, seatAngle: number) {
  let d = Math.abs(normalize(bottleAngle - seatAngle));
  if (d > Math.PI) d = Math.PI * 2 - d;
  return d < 0.28;
}

function drawScene(
  ctx: CanvasRenderingContext2D,
  w: number,
  h: number,
  players: Player[],
  angle: number,
  spinning: boolean,
  singerId: string | null,
  avatars: Map<string, HTMLImageElement>,
  omen: boolean,
) {
  const cx = w / 2;
  const cy = h / 2;
  const tableR = Math.min(w, h) / 2 - 44;
  ctx.clearRect(0, 0, w, h);

  woodFill(ctx, cx, cy, tableR);
  ctx.strokeStyle = "rgba(232,223,212,0.16)";
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.arc(cx, cy, tableR, 0, Math.PI * 2);
  ctx.stroke();

  ctx.beginPath();
  ctx.arc(cx, cy, tableR * 0.58, 0, Math.PI * 2);
  ctx.fillStyle = "rgba(12,10,9,0.32)";
  ctx.fill();
  ctx.strokeStyle = "rgba(232,223,212,0.1)";
  ctx.stroke();

  const seatR = tableR - 2;
  const labelR = tableR + 22;
  const fontSize = Math.max(11, Math.round(tableR * 0.075));

  players.forEach((p, i) => {
    const a = slotAngle(i, players.length);
    const x = cx + Math.cos(a) * seatR;
    const y = cy + Math.sin(a) * seatR;
    const pointed = spinning && isPointing(angle, a);
    const winner = !spinning && p.id === singerId;
    const r = winner || pointed ? 20 : 16;

    ctx.beginPath();
    ctx.arc(x, y, r + 3, 0, Math.PI * 2);
    ctx.fillStyle = winner || pointed ? "rgba(181,82,74,0.4)" : "rgba(0,0,0,0.28)";
    ctx.fill();

    const img = p.avatarUrl ? avatars.get(p.avatarUrl) : undefined;
    if (img) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.clip();
      ctx.drawImage(img, x - r, y - r, r * 2, r * 2);
      ctx.restore();
    } else {
      ctx.fillStyle = "#1e1b18";
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = "#e8dfd4";
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.ellipse(x, y - r * 0.12, r * 0.28, r * 0.38, 0, 0, Math.PI * 2);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(x, y + r * 0.22);
      ctx.lineTo(x, y + r * 0.42);
      ctx.stroke();
    }

    const lx = cx + Math.cos(a) * labelR;
    const ly = cy + Math.sin(a) * labelR;
    ctx.font = `500 ${fontSize}px Manrope, sans-serif`;
    ctx.textAlign = "center";
    ctx.textBaseline = "middle";
    ctx.fillStyle = winner ? "#f1ebe3" : "#c4b5a0";
    ctx.fillText(p.name, lx, ly);
  });

  ctx.save();
  ctx.translate(cx, cy);
  drawBottle(ctx, angle, tableR * 0.38, spinning, omen);
  ctx.restore();
}

export function BottleTable() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const angleRef = useRef(-Math.PI / 2);
  const animRef = useRef(0);
  const avatarsRef = useRef(new Map<string, HTMLImageElement>());
  const players = useGame((s) => s.players);
  const spinning = useGame((s) => s.spinning);
  const singerId = useGame((s) => s.singerId);
  const startSpin = useGame((s) => s.startSpin);
  const finishSpin = useGame((s) => s.finishSpin);
  const omen = useGame((s) => s.omen);
  const cookStatus = useGame((s) => s.cookStatus);
  const toVerse = useGame((s) => s.toVerse);
  const round = useGame((s) => s.round);
  const singer = playerById(players, singerId);
  const spinRef = useRef<() => void>(() => {});

  useEffect(() => {
    let live = true;
    players.forEach((p) => {
      if (!p.avatarUrl || avatarsRef.current.has(p.avatarUrl)) return;
      const img = new Image();
      img.onload = () => {
        if (!live) return;
        avatarsRef.current.set(p.avatarUrl!, img);
        const canvas = canvasRef.current;
        const wrap = wrapRef.current;
        const ctx = canvas?.getContext("2d");
        if (!canvas || !wrap || !ctx) return;
        const size = canvas.clientWidth;
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        drawScene(
          ctx,
          size,
          size,
          useGame.getState().players,
          angleRef.current,
          useGame.getState().spinning,
          useGame.getState().singerId,
          avatarsRef.current,
          useGame.getState().omen,
        );
      };
      img.src = p.avatarUrl;
    });
    return () => {
      live = false;
    };
  }, [players]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const wrap = wrapRef.current;
    if (!canvas || !wrap) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const paint = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const size = Math.min(wrap.clientWidth, wrap.clientHeight || wrap.clientWidth);
      if (size < 8) return;
      canvas.width = Math.floor(size * dpr);
      canvas.height = Math.floor(size * dpr);
      canvas.style.width = `${size}px`;
      canvas.style.height = `${size}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawScene(ctx, size, size, players, angleRef.current, spinning, singerId, avatarsRef.current, omen);
    };

    paint();
    const ro = new ResizeObserver(paint);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [players, spinning, singerId, omen]);

  function spin() {
    if (useGame.getState().spinning) return;
    playUiTick();
    playSpinWhoosh();
    const { singerId: next } = startSpin();
    const list = useGame.getState().players;
    const idx = list.findIndex((p) => p.id === next);
    const target = slotAngle(idx < 0 ? 0 : idx, list.length);
    const reduced =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    const turns = reduced ? 1 : 5 + Math.floor(Math.random() * 3);
    const start = angleRef.current;
    const delta = normalize(target - normalize(start)) + turns * Math.PI * 2;
    const duration = reduced ? 700 : 2800 + Math.random() * 900;
    const t0 = performance.now();
    cancelAnimationFrame(animRef.current);

    const step = (now: number) => {
      const p = Math.min(1, (now - t0) / duration);
      angleRef.current = start + delta * easeOutQuint(p);
      const canvas = canvasRef.current;
      if (canvas) {
        const ctx = canvas.getContext("2d");
        if (ctx) {
          const dpr = Math.min(window.devicePixelRatio || 1, 2);
          const size = canvas.clientWidth;
          ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
          drawScene(ctx, size, size, list, angleRef.current, p < 1, next, avatarsRef.current, omen);
        }
      }
      if (p < 1) {
        animRef.current = requestAnimationFrame(step);
      } else {
        playStopClink();
        if (typeof navigator !== "undefined" && navigator.vibrate) navigator.vibrate(18);
        finishSpin();
      }
    };
    animRef.current = requestAnimationFrame(step);
  }

  spinRef.current = spin;

  useEffect(() => {
    if (!omen || spinning) return;
    const t = window.setTimeout(() => spinRef.current(), 1700);
    return () => clearTimeout(t);
  }, [omen, spinning]);

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <p className="px-5 text-center text-sm text-muted">
        {omen
          ? "Бутылка чёрная. Все боятся."
          : cookStatus === "cooking"
            ? "Кухня и Suno варят песню из бреда. Пойте пока."
            : cookStatus === "failed"
              ? "Кухня молчит. Каталог ещё жив."
              : `Раунд ${round}${singer && !spinning ? ` · последним пел ${singer.name}` : ""}`}
      </p>
      <div ref={wrapRef} className="relative mx-auto mt-1 aspect-square w-full max-w-md flex-1">
        <canvas ref={canvasRef} className="mx-auto block size-full" />
      </div>
      <div className="px-5 pb-[max(1.25rem,env(safe-area-inset-bottom))] pt-3">
        {omen ? (
          <p className="h-14 text-center text-sm leading-[3.5rem] text-wine">Сама крутится</p>
        ) : (
          <div className="flex flex-col gap-2">
            <Button
              size="lg"
              className="h-14 w-full rounded-xl text-base tracking-wide"
              onClick={spin}
              disabled={spinning}
            >
              {spinning ? "Крутится…" : "Крутить бутылку"}
            </Button>
            {cookStatus === "idle" || cookStatus === "failed" ? (
              <Button variant="ghost" onClick={toVerse}>
                Ещё круг бреда
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
