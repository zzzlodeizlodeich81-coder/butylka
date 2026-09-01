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
        audio.addEventListener(
          "seeked",
          () => finish(audio.currentTime),
          { once: true },
        );
      },
      { once: true },
    );
    audio.src = url;
  });
}

export async function prepareKaraokeTrack(
  file: File,
  extractMinus: boolean,
): Promise<PreparedTrack> {
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
