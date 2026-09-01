import { createFileRoute } from "@tanstack/react-router";

function allowed(raw: string) {
  if (
    /^https:\/\/([a-z0-9.-]+\.)*(aiquickdraw\.com|suno\.ai|sunoapi\.org|suno\.com)\//i.test(raw)
  ) {
    return true;
  }
  return /^https:\/\/[a-z0-9.-]+\.cloudfront\.net\/.+\.(m4a|mp3|wav|ogg)(\?|$)/i.test(raw);
}

export const Route = createFileRoute("/api/suno-audio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        if (!allowed(raw)) {
          return new Response("bad url", { status: 400 });
        }
        const up = await fetch(raw, {
          redirect: "follow",
          headers: {
            "User-Agent": "Mozilla/5.0",
            Referer: "https://suno.com/",
          },
        });
        if (!up.ok || !up.body) {
          return new Response("upstream", { status: 502 });
        }
        return new Response(up.body, {
          status: 200,
          headers: {
            "content-type": up.headers.get("content-type") || "audio/mp4",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
