import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
import { toast } from "sonner";
import { useP2PRoom, type P2PRoomHandle } from "@/lib/multiplayer";
import { bindNetSend } from "@/lib/net-bus";
import {
  START_NOTES,
  tableIsHost,
  useGame,
  wireSong,
  type GiftKind,
  type NetSnap,
  type SkipKind,
} from "@/lib/store";
import { PLAYER_COLORS } from "@/lib/store";
import type { Song } from "@/lib/songs";

type NetAct =
  | { t: "join"; name: string; avatarUrl: string | null }
  | { t: "spin" }
  | { t: "skip"; toId: string; kind: SkipKind }
  | { t: "heart" }
  | { t: "gift"; kind: GiftKind }
  | { t: "chat"; text: string; toId: "all" | string }
  | { t: "verse"; text: string; late: boolean }
  | { t: "choose"; song: Song }
  | { t: "done"; score: number; hadMic: boolean }
  | { t: "toSong" }
  | { t: "nextRound" }
  | { t: "toVerse" }
  | { t: "toBring" }
  | { t: "toTable" }
  | { t: "addSong"; song: Song };

const NetCtx = createContext<{
  sendAct: (act: NetAct) => void;
  setLocalAudio: (stream: MediaStream | null) => void;
  remoteStreams: Record<string, MediaStream>;
  peers: P2PRoomHandle["peers"];
  joined: boolean;
} | null>(null);

export function useNet() {
  return useContext(NetCtx);
}

function takeSnap(): NetSnap {
  const s = useGame.getState();
  return {
    phase: s.phase,
    players: s.players,
    hostId: s.hostId ?? s.youId,
    singerId: s.singerId,
    partnerId: s.partnerId,
    challenge: s.challenge,
    options: s.options.map((song) => wireSong(song) ?? song),
    song: wireSong(s.song),
    lastScore: s.lastScore,
    lastHadMic: s.lastHadMic,
    lastSkip: s.lastSkip,
    lastGifts: s.lastGifts,
    lastHearts: s.lastHearts,
    round: s.round,
    spinning: s.spinning,
    customSongs: s.customSongs.map((song) => wireSong(song) ?? song).filter((song) => song.audioUrl),
    chat: s.chat.slice(-40),
    verseIndex: s.verseIndex,
    verseLines: s.verseLines,
    cookStatus: s.cookStatus,
    omen: s.omen,
    omenSong: wireSong(s.omenSong),
    sunoPrompt: s.sunoPrompt,
  };
}

function applyAct(from: string, act: NetAct) {
  const g = useGame.getState();
  switch (act.t) {
    case "join": {
      if (g.players.some((p) => p.id === from)) {
        useGame.setState({
          players: g.players.map((p) =>
            p.id === from ? { ...p, name: act.name.slice(0, 16) || p.name, avatarUrl: act.avatarUrl } : p,
          ),
        });
        return;
      }
      if (g.players.length >= 8) return;
      useGame.setState({
        players: [
          ...g.players,
          {
            id: from,
            name: act.name.slice(0, 16) || "гость",
            color: PLAYER_COLORS[g.players.length % PLAYER_COLORS.length],
            score: 0,
            avatarUrl: act.avatarUrl,
            notes: START_NOTES,
            hearts: 0,
          },
        ],
      });
      return;
    }
    case "spin":
      if (!g.spinning && (g.phase === "table" || g.phase === "lobby")) g.startSpin();
      return;
    case "skip":
      g.skipTurn(act.toId, act.kind);
      return;
    case "heart":
      g.sendHeart(from);
      return;
    case "gift":
      g.sendGift(from, act.kind);
      return;
    case "chat": {
      const trimmed = act.text.trim();
      if (!trimmed) return;
      useGame.setState({
        chat: [
          ...g.chat,
          { id: `m-${Date.now()}`, fromId: from, toId: act.toId, text: trimmed.slice(0, 280), at: Date.now() },
        ],
      });
      return;
    }
    case "verse":
      g.submitVerse(act.text, act.late);
      return;
    case "choose":
      g.chooseSong(act.song);
      return;
    case "done":
      g.finishKaraoke(act.score, act.hadMic);
      return;
    case "toSong":
      g.toSongPick();
      return;
    case "nextRound":
      g.nextRound();
      return;
    case "toVerse":
      g.toVerse();
      return;
    case "toBring":
      g.toBring();
      return;
    case "toTable":
      g.toTable();
      return;
    case "addSong":
      g.addCustomSong(act.song);
      return;
    default:
      return;
  }
}

