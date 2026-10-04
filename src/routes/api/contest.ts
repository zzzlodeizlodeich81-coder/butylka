import { createFileRoute } from "@tanstack/react-router";
import { adminOf, contestFile, contestView, submitContest, voteContest } from "@/lib/contest.server";
import { guestFromRequest } from "@/lib/purse.server";

function extOf(name: string) {
  const hit = name.toLowerCase().match(/\.(mp3|wav|flac|m4a|ogg|aac|wma|aiff|aif)$/);
  return hit ? hit[0] : ".bin";
}

export const Route = createFileRoute("/api/contest")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ ok: false, error: "Сначала зайди во двор." }, { status: 401 });
        const url = new URL(request.url);
        const id = url.searchParams.get("id") || "";
        const part = url.searchParams.get("part") === "cover" ? "cover" : "audio";
        if (id) {
          const file = await contestFile(id, part);
          if (!file) return new Response("Нет файла", { status: 404 });
          return new Response(new Uint8Array(file.body), {
            headers: {
              "Content-Type": file.type,
              "Content-Disposition": `inline; filename="${encodeURIComponent(file.filename)}"`,
              "Cache-Control": "private, max-age=3600",
            },
          });
        }
        const admin = await adminOf(guest.id);
        return Response.json({ ok: true, admin, ...(await contestView(guest.id, admin)) });
      },
      POST: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ ok: false, error: "Сначала зайди во двор." }, { status: 401 });
        const type = request.headers.get("content-type") || "";
        if (type.includes("application/json")) {
          const body = (await request.json().catch(() => null)) as { id?: string } | null;
          const hit = await voteContest(guest.id, String(body?.id || ""));
          return Response.json(hit, { status: hit.ok ? 200 : 400 });
        }
        const form = await request.formData();
        const yes = (name: string) => form.get(name) === "1";
        if (!yes("deal") || !yes("free") || !yes("rights") || !yes("court")) {
          return Response.json({ ok: false, error: "Нужны все четыре согласия." }, { status: 400 });
        }
        const audio = form.get("audio");
        const cover = form.get("cover");
        if (!(cover instanceof Blob)) {
          return Response.json({ ok: false, error: "Нужна квадратная картинка." }, { status: 400 });
        }
        const named = audio instanceof File ? audio.name : "track.bin";
        const hit = await submitContest({
          guestId: guest.id,
          artist: String(form.get("artist") || ""),
          title: String(form.get("title") || ""),
          lyrics: String(form.get("lyrics") || ""),
          songId: String(form.get("songId") || ""),
          url: String(form.get("url") || ""),
          audio: audio instanceof Blob ? Buffer.from(await audio.arrayBuffer()) : Buffer.alloc(0),
          ext: extOf(named),
          cover: Buffer.from(await cover.arrayBuffer()),
        });
        return Response.json(hit, { status: hit.ok ? 200 : hit.error?.includes("нот") ? 402 : 400 });
      },
    },
  },
});
