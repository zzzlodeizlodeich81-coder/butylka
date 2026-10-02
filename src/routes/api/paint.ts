import { createFileRoute } from "@tanstack/react-router";

const MODELS = new Set(["flux", "sana"]);

export const Route = createFileRoute("/api/paint")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const q = new URL(request.url).searchParams;
        const prompt = (q.get("prompt") || "").trim().slice(0, 400);
        if (prompt.length < 2) return new Response("пустой запрос", { status: 400 });
        const model = MODELS.has(q.get("model") || "") ? q.get("model") : "flux";
        const w = Math.min(1024, Math.max(256, Math.round(Number(q.get("w")) || 768)));
        const h = Math.min(1024, Math.max(256, Math.round(Number(q.get("h")) || 768)));
        const url = `https://image.pollinations.ai/prompt/${encodeURIComponent(prompt)}?width=${w}&height=${h}&nologo=true&model=${model}`;
        const up = await fetch(url, {
          headers: { "User-Agent": "XXVKadr/1.0", Accept: "image/jpeg,image/png" },
        });
        if (!up.ok || !(up.headers.get("content-type") || "").startsWith("image/")) {
          return new Response("бесплатная модель сейчас молчит", { status: 502 });
        }
        return new Response(up.body, {
          headers: {
            "Content-Type": up.headers.get("content-type") || "image/jpeg",
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