export function NetSync({ room, children }: { room: string; children: ReactNode }) {
  const name = useGame((s) => s.players.find((p) => p.id === s.youId)?.name ?? "я");
  const wantHost = useGame((s) => s.wantHost);
  const p2p = useP2PRoom({ room: `b${room}`.slice(0, 64), name });
  const adopted = useRef(false);
  const lastFp = useRef("");

  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    useGame.getState().adoptNet(p2p.selfId, wantHost);
  }, [p2p.selfId, wantHost]);

  useEffect(() => {
    return p2p.onMessage((from, data) => {
      if (!data || typeof data !== "object") return;
      const msg = data as { t?: string; snap?: NetSnap } | NetAct;
      const host = tableIsHost();
      if ("t" in msg && msg.t === "snap" && "snap" in msg && msg.snap && !host) {
        useGame.getState().applySnap(msg.snap);
        return;
      }
      if (!host) return;
      if ("t" in msg && msg.t && msg.t !== "snap") applyAct(from, msg as NetAct);
    });
  }, [p2p.onMessage]);

  useEffect(() => {
    if (!p2p.joined || wantHost) return;
    const hello = () => {
      const you = useGame.getState().players.find((p) => p.id === useGame.getState().youId);
      p2p.send({
        t: "join",
        name: you?.name ?? name,
        avatarUrl: you?.avatarUrl ?? null,
      } satisfies NetAct);
    };
    hello();
    const id = window.setInterval(hello, 2500);
    return () => clearInterval(id);
  }, [p2p.joined, p2p.send, wantHost, name]);

  useEffect(() => {
    if (!wantHost) return;
    const alive = new Set([p2p.selfId, ...p2p.peers.map((p) => p.id)]);
    const g = useGame.getState();
    const next = g.players.filter((p) => p.id === g.youId || alive.has(p.id));
    if (next.length !== g.players.length) useGame.setState({ players: next });
  }, [p2p.peers, p2p.selfId, wantHost]);

  useEffect(() => {
    if (!wantHost) return;
    const unsub = useGame.subscribe((s) => {
      if (s.mode !== "net" || s.hostId !== s.youId) return;
      const snap = takeSnap();
      const fp = JSON.stringify(snap);
      if (fp === lastFp.current) return;
      lastFp.current = fp;
      p2p.send({ t: "snap", snap });
    });
    return unsub;
  }, [p2p.send, wantHost]);

  function sendAct(act: NetAct) {
    if (tableIsHost()) {
      applyAct(useGame.getState().youId, act);
      return;
    }
    p2p.send(act);
  }

  useEffect(() => {
    bindNetSend((act) => sendAct(act as NetAct));
    return () => bindNetSend(null);
  }, [p2p.send, wantHost, p2p.selfId]);

  return (
    <NetCtx.Provider
      value={{
        sendAct,
        setLocalAudio: p2p.setLocalAudio,
        remoteStreams: p2p.remoteStreams,
        peers: p2p.peers,
        joined: p2p.joined,
      }}
    >
      {Object.entries(p2p.remoteStreams).map(([id, stream]) => (
        <audio
          key={id}
          autoPlay
          playsInline
          ref={(el) => {
            if (el && el.srcObject !== stream) el.srcObject = stream;
          }}
        />
      ))}
      {children}
    </NetCtx.Provider>
  );
}
