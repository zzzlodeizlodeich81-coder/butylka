import { createFileRoute } from "@tanstack/react-router";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { videoNotes } from "@/lib/notes";
import { addPurse, guestFromRequest, spendPurse } from "@/lib/purse.server";

type Job = { guest: string; cost: number; closed?: boolean };

function filePath() {
  return join(process.cwd(), "data", "clips.json");
}

async function readJobs(): Promise<Record<string, Job>> {
  try {
    const parsed = JSON.parse(await readFile(filePath(), "utf8")) as Record<string, Job>;
    return parsed && typeof parsed === "object" ? parsed : {};
  } catch {
    return {};
  }
}

async function writeJobs(jobs: Record<string, Job>) {
  const path = filePath();
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, JSON.stringify(jobs));
}

function token() {
  return process.env.REPLICATE_API_TOKEN || "";
}

export const Route = createFileRoute("/api/clip")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const guest = guestFromRequest(request);
        if (!guest) return Response.json({ error: "Сначала зайди во двор." }, { status: 401 });
        if (!token()) return Response.json({ error: "на сервере нет ключа Replicate" }, { status: 503 });
        const body = (await request.json().catch(() => null)) as { prompt?: string; aspect?: string; duration?: number } | null;
        const prompt = (body?.prompt || "").trim().slice(0, 400);
        if (prompt.length < 2) return Response.json({ error: "пустой запрос" }, { status: 400 });
        const duration = body?.duration === 10 || body?.duration === 15 ? body.duration : 5;
        const aspect = body?.aspect === "16:9" || body?.aspect === "9:16" ? body.aspect : "1:1";
        const cost = videoNotes(duration);
        const paid = await spendPurse(guest.id, cost);
        if (!paid.ok) return Response.json({ error: paid.error, notes: paid.notes }, { status: 402 });

        const input = { prompt, aspect_ratio: aspect, duration, resolution: "480p" };
        let run = await fetch("https://api.replicate.com/v1/models/xai/grok-imagine-video/predictions", {
          method: "POST",
          headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
          body: JSON.stringify({ input }),
        });
        if (run.status === 422) {
          run = await fetch("https://api.replicate.com/v1/models/xai/grok-imagine-video/predictions", {
            method: "POST",
            headers: { Authorization: `Bearer ${token()}`, "Content-Type": "application/json" },
            body: JSON.stringify({ input: { prompt, aspect_ratio: aspect, duration } }),
          });
        }
        if (!run.ok) {
          const back = await addPurse(guest.id, cost);
          return Response.json({ error: "Grok не принял ролик", notes: back?.notes ?? paid.notes + cost }, { status: 502 });
        }
        const started = (await run.json()) as { id?: string };
        if (!started.id) {
          const back = await addPurse(guest.id, cost);
          return Response.json({ error: "Grok не дал номер ролика", notes: back?.notes ?? paid.notes + cost }, { status: 502 });
        }
        const jobs = await readJobs();
        jobs[started.id] = { guest: guest.id, cost };
        await writeJobs(jobs);
        return Response.json({ id: started.id, notes: paid.notes });
      },
      GET: async ({ request }) => {
        const id = new URL(request.url).searchParams.get("id") || "";
        if (!id) return new Response("нет ролика", { status: 400 });
        const jobs = await readJobs();
        const job = jobs[id];
        if (!job) return new Response("чужой ролик", { status: 404 });
        const st = await fetch(`https://api.replicate.com/v1/predictions/${id}`, {
          headers: { Authorization: `Bearer ${token()}` },
        });
        if (!st.ok) return Response.json({ status: "processing" }, { status: 202 });
        const data = (await st.json()) as { status?: string; output?: string | string[]; error?: string };
        if (data.status === "succeeded") {
          job.closed = true;
          jobs[id] = job;
          await writeJobs(jobs);
          const url = Array.isArray(data.output) ? data.output[0] : data.output;
          if (!url) return new Response("пустой ролик", { status: 502 });
          const file = await fetch(url);
          if (!file.ok) return new Response("ролик не скачался", { status: 502 });
          return new Response(file.body, {
            headers: { "Content-Type": file.headers.get("content-type") || "video/mp4", "Cache-Control": "no-store" },
          });
        }
        if (data.status === "failed" || data.status === "canceled") {
          let notes = 0;
          if (!job.closed) {
            const back = await addPurse(job.guest, job.cost);
            notes = back?.notes ?? 0;
            job.closed = true;
            jobs[id] = job;
            await writeJobs(jobs);
          }
          return Response.json({ error: "Grok не снял ролик", notes }, { status: 502 });
        }
        return Response.json({ status: "processing" }, { status: 202 });
      },
    },
  },
});
