import { buildSong, type LyricLine, type Song } from "@/lib/songs";
import { looksLikeLrc, parseLrc } from "@/lib/lyrics-sync";

const DB_NAME = "butylka-library";
const STORE = "tracks";
const VERSION = 1;
export const LIBRARY_MAX = 3;

export type SavedTrack = {
  id: string;
  title: string;
  lyrics: string;
  duration: number;
  mime: string;
  addedAt: number;
  blob: Blob;
  lines?: LyricLine[];
  minusBlob?: Blob;
  vocalBlob?: Blob;
  takeBlob?: Blob;
  coverBlob?: Blob;
  sourceUrl?: string;
};

const objectUrls = new Map<string, string>();

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: "id" });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Не открылась библиотека."));
  });
}

function reqToPromise<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error("Библиотека не ответила."));
  });
}

export function objectUrlFor(id: string, blob: Blob) {
  const prev = objectUrls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  const url = URL.createObjectURL(blob);
  objectUrls.set(id, url);
  return url;
}

export function revokeUrl(id: string) {
  const prev = objectUrls.get(id);
  if (prev) URL.revokeObjectURL(prev);
  objectUrls.delete(id);
}

export async function listSavedTracks(): Promise<SavedTrack[]> {
  if (typeof indexedDB === "undefined") return [];
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const rows = await reqToPromise(tx.objectStore(STORE).getAll() as IDBRequest<SavedTrack[]>);
    return (rows ?? []).sort((a, b) => b.addedAt - a.addedAt);
  } finally {
    db.close();
  }
}

function txDone(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error("Библиотека не записала."));
    tx.onabort = () => reject(tx.error ?? new Error("Библиотека оборвалась."));
  });
}

export async function saveTrack(track: SavedTrack): Promise<void> {
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).put(track);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function deleteSavedTrack(id: string): Promise<void> {
  revokeUrl(id);
  revokeUrl(`${id}-minus`);
  revokeUrl(`${id}-vocal`);
  revokeUrl(`${id}-take`);
  revokeUrl(`${id}-cover`);
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export async function getSavedTrack(id: string): Promise<SavedTrack | null> {
  if (typeof indexedDB === "undefined") return null;
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readonly");
    const row = await reqToPromise(tx.objectStore(STORE).get(id) as IDBRequest<SavedTrack | undefined>);
    return row ?? null;
  } finally {
    db.close();
  }
}

export function fileNameFor(title: string, kind: string, mime: string) {
  const slug =
    title
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 42) || "track";
  const ext = /mp4|video/i.test(mime)
    ? "mp4"
    : /wav/i.test(mime)
      ? "wav"
      : /ogg/i.test(mime)
        ? "ogg"
        : /aac|m4a/i.test(mime)
          ? "m4a"
          : "mp3";
  return `${slug}-${kind}.${ext}`;
}

export function downloadBlob(blob: Blob, name: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.rel = "noopener";
  document.body.appendChild(a);
  a.click();
  a.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 4000);
}

export function downloadTake(track: SavedTrack, kind: "plus" | "minus" | "vocal" | "take" | "cover") {
  const blob =
    kind === "plus"
      ? track.blob
      : kind === "minus"
        ? track.minusBlob
        : kind === "vocal"
          ? track.vocalBlob
          : kind === "take"
            ? track.takeBlob
            : track.coverBlob;
  if (!blob) return false;
  const tag = kind === "plus" ? "original" : kind === "take" ? "karaoke" : kind;
  downloadBlob(blob, fileNameFor(track.title, tag, blob.type || track.mime));
  return true;
}

export function lyricsLines(lyrics: string, title: string) {
  if (looksLikeLrc(lyrics)) return parseLrc(lyrics).map((l) => l.text);
  const lines = lyrics
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length) return lines;
  return [title || "свой трек", "пой как знаешь"];
}

export function songFromSaved(track: SavedTrack, artist: string): Song {
  const play = track.minusBlob ?? track.blob;
  const urlKey = track.minusBlob ? `${track.id}-minus` : track.id;
  const url = objectUrlFor(urlKey, play);
  const timed = track.lines?.length
    ? track.lines
    : looksLikeLrc(track.lyrics)
      ? parseLrc(track.lyrics)
      : undefined;
  return buildSong({
    id: track.id,
    title: track.title,
    artist,
    genre: "indie",
    bpm: 110,
    mood: track.minusBlob ? "минус" : "свой трек",
    texts: lyricsLines(track.lyrics, track.title),
    lines: timed,
    audioUrl: url,
    audioDuration: track.duration,
    minus: false,
    pack: "mine",
    hasTake: Boolean(track.takeBlob),
    hasCover: Boolean(track.coverBlob),
    takeUrl: track.takeBlob ? objectUrlFor(`${track.id}-take`, track.takeBlob) : undefined,
    coverUrl: track.coverBlob ? objectUrlFor(`${track.id}-cover`, track.coverBlob) : undefined,
  });
}
