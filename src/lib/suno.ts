import type { LyricLine } from "@/lib/songs";

export type AlignedWord = { word: string; startS: number; endS: number };

export function proxyAudio(url: string) {
  return `/api/suno-audio?u=${encodeURIComponent(url)}`;
}

export function linesFromAligned(words: AlignedWord[]): LyricLine[] {
  const lines: LyricLine[] = [];
  let buf: string[] = [];
  let start = 0;
  let end = 0;

  const flush = () => {
    const text = buf.join(" ").replace(/\s+/g, " ").trim();
    buf = [];
    if (!text || /^\[[^\]]+]$/.test(text)) return;
    lines.push({
      t: start,
      duration: Math.max(0.9, end - start),
      text: text.slice(0, 42),
    });
  };

  for (const w of words) {
    if (/^\s*\[[^\]]+]\s*$/.test(w.word)) {
      flush();
      continue;
    }
    if (!buf.length) start = w.startS;
    else if (w.startS - end > 0.42 || buf.join(" ").length > 34) {
      flush();
      start = w.startS;
    }
    buf.push(w.word);
    end = w.endS;
  }
  flush();
  return lines;
}
