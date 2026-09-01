import { createFileRoute } from "@tanstack/react-router";

async function toCatbox(file: Blob) {
  const name = file instanceof File ? file.name : "track.mp3";
  const out = new FormData();
  out.append("reqtype", "fileupload");
  out.append("fileToUpload", file, name);
  const res = await fetch("https://catbox.moe/user/api.php", { method: "POST", body: out });
  const url = (await res.text()).trim();
  if (url.startsWith("http")) return url;
  throw new Error(url || "catbox");
}

async function toTmpfiles(file: Blob) {
  const out = new FormData();
  out.append("file", file, "track.mp3");
  const res = await fetch("https://tmpfiles.org/api/v1/upload", { method: "POST", body: out });
  const json = (await res.json()) as { data?: { url?: string } };
  const page = json.data?.url ?? "";
  if (!page) throw new Error("tmpfiles");
  return page.replace("tmpfiles.org/", "tmpfiles.org/dl/");
}

export const Route = createFileRoute("/api/host-audio")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const form = await request.formData();
        const file = form.get("file");
        if (!(file instanceof Blob) || file.size < 800) {
          return Response.json({ ok: false, error: "Нет файла." }, { status: 400 });
        }
        if (file.size > 4.2 * 1024 * 1024) {
          return Response.json(
            { ok: false, error: "Файл больше 4 МБ — сожми или спой короче." },
            { status: 413 },
          );
        }
        try {
          const named = new File([file], file instanceof File ? file.name : "take.webm", {
            type: file.type || "audio/webm",
          });
          const url = await toCatbox(named).catch(() => toTmpfiles(named));
          return Response.json({ ok: true, url });
        } catch {
          return Response.json({ ok: false, error: "Не выложился файл." }, { status: 502 });
        }
      },
    },
  },
});
