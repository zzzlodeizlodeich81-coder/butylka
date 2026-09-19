import { createFileRoute } from "@tanstack/react-router";

function sunoKey() {
  return process.env.SUNO_API_KEY?.trim() || "";
}

function pickUrl(body: Record<string, unknown>): string {
  const data = (body.data ?? body) as Record<string, unknown>;
  for (const key of ["downloadUrl", "fileUrl", "url", "file_url", "download_url"]) {
    const v = data[key];
    if (typeof v === "string" && v.startsWith("http")) return v;
  }
  return "";
}

async function toSuno(file: Blob, name: string) {
  const key = sunoKey();
  if (!key) throw new Error("no suno key");
  const out = new FormData();
  out.append("file", file, name);
  out.append("uploadPath", "minus");
  out.append("fileName", name);
  const res = await fetch("https://sunoapiorg.redpandaai.co/api/file-stream-upload", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}` },
    body: out,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  const url = pickUrl(json);
  if (!url) throw new Error(String(json.msg ?? json.error ?? "Suno не принял файл."));
  return url;
}

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
        if (file.size > 20 * 1024 * 1024) {
          return Response.json(
            { ok: false, error: "Файл больше 20 МБ — сожми или обрежь." },
            { status: 413 },
          );
        }
        try {
          const name = file instanceof File ? file.name : "track.mp3";
          const named = new File([file], name, { type: file.type || "audio/mpeg" });
          const url = await toSuno(named, name)
            .catch(() => toCatbox(named))
            .catch(() => toTmpfiles(named));
          return Response.json({ ok: true, url });
        } catch {
          return Response.json({ ok: false, error: "Не выложился файл." }, { status: 502 });
        }
      },
    },
  },
});
