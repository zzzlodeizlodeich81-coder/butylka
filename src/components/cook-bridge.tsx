import { useEffect } from "react";
import { toast } from "sonner";
import { cookFromNonsense } from "@/lib/cook-song";
import { buildSong } from "@/lib/songs";
import { linesFromAligned, proxyAudio } from "@/lib/suno";
import {
  getSunoTimestamps,
  pollSunoGenerate,
  pollSunoStems,
  startSunoGenerate,
  startSunoStems,
} from "@/lib/suno-server";
import { useGame } from "@/lib/store";

function sleep(ms: number, live: () => boolean) {
  return new Promise<void>((resolve) => {
    const t = window.setTimeout(resolve, ms);
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

export function CookBridge() {
  const cookStatus = useGame((s) => s.cookStatus);
  const failCook = useGame((s) => s.failCook);
  const readyOmen = useGame((s) => s.readyOmen);

  useEffect(() => {
    if (cookStatus !== "cooking") return;
    let live = true;
    const lines = useGame.getState().verseLines.map((l) => ({
      name: l.name,
      text: l.text,
      late: l.late,
    }));

    void (async () => {
      const cooked = await cookFromNonsense({ data: { lines } });
      if (!live) return;
      if (!cooked.ok) {
        toast.error(cooked.error);
        failCook();
        return;
      }

      toast.message("Suno варит. Крутите бутылку — когда сварится, почернеет.");

      const started = await startSunoGenerate({
        data: {
          title: cooked.song.title,
          style: cooked.sunoPrompt,
          lyrics: cooked.song.lines.map((l) => l.text),
        },
      });
      if (!live) return;
      if (!started.ok) {
        toast.error(started.error);
        failCook();
        return;
      }

      let clip: Awaited<ReturnType<typeof pollSunoGenerate>>["clips"][0] | null = null;
      for (let i = 0; i < 36 && live; i++) {
        await sleep(8000, () => live);
        if (!live) return;
        const info = await pollSunoGenerate({ data: { taskId: started.taskId } });
        if (info.failed) {
          toast.error("Suno не принял этот текст.");
          failCook();
          return;
        }
        if (info.clips.length) {
          clip = info.clips[0];
          if (info.status === "SUCCESS" || clip.audioUrl) break;
        }
      }
      if (!live) return;
      if (!clip) {
        toast.error("Suno не успел. Каталог ещё жив.");
        failCook();
        return;
      }

      let instrumental = clip.audioUrl;
      let minus = true;
      const stems = await startSunoStems({
        data: { taskId: started.taskId, audioId: clip.audioId },
      });
      if (stems.ok) {
        for (let i = 0; i < 18 && live; i++) {
          await sleep(7000, () => live);
          if (!live) return;
          const st = await pollSunoStems({ data: { taskId: stems.taskId } });
          if (st.failed) break;
          if (st.ready && st.instrumentalUrl) {
            instrumental = st.instrumentalUrl;
            minus = false;
            break;
          }
        }
      }
      if (!live) return;

      let song = buildSong({
        id: cooked.song.id,
        title: clip.title || cooked.song.title,
        artist: cooked.song.artist,
        genre: cooked.song.genre,
        bpm: cooked.song.bpm,
        mood: cooked.song.mood,
        texts: cooked.song.lines.map((l) => l.text),
        audioUrl: proxyAudio(instrumental),
        audioDuration: clip.duration > 8 ? clip.duration : undefined,
        generated: true,
        minus,
      });

      try {
        const stamps = await getSunoTimestamps({
          data: { taskId: started.taskId, audioId: clip.audioId },
        });
        if (stamps.ok && stamps.words.length > 8) {
          const aligned = linesFromAligned(stamps.words);
          if (aligned.length >= 4) song = { ...song, lines: aligned };
        }
      } catch {
        /* keep fitted lines */
      }
      if (!live) return;

      readyOmen(song, cooked.sunoPrompt);
      toast.message("Песня готова. Бутылочка темнеет.");
    })().catch(() => {
      if (!live) return;
      toast.error("Suno не ответил.");
      failCook();
    });

    return () => {
      live = false;
    };
  }, [cookStatus, failCook, readyOmen]);

  return null;
}
