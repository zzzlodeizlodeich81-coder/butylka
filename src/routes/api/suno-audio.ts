import { createFileRoute } from "@tanstack/react-router";

const ALLOWED =
  /^https:\/\/([a-z0-9.-]+\.)?(aiquickdraw\.com|suno\.ai|sunoapi\.org|suno\.com)\//i;

export const Route = createFileRoute("/api/suno-audio")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const raw = new URL(request.url).searchParams.get("u") ?? "";
        if (!ALLOWED.test(raw)) {
          return new Response("bad url", { status: 400 });
        }
        const up = await fetch(raw, { redirect: "follow" });
        if (!up.ok || !up.body) {
          return new Response("upstream", { status: 502 });
        }
        return new Response(up.body, {
          status: 200,
          headers: {
            "content-type": up.headers.get("content-type") || "audio/mpeg",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
