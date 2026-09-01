import { buildSong, type Song } from "@/lib/songs";

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
  const db = await openDb();
  try {
    const tx = db.transaction(STORE, "readwrite");
    tx.objectStore(STORE).delete(id);
    await txDone(tx);
  } finally {
    db.close();
  }
}

export function lyricsLines(lyrics: string, title: string) {
  const lines = lyrics
    .split(/\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length) return lines;
  return [title || "свой трек", "пой как знаешь", "слова потом", "сейчас — голос"];
}

export function songFromSaved(track: SavedTrack, artist: string): Song {
  const url = objectUrlFor(track.id, track.blob);
  return buildSong({
    id: track.id,
    title: track.title,
    artist,
    genre: "indie",
    bpm: 110,
    mood: "свой трек",
    texts: lyricsLines(track.lyrics, track.title),
    audioUrl: url,
    audioDuration: track.duration,
    minus: false,
    pack: "mine",
  });
}
