import { createFileRoute } from "@tanstack/react-router";

const HOSTS = [
  "aiquickdraw.com",
  "suno.ai",
  "sunoapi.org",
  "suno.com",
  "removeai.ai",
  "cloudfront.net",
];

function allowed(raw: string) {
  try {
    const u = new URL(raw);
    if (u.protocol !== "https:") return false;
    const host = u.hostname.toLowerCase();
    return HOSTS.some((d) => host === d || host.endsWith(`.${d}`));
  } catch {
    return false;
  }
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
            "content-type": up.headers.get("content-type") || "audio/mpeg",
            "cache-control": "public, max-age=3600",
          },
        });
      },
    },
  },
});
