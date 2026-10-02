import { createFileRoute } from "@tanstack/react-router";

const MODELS = new Set(["flux", "sana", "kandinsky", "grok"]);
const FUSION = "https://api-key.fusionbrain.ai/key/api/v1";

function snap64(n: number) {
  const v = Math.min(1024, Math.max(64, Math.round(n) || 768));
  return v - (v % 64) || 64;
}

async function kandinsky(prompt: string, w: number, h: number) {
  const key = process.env.KANDINSKY_API_KEY || "";
  const secret = process.env.KANDINSKY_SECRET_KEY || "";
  if (!key || !secret) return new Response("на сервере нет ключа Кандинского", { status: 503 });
  const headers = { "X-Key": `Key ${key}`, "X-Secret": `Secret ${secret}` };
  const pipes = await fetch(`${FUSION}/pipelines`, { headers });
  if (!pipes.ok) return new Response("Кандинский не пустил ключ", { status: 502 });
  const list = (await pipes.json()) as { id?: string }[];
  const pipeline = list?.[0]?.id;
  if (!pipeline) return new Response("Кандинский не отдал модель", { status: 502 });

  const params = {
    type: "GENERATE",
    numImages: 1,
    width: snap64(w),
    height: snap64(h),
    generateParams: { query: prompt },
  };
  const body = new FormData();
  body.append("pipeline_id", pipeline);
  body.append("params", new Blob([JSON.stringify(params)], { type: "application/json" }));
  const run = await fetch(`${FUSION}/pipeline/run`, { method: "POST", headers, body });
  if (!run.ok) return new Response("Кандинский не принял заказ", { status: 502 });
  const started = (await run.json()) as { uuid?: string };
  if (!started.uuid) return new Response("Кандинский не дал номер заказа", { status: 502 });

  for (let i = 0; i < 24; i++) {
    await new Promise((r) => setTimeout(r, 3000));
    const st = await fetch(`${FUSION}/pipeline/status/${started.uuid}`, { headers });
    if (!st.ok) continue;
    const data = (await st.json()) as { status?: string; images?: string[] | string };
    if (data.status === "DONE") {
      const raw = Array.isArray(data.images) ? data.images[0] : data.images;
      if (!raw) return new Response("Кандинский отдал пустую картинку", { status: 502 });
      const bytes = Buffer.from(raw, "base64");
      return new Response(bytes, {
        headers: { "Content-Type": "image/jpeg", "Cache-Control": "no-store" },
      });
    }
    if (data.status === "FAIL" || data.status === "FAILED" || data.status === "ERROR") {
      return new Response("Кандинский отклонил запрос", { status: 502 });
    }
  }
  return new Response("Кандинский думает слишком долго", { status: 504 });
}

async function grokImage(prompt: string, aspect: string) {
  const token = process.env.REPLICATE_API_TOKEN || "";
  if (!token) return new Response("на сервере нет ключа Replicate", { status: 503 });
  const headers = {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
    Prefer: "wait",
  };
  const input = { prompt, aspect_ratio: aspect === "16:9" || aspect === "9:16" ? aspect : "1:1" };
  let run = await fetch("https://api.replicate.com/v1/models/xai/grok-imagine-image-2/predictions", {
    method: "POST",
    headers,
    body: JSON.stringify({ input }),
  });
  if (run.status === 422) {
    run = await fetch("https://api.replicate.com/v1/models/xai/grok-imagine-image-2/predictions", {
      method: "POST",
      headers,
      body: JSON.stringify({ input: { prompt } }),
    });
  }
  if (!run.ok) return new Response("Grok на Replicate не принял заказ", { status: 502 });
  let data = (await run.json()) as { status?: string; output?: string | string[]; error?: string; urls?: { get?: string } };
  for (let i = 0; i < 12 && data.status && data.status !== "succeeded" && data.status !== "failed" && data.urls?.get; i++) {
    await new Promise((r) => setTimeout(r, 2000));
    const again = await fetch(data.urls.get, { headers: { Authorization: `Bearer ${token}` } });
    if (!again.ok) break;
    data = (await again.json()) as typeof data;
  }
  if (data.status === "failed" || data.error) return new Response("Grok не нарисовал", { status: 502 });
  const url = Array.isArray(data.output) ? data.output[0] : data.output;
  if (!url) return new Response("Grok отдал пустую картинку", { status: 502 });
  const img = await fetch(url);
  if (!img.ok) return new Response("картинка Grok не скачалась", { status: 502 });
  return new Response(img.body, {
    headers: { "Content-Type": img.headers.get("content-type") || "image/jpeg", "Cache-Control": "no-store" },
  });
}
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
        const aspect = q.get("aspect") || "1:1";
        if (model === "kandinsky") return kandinsky(prompt, w, h);
        if (model === "grok") return grokImage(prompt, aspect);
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
