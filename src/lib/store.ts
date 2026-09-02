import { create } from "zustand";
import { netSend } from "@/lib/net-bus";
import { CATALOG, pickTableThree, pickThree, type Song } from "@/lib/songs";
import { uid } from "@/lib/utils";

export type Phase =
  | "gate"
  | "profile"
  | "lobby"
  | "bring"
  | "verse"
  | "table"
  | "reveal"
  | "song"
  | "karaoke"
  | "result";

export type Player = {
  id: string;
  name: string;
  color: string;
  score: number;
  avatarUrl: string | null;
  notes: number;
  hearts: number;
};

export type Challenge = {
  id: string;
  label: string;
  kind: "solo" | "duet" | "dedicate" | "style";
};

export type GiftKind = "flowers" | "bear" | "gold";
export type SkipKind = "kiss" | "smile";

export type ChatMessage = {
  id: string;
  fromId: string;
  toId: "all" | string;
  text: string;
  at: number;
};

export type ReceivedGift = {
  id: string;
  kind: GiftKind;
  fromId: string;
};

export type VerseLine = {
  playerId: string;
  name: string;
  text: string;
  late: boolean;
};

export type CookStatus = "idle" | "cooking" | "ready" | "failed";

export const START_NOTES = 10;
export const SKIP_COST = 1;
export const LATE_COST = 1;
export const TAKE_COST = 2;
export const COVER_COST = 4;
export const VERSE_SECONDS = 10;

export const OMEN_CHALLENGE: Challenge = {
  id: "omen",
  label: "Тёмная бутылочка. Поёшь песню, которую собрал стол.",
  kind: "solo",
};

export const GIFT_CATALOG: { id: GiftKind; label: string; cost: number }[] = [
  { id: "flowers", label: "Цветы", cost: 1 },
  { id: "bear", label: "Мишка", cost: 2 },
  { id: "gold", label: "Золотая нота", cost: 5 },
];

export const PLAYER_COLORS = [
  "#c4b5a0",
  "#7d8b78",
  "#b5524a",
  "#6a7c8a",
  "#c49a7a",
  "#8b7355",
  "#d4c4b0",
  "#5c6b62",
];

export const CHALLENGES: Challenge[] = [
  { id: "solo", label: "Соло. Весь зал — твой.", kind: "solo" },
  { id: "kneel", label: "На одном колене, как в клипе.", kind: "style" },
  { id: "whisper", label: "Только шёпотом. Микрофон всё слышит.", kind: "style" },
  { id: "opera", label: "Как в опере. Без стеснения.", kind: "style" },
  { id: "anthem", label: "Как гимн. Рука на груди.", kind: "style" },
  { id: "stand", label: "Стой. Садиться нельзя до припева.", kind: "style" },
  { id: "laugh", label: "Нельзя смеяться. Вообще.", kind: "style" },
  { id: "eyes", label: "Смотри в глаза {name} всё время.", kind: "dedicate" },
  { id: "dedicate", label: "Посвяти эту песню {name}.", kind: "dedicate" },
  { id: "duet", label: "Дуэт с {name}. Делите строки.", kind: "duet" },
];

const DEFAULT_NAMES = ["Макс", "Лера", "Дима", "Катя"];

function blankPlayer(name: string, index: number): Player {
  return {
    id: uid("p"),
    name,
    color: PLAYER_COLORS[index % PLAYER_COLORS.length],
    score: 0,
    avatarUrl: null,
    notes: START_NOTES,
    hearts: 0,
  };
}

function makePlayers(names = DEFAULT_NAMES): Player[] {
  return names.map((name, i) => blankPlayer(name, i));
}

export function formatChallenge(challenge: Challenge, targetName?: string) {
  return challenge.label.replace("{name}", targetName ?? "кому-то");
}

export function gradeFor(score: number) {
  if (score >= 8500) return { title: "Караоке-бог", hint: "Соседи снизу стучат в такт." };
  if (score >= 6500) return { title: "В точку", hint: "Бутылочка кивает." };
  if (score >= 4000) return { title: "Норм", hint: "Можно ещё круг." };
  return { title: "Смелость есть", hint: "Текст был сложный. Или микрофон." };
}

