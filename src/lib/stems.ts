export type PreparedTrack = {
  url: string;
  duration: number;
  minus: boolean;
  stereo: boolean;
};

function isAudioFile(file: File) {
  if (file.type.startsWith("audio/")) return true;
  if (file.type === "video/mp4" || file.type === "video/webm") return true;
  return /\.(mp3|wav|m4a|ogg|aac|flac|mpeg|mp4|webm)$/i.test(file.name);
}

function readDuration(url: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const audio = document.createElement("audio");
    audio.preload = "metadata";
    const fail = () => {
      audio.src = "";
      reject(new Error("Не вышло прочитать файл. Попробуй mp3 или wav."));
    };
    const finish = (d: number) => {
      audio.removeEventListener("error", fail);
      audio.src = "";
      if (Number.isFinite(d) && d > 0.4) resolve(d);
      else reject(new Error("Не вышло узнать длину трека."));
    };
    audio.addEventListener("error", fail);
    audio.addEventListener(
      "loadedmetadata",
      () => {
        if (Number.isFinite(audio.duration) && audio.duration > 0) {
          finish(audio.duration);
          return;
        }
        audio.currentTime = 1e7;
        audio.addEventListener("seeked", () => finish(audio.currentTime), { once: true });
      },
      { once: true },
    );
    audio.src = url;
  });
}

export async function prepareKaraokeTrack(file: File, extractMinus: boolean): Promise<PreparedTrack> {
  if (!isAudioFile(file)) throw new Error("Нужен аудиофайл — mp3, wav, m4a.");
  if (file.size > 24 * 1024 * 1024) throw new Error("Файл больше 24 МБ — возьми покороче.");
  const url = URL.createObjectURL(file);
  try {
    const duration = await readDuration(url);
    if (duration > 10 * 60) {
      URL.revokeObjectURL(url);
      throw new Error("Трек длиннее 10 минут. Обрежь его.");
    }
    return { url, duration, minus: extractMinus, stereo: true };
  } catch (err) {
    URL.revokeObjectURL(url);
    throw err;
  }
}

export function takeAudioFile(file: File | undefined | null): File | null {
  if (!file) return null;
  if (!isAudioFile(file)) return null;
  return file;
}

function clamp(n: number) {
  return Math.max(-1, Math.min(1, n));
}

function wavStereo(left: Float32Array, right: Float32Array, rate: number) {
  const len = left.length;
  const dataLen = len * 4;
  const out = new ArrayBuffer(44 + dataLen);
  const v = new DataView(out);
  const ascii = (o: number, s: string) => {
    for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i));
  };
  ascii(0, "RIFF");
  v.setUint32(4, 36 + dataLen, true);
  ascii(8, "WAVE");
  ascii(12, "fmt ");
  v.setUint32(16, 16, true);
  v.setUint16(20, 1, true);
  v.setUint16(22, 2, true);
  v.setUint32(24, rate, true);
  v.setUint32(28, rate * 4, true);
  v.setUint16(32, 4, true);
  v.setUint16(34, 16, true);
  ascii(36, "data");
  v.setUint32(40, dataLen, true);
  let o = 44;
  for (let i = 0; i < len; i++) {
    const sL = clamp(left[i]);
    const sR = clamp(right[i]);
    v.setInt16(o, sL < 0 ? sL * 0x8000 : sL * 0x7fff, true);
    o += 2;
    v.setInt16(o, sR < 0 ? sR * 0x8000 : sR * 0x7fff, true);
    o += 2;
  }
  return new Blob([out], { type: "audio/wav" });
}

/**
 * Karaoke-style vocal cut on-device: L−R side + kept bass.
 * Works on stereo files without Suno. Mono returns null.
 */
export async function renderMinus(blob: Blob, ctx?: AudioContext | null): Promise<Blob | null> {
  const audioCtx = ctx ?? new AudioContext();
  const own = audioCtx !== ctx;
  try {
    if (audioCtx.state === "suspended") await audioCtx.resume().catch(() => undefined);
    const raw = await blob.arrayBuffer();
    const audio = await audioCtx.decodeAudioData(raw.slice(0));
    if (audio.numberOfChannels < 2) return null;
    const len = audio.length;
    const rate = audio.sampleRate;
    const L = audio.getChannelData(0);
    const R = audio.getChannelData(1);
    const outL = new Float32Array(len);
    const outR = new Float32Array(len);
    const coeff = Math.exp((-2 * Math.PI * 170) / rate);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const mid = (L[i] + R[i]) * 0.5;
      const side = (L[i] - R[i]) * 1.2;
      lp = coeff * lp + (1 - coeff) * mid;
      const bass = lp * 0.55;
      outL[i] = side + bass;
      outR[i] = -side + bass;
    }
    return wavStereo(outL, outR, rate);
  } catch {
    return null;
  } finally {
    if (own) await audioCtx.close().catch(() => undefined);
  }
}

export function fileToAvatar(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) {
      reject(new Error("Нужна картинка."));
      return;
    }
    if (file.size > 6 * 1024 * 1024) {
      reject(new Error("Фото больше 6 МБ."));
      return;
    }
    const img = new Image();
    const src = URL.createObjectURL(file);
    img.onload = () => {
      const size = 256;
      const canvas = document.createElement("canvas");
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext("2d");
      if (!ctx) {
        URL.revokeObjectURL(src);
        reject(new Error("Не вышло прочитать фото."));
        return;
      }
      const min = Math.min(img.width, img.height);
      const sx = (img.width - min) / 2;
      const sy = (img.height - min) / 2;
      ctx.drawImage(img, sx, sy, min, min, 0, 0, size, size);
      URL.revokeObjectURL(src);
      resolve(canvas.toDataURL("image/jpeg", 0.86));
    };
    img.onerror = () => {
      URL.revokeObjectURL(src);
      reject(new Error("Не вышло прочитать фото."));
    };
    img.src = src;
  });
}
