import { proxyAudio, type AlignedWord } from "@/lib/suno";
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
    if (!started.ok) continue;
    for (let i = 0; i < 28 && live(); i++) {
      await sleep(4000, live);
      if (!live()) return null;
      const st = await pollSunoStems({ data: { taskId: started.taskId } });
      if (st.failed) break;
      if (st.instrumentalUrl) {
        return { instrumentalUrl: st.instrumentalUrl, vocalUrl: st.vocalUrl };
      }
    }
  }
  return null;
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