type GameState = {
  phase: Phase;
  players: Player[];
  youId: string;
  mode: "local" | "net";
  roomCode: string | null;
  hostId: string | null;
  wantHost: boolean;
  singerId: string | null;
  partnerId: string | null;
  challenge: Challenge | null;
  options: Song[];
  song: Song | null;
  lastScore: number;
  lastHadMic: boolean;
  lastSkip: { fromId: string; toId: string; kind: SkipKind } | null;
  lastGifts: ReceivedGift[];
  lastHearts: number;
  lastTake: Blob | null;
  round: number;
  spinning: boolean;
  customSongs: Song[];
  chat: ChatMessage[];
  chatOpen: boolean;
  chatTarget: "all" | string;
  musicGain: number;
  sfxGain: number;
  muted: boolean;
  verseIndex: number;
  verseLines: VerseLine[];
  cookStatus: CookStatus;
  omen: boolean;
  omenSong: Song | null;
  sunoPrompt: string;
  enter: () => void;
  setPlayerName: (id: string, name: string) => void;
  setAvatar: (id: string, url: string | null) => void;
  addPlayer: () => void;
  removePlayer: (id: string) => void;
  toLobby: () => void;
  toBring: () => void;
  toVerse: () => void;
  toTable: () => void;
  submitVerse: (text: string, late: boolean) => void;
  failCook: () => void;
  readyOmen: (song: Song, prompt: string) => void;
  tryBeginOmen: () => void;
  startSpin: () => { singerId: string; partnerId: string | null; challenge: Challenge };
  finishSpin: () => void;
  skipTurn: (toId: string, kind: SkipKind) => boolean;
  spendNotes: (playerId: string, cost: number) => boolean;
  toSongPick: () => void;
  rerollSongs: () => void;
  addCustomSong: (song: Song) => void;
  replaceCustomSongs: (songs: Song[]) => void;
  chooseSong: (song: Song) => void;
  finishKaraoke: (score: number, hadMic: boolean) => void;
  setLastTake: (blob: Blob | null) => void;
  sendHeart: (fromId: string) => void;
  sendGift: (fromId: string, kind: GiftKind) => boolean;
  sendChat: (text: string, toId: "all" | string) => void;
  setChatOpen: (open: boolean) => void;
  setChatTarget: (to: "all" | string) => void;
  nextRound: () => void;
  backToLobby: () => void;
  setMusicGain: (v: number) => void;
  setSfxGain: (v: number) => void;
  toggleMute: () => void;
  rehydrate: () => void;
  createRoom: () => string;
  joinRoom: (code: string) => void;
  adoptNet: (selfId: string, asHost: boolean) => void;
  applySnap: (snap: NetSnap) => void;
  playLocal: () => void;
};

export type NetSnap = {
  phase: Phase;
  players: Player[];
  hostId: string;
  singerId: string | null;
  partnerId: string | null;
  challenge: Challenge | null;
  options: Song[];
  song: Song | null;
  lastScore: number;
  lastHadMic: boolean;
  lastSkip: { fromId: string; toId: string; kind: SkipKind } | null;
  lastGifts: ReceivedGift[];
  lastHearts: number;
  round: number;
  spinning: boolean;
  customSongs: Song[];
  chat: ChatMessage[];
  verseIndex: number;
  verseLines: VerseLine[];
  cookStatus: CookStatus;
  omen: boolean;
  omenSong: Song | null;
  sunoPrompt: string;
};

function otherPlayer(players: Player[], id: string) {
  const rest = players.filter((p) => p.id !== id);
  return rest[Math.floor(Math.random() * rest.length)] ?? null;
}

function pickChallenge(): Challenge {
  return CHALLENGES[Math.floor(Math.random() * CHALLENGES.length)];
}

const initialPlayers = makePlayers();

