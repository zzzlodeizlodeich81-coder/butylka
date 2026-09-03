import { useEffect } from "react";
import { toast } from "sonner";
import { buildSong } from "@/lib/songs";
import { linesFromAligned, proxyAudio } from "@/lib/suno";
import {
  getSunoTimestamps,
  pollSunoGenerate,
  pollSunoLyrics,
  pollSunoStems,
  startSunoGenerate,
  startSunoLyrics,
  startSunoStems,
  themeToLyricsPrompt,
} from "@/lib/suno-server";
import { useGame } from "@/lib/store";
import { uid } from "@/lib/utils";

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

function lyricsPromptFromTable(lines: { name: string; text: string }[]) {
  const rows = lines
    .map((l) => l.text.trim())
    .filter((t) => t && t !== "…")
    .slice(0, 8);
  const blob = rows.join(" / ");
  return themeToLyricsPrompt(blob || "вечер за столом");
}

function lyricRows(text: string) {
  return text
    .split(/\n/)
    .map((l) => l.replace(/^\[[^\]]+]\s*/, "").trim())
    .filter((l) => l && !/^\[/.test(l));
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
      toast.message("Suno пишет стихи из ваших строк.");
      const startedLyrics = await startSunoLyrics({
        data: { prompt: lyricsPromptFromTable(lines) },
      });
      if (!live) return;
      if (!startedLyrics.ok) {
        toast.error(startedLyrics.error);
        failCook();
        return;
      }

      let lyrics: { title: string; text: string } | null = null;
      for (let i = 0; i < 24 && live; i++) {
        await sleep(4000, () => live);
        if (!live) return;
        const st = await pollSunoLyrics({ data: { taskId: startedLyrics.taskId } });
        if (st.failed) {
          toast.error("Suno не принял эти строки.");
          failCook();
          return;
        }
        const hit = st.variants.find((v) => /complete|success/i.test(v.status) || v.text.length > 40);
        if (hit) {
          lyrics = hit;
          break;
        }
        if (st.status === "SUCCESS" && st.variants[0]) {
          lyrics = st.variants[0];
          break;
        }
      }
      if (!live) return;
      if (!lyrics) {
        toast.error("Стихи не пришли. Колода на месте.");
        failCook();
        return;
      }

      const title = (lyrics.title || lines[0]?.text || "Строки стола").slice(0, 48);
      const style = "russian pop, party vocal, karaoke, acoustic and synth, table song";
      toast.message("Suno варит. Крутите балалайку — когда сварится, почернеет.");

      const started = await startSunoGenerate({
        data: {
          title,
          style,
          lyrics: lyrics.text,
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
        toast.error("Suno не успел. Колода ещё жива.");
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

      const texts = lyricRows(lyrics.text);
      let song = buildSong({
        id: uid("omen"),
        title: clip.title || title,
        artist: "стол",
        genre: "indie",
        bpm: 110,
        mood: "из строк",
        texts: texts.length ? texts : lyricRows(clip.lyrics),
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

      readyOmen(song, style);
      toast.message("Песня готова. Балалайка темнеет.");
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
