import type { LyricLine } from "@/lib/songs";

const LRC = /^\s*\[(\d{1,2}):(\d{2}(?:[.,]\d+)?)\]\s*(.*)$/;

export function parseTimecode(raw: string) {
  const n = raw.replace(",", ".");
  const [m, s] = n.split(":");
  return Number(m) * 60 + Number(s);
}

export function looksLikeLrc(text: string) {
  return text.split(/\n/).filter((line) => LRC.test(line)).length >= 2;
}

export function parseLrc(text: string): LyricLine[] {
  const hits: { t: number; text: string }[] = [];
  for (const raw of text.split(/\n/)) {
    const m = raw.match(LRC);
    if (!m) continue;
    const t = parseTimecode(`${m[1]}:${m[2]}`);
    const line = m[3].trim();
    if (!line || line.startsWith("ti:") || line.startsWith("ar:")) continue;
    hits.push({ t, text: line });
  }
  hits.sort((a, b) => a.t - b.t);
  return hits.map((h, i) => {
    const next = hits[i + 1]?.t;
    const duration = next != null ? Math.max(0.6, next - h.t) : 4;
    return { t: h.t, duration, text: h.text };
  });
}

export function linesFromPlain(texts: string[], duration: number): LyricLine[] {
  const clean = texts.map((t) => t.trim()).filter(Boolean);
  if (!clean.length) return [{ t: 0, duration: Math.max(4, duration), text: "пой как знаешь" }];
  const intro = Math.min(1.2, duration * 0.04);
  const usable = Math.max(clean.length * 1.4, duration - intro);
  const each = usable / clean.length;
  return clean.map((text, i) => ({
    t: intro + i * each,
    duration: each,
    text,
  }));
}

export function stampLines(texts: string[], stamps: number[], duration: number): LyricLine[] {
  return texts.map((text, i) => {
    const t = stamps[i] ?? 0;
    const next = stamps[i + 1] ?? duration;
    return { t, duration: Math.max(0.6, next - t), text };
  });
}

export function plainFromLines(lines: LyricLine[]) {
  return lines.map((l) => l.text).join("\n");
}