export const useGame = create<GameState>((set, get) => ({
  phase: "gate",
  players: initialPlayers,
  youId: initialPlayers[0].id,
  mode: "local",
  roomCode: null,
  hostId: null,
  wantHost: false,
  singerId: null,
  partnerId: null,
  challenge: null,
  options: pickThree(CATALOG),
  song: null,
  lastScore: 0,
  lastHadMic: false,
  lastSkip: null,
  lastGifts: [],
  lastHearts: 0,
  lastTake: null,
  round: 1,
  spinning: false,
  customSongs: [],
  chat: [],
  chatOpen: false,
  chatTarget: "all",
  musicGain: 0.78,
  sfxGain: 0.85,
  muted: false,
  verseIndex: 0,
  verseLines: [],
  cookStatus: "idle",
  omen: false,
  omenSong: null,
  sunoPrompt: "",

  enter: () => set({ phase: "profile" }),

  setPlayerName: (id, name) =>
    set({
      players: get().players.map((p) => (p.id === id ? { ...p, name } : p)),
    }),

  setAvatar: (id, url) =>
    set({
      players: get().players.map((p) => (p.id === id ? { ...p, avatarUrl: url } : p)),
    }),

  addPlayer: () => {
    const { players } = get();
    if (players.length >= 8) return;
    set({
      players: [...players, blankPlayer(`Игрок ${players.length + 1}`, players.length)],
    });
  },

  removePlayer: (id) => {
    const { players, youId } = get();
    if (players.length <= 2 || id === youId) return;
    set({ players: players.filter((p) => p.id !== id) });
  },

  toLobby: () => {
    const you = get().players.find((p) => p.id === get().youId);
    if (you && !you.name.trim()) {
      set({
        players: get().players.map((p) =>
          p.id === get().youId ? { ...p, name: "Я" } : p,
        ),
      });
    }
    set({ phase: "lobby" });
  },

  toBring: () => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "toBring" });
      return;
    }
    const players = get().players.map((p) => ({
      ...p,
      name: p.name.trim() || "Без имени",
    }));
    set({ phase: "bring", players });
  },

  toVerse: () => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "toVerse" });
      return;
    }
    const players = get().players.map((p) => ({
      ...p,
      name: p.name.trim() || "Без имени",
    }));
    set({
      phase: "verse",
      players,
      verseIndex: 0,
      verseLines: [],
      cookStatus: "idle",
      omen: false,
      omenSong: null,
      sunoPrompt: "",
    });
  },

  toTable: () => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "toTable" });
      return;
    }
    const players = get().players.map((p) => ({
      ...p,
      name: p.name.trim() || "Без имени",
    }));
    set({ phase: "table", players });
  },

  submitVerse: (text, late) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "verse", text, late });
      return;
    }
    const { players, verseIndex, verseLines } = get();
    const player = players[verseIndex];
    if (!player) return;
    const line: VerseLine = {
      playerId: player.id,
      name: player.name,
      text: text.trim() || "…",
      late,
    };
    const nextLines = [...verseLines, line];
    const nextIndex = verseIndex + 1;
    const nextPlayers = late
      ? players.map((p) =>
          p.id === player.id ? { ...p, notes: Math.max(0, p.notes - LATE_COST) } : p,
        )
      : players;
    if (nextIndex >= nextPlayers.length) {
      set({
        verseLines: nextLines,
        verseIndex: nextIndex,
        players: nextPlayers,
        phase: "table",
        cookStatus: "cooking",
        omen: false,
        omenSong: null,
      });
      return;
    }
    set({
      verseLines: nextLines,
      verseIndex: nextIndex,
      players: nextPlayers,
    });
  },

  failCook: () => set({ cookStatus: "failed" }),

  readyOmen: (song, prompt) => {
    set({
      cookStatus: "ready",
      omenSong: song,
      sunoPrompt: prompt,
    });
    get().tryBeginOmen();
  },

  tryBeginOmen: () => {
    const { phase, spinning, cookStatus, omenSong, omen } = get();
    if (omen) return;
    if (cookStatus !== "ready" || !omenSong) return;
    if (phase !== "table" || spinning) return;
    set({ omen: true, challenge: OMEN_CHALLENGE, partnerId: null });
  },

  startSpin: () => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "spin" });
      return {
        singerId: get().singerId ?? get().youId,
        partnerId: get().partnerId,
        challenge: get().challenge ?? CHALLENGES[0],
      };
    }
    const { players, singerId, omen } = get();
    const candidates = players.filter((p) => p.id !== singerId);
    const pool = candidates.length ? candidates : players;
    const singer = pool[Math.floor(Math.random() * pool.length)];
    const challenge = omen ? OMEN_CHALLENGE : pickChallenge();
    const partner =
      !omen && (challenge.kind === "duet" || challenge.kind === "dedicate")
        ? otherPlayer(players, singer.id)
        : null;
    set({
      spinning: true,
      singerId: singer.id,
      partnerId: partner?.id ?? null,
      challenge,
      lastSkip: null,
    });
    return { singerId: singer.id, partnerId: partner?.id ?? null, challenge };
  },

  finishSpin: () => set({ spinning: false, phase: "reveal" }),

  skipTurn: (toId, kind) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "skip", toId, kind });
      return true;
    }
    if (get().omen) return false;
    const { singerId, players } = get();
    const singer = players.find((p) => p.id === singerId);
    if (!singer || singer.notes < SKIP_COST) return false;
    set({
      players: players.map((p) =>
        p.id === singer.id ? { ...p, notes: p.notes - SKIP_COST } : p,
      ),
      lastSkip: { fromId: singer.id, toId, kind },
      spinning: false,
      phase: "table",
      round: get().round + 1,
      song: null,
    });
    return true;
  },

  spendNotes: (playerId, cost) => {
    const player = get().players.find((p) => p.id === playerId);
    if (!player || cost <= 0) return cost === 0;
    if (player.notes < cost) return false;
    set({
      players: get().players.map((p) =>
        p.id === playerId ? { ...p, notes: p.notes - cost } : p,
      ),
    });
    return true;
  },

  toSongPick: () => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "toSong" });
      return;
    }
    const { omen, omenSong } = get();
    if (omen && omenSong) {
      set({ song: omenSong, phase: "karaoke" });
      return;
    }
    const live = get().customSongs.filter((s) => Boolean(s.audioUrl));
    if (live.length === 1) {
      set({ song: live[0], phase: "karaoke" });
      return;
    }
    if (live.length > 1) {
      set({ phase: "song", options: pickThree(live, get().song?.id, false) });
      return;
    }
    set({ phase: "song", options: pickTableThree([], get().song?.id) });
  },

  rerollSongs: () => {
    const live = get().customSongs.filter((s) => Boolean(s.audioUrl));
    if (live.length) {
      set({ options: pickThree(live, get().song?.id, false) });
      return;
    }
    set({ options: pickTableThree([], get().song?.id) });
  },

  addCustomSong: (song) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "addSong", song: wireSong(song) ?? song });
      return;
    }
    const customSongs = [song, ...get().customSongs.filter((s) => s.id !== song.id)].slice(0, 24);
    set({ customSongs });
  },

  replaceCustomSongs: (songs: Song[]) => {
    if (get().mode === "net") {
      for (const song of songs) {
        if (wireSong(song)?.audioUrl) get().addCustomSong(song);
      }
      return;
    }
    set({ customSongs: songs });
  },

  chooseSong: (song) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "choose", song: wireSong(song) ?? song });
      return;
    }
    set({ song, phase: "karaoke" });
  },

  finishKaraoke: (score, hadMic) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "done", score, hadMic });
      return;
    }
    const { singerId, partnerId, players, omen } = get();
    const share = partnerId ? Math.round(score * 0.55) : score;
    const partnerShare = partnerId ? Math.round(score * 0.45) : 0;
    set({
      lastScore: score,
      lastHadMic: hadMic,
      lastGifts: [],
      lastHearts: 0,
      phase: "result",
      omen: false,
      cookStatus: omen ? "idle" : get().cookStatus,
      omenSong: omen ? null : get().omenSong,
      players: players.map((p) => {
        if (p.id === singerId) return { ...p, score: p.score + share };
        if (p.id === partnerId) return { ...p, score: p.score + partnerShare };
        return p;
      }),
    });
  },

  setLastTake: (blob) => set({ lastTake: blob }),

  sendHeart: (fromId) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "heart" });
      return;
    }
    const { singerId, players } = get();
    if (!singerId || fromId === singerId) return;
    set({
      lastHearts: get().lastHearts + 1,
      players: players.map((p) => (p.id === singerId ? { ...p, hearts: p.hearts + 1 } : p)),
    });
  },

  sendGift: (fromId, kind) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "gift", kind });
      return true;
    }
    const { singerId, players } = get();
    const gift = GIFT_CATALOG.find((g) => g.id === kind);
    const giver = players.find((p) => p.id === fromId);
    if (!gift || !singerId || !giver || giver.id === singerId) return false;
    if (giver.notes < gift.cost) return false;
    set({
      players: players.map((p) => {
        if (p.id === fromId) return { ...p, notes: p.notes - gift.cost };
        if (p.id === singerId) return { ...p, notes: p.notes + gift.cost };
        return p;
      }),
      lastGifts: [...get().lastGifts, { id: uid("g"), kind, fromId }],
    });
    return true;
  },

  sendChat: (text, toId) => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "chat", text, toId });
      return;
    }
    const trimmed = text.trim();
    if (!trimmed) return;
    const msg: ChatMessage = {
      id: uid("m"),
      fromId: get().youId,
      toId,
      text: trimmed.slice(0, 240),
      at: Date.now(),
    };
    set({ chat: [...get().chat, msg].slice(-120) });
  },

  setChatOpen: (open) => set({ chatOpen: open }),
  setChatTarget: (to) => set({ chatTarget: to, chatOpen: true }),

  nextRound: () => {
    if (get().mode === "net" && get().hostId !== get().youId) {
      netSend({ t: "nextRound" });
      return;
    }
    set({
      phase: "table",
      round: get().round + 1,
      song: null,
      lastGifts: [],
      lastHearts: 0,
      lastTake: null,
    });
    get().tryBeginOmen();
  },

  backToLobby: () =>
    set({
      phase: "lobby",
      spinning: false,
      singerId: null,
      partnerId: null,
      challenge: null,
      song: null,
      round: 1,
      lastSkip: null,
      lastGifts: [],
      lastHearts: 0,
      lastTake: null,
      verseIndex: 0,
      verseLines: [],
      cookStatus: "idle",
      omen: false,
      omenSong: null,
      sunoPrompt: "",
      players: get().players.map((p) => ({ ...p, score: 0, hearts: 0, notes: START_NOTES })),
    }),

  setMusicGain: (v) => set({ musicGain: v }),
  setSfxGain: (v) => set({ sfxGain: v }),
  toggleMute: () => set({ muted: !get().muted }),

  playLocal: () => set({ mode: "local", roomCode: null, hostId: null, wantHost: false }),

  createRoom: () => {
    const code = Math.random().toString(36).slice(2, 8);
    set({
      mode: "net",
      roomCode: code,
      wantHost: true,
      hostId: get().youId,
      players: get().players.filter((p) => p.id === get().youId),
      phase: "lobby",
    });
    return code;
  },

  joinRoom: (raw) => {
    const code = raw.trim().toLowerCase().replace(/[^a-z0-9_-]/g, "").slice(0, 16);
    if (!code) return;
    set({
      mode: "net",
      roomCode: code,
      wantHost: false,
      hostId: null,
      players: get().players.filter((p) => p.id === get().youId),
      phase: get().phase === "gate" || get().phase === "profile" ? get().phase : "lobby",
    });
  },

  adoptNet: (selfId, asHost) => {
    const prev = get().players.find((p) => p.id === get().youId);
    const mine: Player = {
      id: selfId,
      name: prev?.name || "я",
      color: PLAYER_COLORS[0],
      score: prev?.score ?? 0,
      avatarUrl: prev?.avatarUrl ?? null,
      notes: prev?.notes ?? START_NOTES,
      hearts: prev?.hearts ?? 0,
    };
    set({
      youId: selfId,
      hostId: asHost ? selfId : get().hostId,
      wantHost: asHost,
      players: [mine],
    });
  },

  applySnap: (snap) => {
    if (get().mode !== "net") return;
    const youId = get().youId;
    set({
      phase: snap.phase,
      players: snap.players.some((p) => p.id === youId)
        ? snap.players
        : [...snap.players, get().players.find((p) => p.id === youId)!].filter(Boolean),
      hostId: snap.hostId,
      singerId: snap.singerId,
      partnerId: snap.partnerId,
      challenge: snap.challenge,
      options: snap.options,
      song: snap.song,
      lastScore: snap.lastScore,
      lastHadMic: snap.lastHadMic,
      lastSkip: snap.lastSkip,
      lastGifts: snap.lastGifts,
      lastHearts: snap.lastHearts,
      round: snap.round,
      spinning: snap.spinning,
      customSongs: snap.customSongs,
      chat: snap.chat,
      verseIndex: snap.verseIndex,
      verseLines: snap.verseLines,
      cookStatus: snap.cookStatus,
      omen: snap.omen,
      omenSong: snap.omenSong,
      sunoPrompt: snap.sunoPrompt,
    });
  },

  rehydrate: () => {
    if (typeof window === "undefined") return;
    try {
      const raw = sessionStorage.getItem("bottle-session");
      if (!raw) return;
      const data = JSON.parse(raw) as Partial<GameState>;
      if (!data.phase || data.phase === "gate") return;
      const phase = data.phase === "karaoke" ? "song" : data.phase;
      set({
        phase,
        players:
          Array.isArray(data.players) && data.players.length >= 2 ? data.players : get().players,
        youId: typeof data.youId === "string" ? data.youId : get().youId,
        round: data.round ?? 1,
        chat: data.chat ?? [],
        customSongs: data.customSongs ?? [],
        musicGain: data.musicGain ?? get().musicGain,
        sfxGain: data.sfxGain ?? get().sfxGain,
        muted: Boolean(data.muted),
        singerId: data.singerId ?? null,
        partnerId: data.partnerId ?? null,
        challenge: data.challenge ?? null,
        song: data.song ?? null,
        lastScore: data.lastScore ?? 0,
        lastHadMic: Boolean(data.lastHadMic),
        lastSkip: data.lastSkip ?? null,
        lastGifts: data.lastGifts ?? [],
        lastHearts: data.lastHearts ?? 0,
        options: data.options ?? get().options,
        verseIndex: data.verseIndex ?? 0,
        verseLines: data.verseLines ?? [],
        cookStatus: data.cookStatus === "cooking" ? "idle" : (data.cookStatus ?? "idle"),
        omen: Boolean(data.omen),
        omenSong: data.omenSong ?? null,
        sunoPrompt: data.sunoPrompt ?? "",
        spinning: false,
      });
    } catch {
      /* ignore bad session */
    }
  },
}));

