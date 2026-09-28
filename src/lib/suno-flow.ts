import { proxyAudio, type AlignedWord } from "@/lib/suno";
import { downloadBlob } from "@/lib/library";
import { zipStore } from "@/lib/zip";
import { getSunoTimestamps, pollSunoStems, startSunoStems } from "@/lib/suno-server";

function sleep(ms: number, live?: () => boolean) {
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
    if (!live) return;
    const iv = window.setInterval(() => {
      if (!live()) {
        window.clearTimeout(t);
        window.clearInterval(iv);
        resolve();
      }
    }, 400);
    window.setTimeout(() => window.clearInterval(iv), ms + 20);
  });
}

export async function pullSunoMinus(
  input: { taskId?: string; audioId?: string; audioUrl?: string },
  live: () => boolean = () => true,
): Promise<{ instrumentalUrl: string; vocalUrl: string | null } | null> {
  const tries: { taskId?: string; audioId?: string; audioUrl?: string }[] = [];
  if (input.audioUrl) tries.push({ audioUrl: input.audioUrl });
  if (input.taskId || input.audioId) tries.push({ taskId: input.taskId, audioId: input.audioId });

  for (const payload of tries) {
    if (!live()) return null;
    const started = await startSunoStems({ data: payload });
    if (!started.ok) {
      const err = new Error(started.error || "Не вышло снять минус.");
      (err as Error & { needNotes?: number }).needNotes = (started as { needNotes?: number }).needNotes;
      throw err;
    }
    for (let i = 0; i < 28 && live(); i++) {
      await sleep(4000, live);
      if (!live()) return null;
      const st = await pollSunoStems({ data: { taskId: started.taskId } });
      if (st.failed) {
        throw new Error(st.errorMessage || "Suno не снял минус с этого файла.");
      }
      if (st.instrumentalUrl) {
        return { instrumentalUrl: st.instrumentalUrl, vocalUrl: st.vocalUrl };
      }
    }
  }
  return null;
}

export type SunoStem = { id: string; label: string; url: string };

export async function pullSunoStemPack(
  input: { taskId?: string; audioId?: string; audioUrl?: string },
  live: () => boolean = () => true,
): Promise<SunoStem[] | null> {
  const started = await startSunoStems({ data: { ...input, kind: "stems" } });
  if (!started.ok) {
    const err = new Error(started.error || "Не вышло снять стемы.");
    (err as Error & { needNotes?: number }).needNotes = (started as { needNotes?: number }).needNotes;
    throw err;
  }
  for (let i = 0; i < 40 && live(); i++) {
    await sleep(4000, live);
    if (!live()) return null;
    const st = await pollSunoStems({ data: { taskId: started.taskId } });
    if (st.failed) throw new Error(st.errorMessage || "Suno не снял стемы.");
    if (st.stems.length && /SUCCESS|COMPLETE/i.test(st.status)) return st.stems;
  }
  return null;
}

export async function zipSunoStems(title: string, stems: SunoStem[]) {
  const files: { name: string; data: Uint8Array }[] = [];
  let minusBlob: Blob | undefined;
  let vocalBlob: Blob | undefined;
  for (const stem of stems) {
    const res = await fetch(proxyAudio(stem.url));
    if (!res.ok) continue;
    const raw = new Uint8Array(await res.arrayBuffer());
    if (raw.byteLength < 1000) continue;
    files.push({ name: `${stem.label}.mp3`, data: raw });
    const blob = new Blob([raw], { type: "audio/mpeg" });
    if (stem.id === "instrumental") minusBlob = blob;
    if (stem.id === "vocal") vocalBlob = blob;
  }
  if (!files.length) throw new Error("Suno не отдал ни одного стема.");
  const slug = title.replace(/[^\p{L}\p{N}]+/gu, "-").replace(/^-|-$/g, "").slice(0, 42) || "track";
  downloadBlob(zipStore(files), `${slug}-stems.zip`);
  return { count: files.length, minusBlob, vocalBlob };
}

export async function pullMinusBlobs(
  input: { taskId?: string; audioId?: string; audioUrl?: string },
  live: () => boolean = () => true,
) {
  const hit = await pullSunoMinus(input, live);
  if (!hit) return null;
  const res = await fetch(proxyAudio(hit.instrumentalUrl));
  if (!res.ok) return null;
  const minusBlob = await res.blob();
  if (minusBlob.size < 4000) return null;
  let vocalBlob: Blob | undefined;
  if (hit.vocalUrl) {
    const v = await fetch(proxyAudio(hit.vocalUrl));
    if (v.ok) vocalBlob = await v.blob();
  }
  return { minusBlob, vocalBlob, instrumentalUrl: hit.instrumentalUrl };
}

export async function pullSunoAligned(
  taskId: string,
  audioId: string,
  live: () => boolean = () => true,
): Promise<AlignedWord[]> {
  for (let i = 0; i < 10 && live(); i++) {
    if (i) await sleep(3000, live);
    if (!live()) return [];
    const st = await getSunoTimestamps({ data: { taskId, audioId } });
    if (st.ok && st.words.length > 6) return st.words;
  }
  return [];
}
