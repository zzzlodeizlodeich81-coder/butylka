import type { LyricLine } from "@/lib/songs";

export type AlignedWord = { word: string; startS: number; endS: number };

export function proxyAudio(url: string) {
  return `/api/suno-audio?u=${encodeURIComponent(url)}`;
}

function bare(s: string) {
  return s
    .toLowerCase()
    .replace(/^\[[^\]]+]\s*/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, "");
}

function cleanWord(raw: string) {
  return raw.replace(/^\[[^\]]+]\s*/g, "").replace(/\s+/g, " ").trim();
}

export function linesFromAligned(words: AlignedWord[], rows?: string[]): LyricLine[] {
  const usable = words
    .map((w) => ({ ...w, word: cleanWord(w.word) }))
    .filter((w) => w.word && !/^\[[^\]]+]$/.test(w.word));

  if (rows?.length && usable.length) {
    let wi = 0;
    return rows
      .map((row) => {
        const target = bare(row);
        if (!target) return null;
        while (wi < usable.length && !bare(usable[wi].word)) wi += 1;
        if (wi >= usable.length) return null;
        const t0 = usable[wi].startS;
        let t1 = usable[wi].endS;
        let acc = "";
        const start = wi;
        while (wi < usable.length) {
          acc += bare(usable[wi].word);
          t1 = usable[wi].endS;
          wi += 1;
          if (acc.length >= Math.max(3, Math.floor(target.length * 0.7))) break;
          if (acc.length > target.length + 12) break;
        }
        if (wi === start) wi += 1;
        return {
          t: t0,
          duration: Math.max(0.8, t1 - t0),
          text: row.slice(0, 48),
        };
      })
      .filter((l): l is LyricLine => Boolean(l));
  }

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
      text: text.slice(0, 48),
    });
  };

  for (const w of usable) {
    if (!buf.length) start = w.startS;
    else if (w.startS - end > 0.45 || buf.join(" ").length > 36) {
      flush();
      start = w.startS;
    }
    buf.push(w.word);
    end = w.endS;
  }
  flush();
  return lines;
}