function stripDeadAudio(song: Song | null | undefined): Song | null {
  if (!song) return null;
  if (song.audioUrl && song.audioUrl.startsWith("blob:")) return { ...song, audioUrl: undefined };
  return song;
}

if (typeof window !== "undefined") {
  useGame.subscribe((s) => {
    try {
      if (s.phase === "gate" || s.mode === "net") {
        if (s.phase === "gate") sessionStorage.removeItem("bottle-session");
        return;
      }
      sessionStorage.setItem(
        "bottle-session",
        JSON.stringify({
          phase: s.phase === "karaoke" ? "song" : s.phase,
          players: s.players,
          youId: s.youId,
          round: s.round,
          chat: s.chat,
          customSongs: s.customSongs.map((song) => stripDeadAudio(song) ?? song),
          musicGain: s.musicGain,
          sfxGain: s.sfxGain,
          muted: s.muted,
          singerId: s.singerId,
          partnerId: s.partnerId,
          challenge: s.challenge,
          song: stripDeadAudio(s.song),
          lastScore: s.lastScore,
          lastHadMic: s.lastHadMic,
          lastSkip: s.lastSkip,
          lastGifts: s.lastGifts,
          lastHearts: s.lastHearts,
          options: s.options.map((song) => stripDeadAudio(song) ?? song),
          verseIndex: s.verseIndex,
          verseLines: s.verseLines,
          cookStatus: s.cookStatus === "cooking" ? "idle" : s.cookStatus,
          omen: s.omen,
          omenSong: stripDeadAudio(s.omenSong),
          sunoPrompt: s.sunoPrompt,
        }),
      );
    } catch {
      /* quota */
    }
  });
}

export function playerById(players: Player[], id: string | null) {
  if (!id) return null;
  return players.find((p) => p.id === id) ?? null;
}

export function tableIsHost(s?: { mode: "local" | "net"; hostId: string | null; youId: string }) {
  const st = s ?? useGame.getState();
  return st.mode !== "net" || st.hostId === st.youId;
}

export function wireSong(song: Song | null): Song | null {
  if (!song) return null;
  const http = (u?: string) => (u && !u.startsWith("blob:") ? u : undefined);
  return {
    ...song,
    audioUrl: http(song.audioUrl),
    takeUrl: http(song.takeUrl),
    coverUrl: http(song.coverUrl),
    hasTake: Boolean(http(song.takeUrl)),
    hasCover: Boolean(http(song.coverUrl)),
  };
}

