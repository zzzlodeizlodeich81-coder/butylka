import { createContext, useContext, useEffect, useRef, type ReactNode } from "react";
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
  roster: P2PRoomHandle["roster"];
  joined: boolean;
  hostId: string | null;
  selfId: string;
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
    options: s.phase === "song" ? s.options.map((song) => wireSong(song) ?? song) : [],
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

function isAct(data: unknown): data is NetAct {
  return Boolean(data && typeof data === "object" && "t" in data && (data as { t?: string }).t && (data as { t: string }).t !== "snap");
}

export function NetSync({ room, children }: { room: string; children: ReactNode }) {
  const name = useGame((s) => s.players.find((p) => p.id === s.youId)?.name ?? "я");
  const wantHost = useGame((s) => s.wantHost);
  const p2p = useP2PRoom({ room: `b${room}`.slice(0, 64), name, wantHost });
  const adopted = useRef(false);
  const lastFp = useRef("");
  const lastJoin = useRef("");

  useEffect(() => {
    if (adopted.current) return;
    adopted.current = true;
    useGame.getState().adoptNet(p2p.selfId, wantHost);
  }, [p2p.selfId, wantHost]);

  // Sticky host: the person who created the table stays host. Server may
  // confirm a hostId (first arriver / surviving host). Never elect by min(id)
  // — that handed the table to a ghost peer and made «колода» a no-op.
  useEffect(() => {
    const g = useGame.getState();
    if (g.mode !== "net") return;
    if (g.wantHost) {
      if (g.hostId !== g.youId) useGame.setState({ hostId: g.youId });
      return;
    }
    if (p2p.hostId && p2p.hostId !== g.hostId) {
      useGame.setState({ hostId: p2p.hostId, wantHost: p2p.hostId === p2p.selfId });
    }
  }, [p2p.hostId, p2p.selfId, wantHost]);

  // Seats at the table = HTTP/MQTT roster, not leftover local dummy names.
  useEffect(() => {
    const g = useGame.getState();
    if (g.mode !== "net") return;
    const mine = g.players.find((p) => p.id === g.youId);
    const seated = p2p.roster.length ? p2p.roster : [{ id: p2p.selfId, name }];
    const next = [];
    const seen = new Set<string>();
    const self = mine ?? {
      id: p2p.selfId,
      name: name.slice(0, 16) || "я",
      color: PLAYER_COLORS[0],
      score: 0,
      avatarUrl: null,
      notes: START_NOTES,
      hearts: 0,
    };
    next.push({ ...self, id: p2p.selfId });
    seen.add(p2p.selfId);
    for (const peer of seated) {
      if (seen.has(peer.id)) continue;
      seen.add(peer.id);
      const prev = g.players.find((p) => p.id === peer.id);
      next.push(
        prev
          ? { ...prev, name: peer.name || prev.name }
          : {
              id: peer.id,
              name: (peer.name || "гость").slice(0, 16),
              color: PLAYER_COLORS[next.length % PLAYER_COLORS.length],
              score: 0,
              avatarUrl: null,
              notes: START_NOTES,
              hearts: 0,
            },
      );
    }
    const same =
      next.length === g.players.length && next.every((p, i) => p.id === g.players[i]?.id && p.name === g.players[i]?.name);
    if (!same) useGame.setState({ players: next });
  }, [p2p.roster, p2p.selfId, name]);

  useEffect(() => {
    const seen = new Set<string>();
    const handleAct = (from: string, act: unknown) => {
      if (!tableIsHost() || !isAct(act)) return;
      const fp = `${from}:${act.t}:${JSON.stringify(act)}`;
      if (seen.has(fp)) return;
      seen.add(fp);
      if (seen.size > 300) seen.clear();
      applyAct(from, act);
    };
    const offMsg = p2p.onMessage((from, data) => {
      if (!data || typeof data !== "object") return;
      const msg = data as { t?: string; snap?: NetSnap } | NetAct;
      if ("t" in msg && msg.t === "snap" && "snap" in msg && msg.snap && !tableIsHost()) {
        useGame.getState().applySnap(msg.snap);
        return;
      }
      handleAct(from, msg);
    });
    const offAct = p2p.onAct((from, act) => handleAct(from, act));
    const offSnap = p2p.onSnap((snap) => {
      if (tableIsHost()) return;
      if (snap && typeof snap === "object") useGame.getState().applySnap(snap as NetSnap);
    });
    return () => {
      offMsg();
      offAct();
      offSnap();
    };
  }, [p2p.onMessage, p2p.onAct, p2p.onSnap]);

  useEffect(() => {
    if (!p2p.joined || wantHost) return;
    const hello = () => {
      const you = useGame.getState().players.find((p) => p.id === useGame.getState().youId);
      const act: NetAct = {
        t: "join",
        name: you?.name ?? name,
        avatarUrl: you?.avatarUrl ?? null,
      };
      const fp = `${act.name}|${act.avatarUrl ?? ""}`;
      if (fp !== lastJoin.current) {
        lastJoin.current = fp;
        p2p.send(act);
        p2p.postAct(act);
      } else {
        p2p.send(act);
        p2p.postAct(act);
      }
    };
    hello();
    const id = window.setInterval(hello, 4000);
    return () => clearInterval(id);
  }, [p2p.joined, p2p.send, p2p.postAct, wantHost, name]);

  useEffect(() => {
    if (!wantHost) return;
    const unsub = useGame.subscribe((s) => {
      if (s.mode !== "net" || s.hostId !== s.youId) return;
      const snap = takeSnap();
      const fp = JSON.stringify(snap);
      if (fp === lastFp.current) return;
      lastFp.current = fp;
      p2p.send({ t: "snap", snap });
      p2p.postSnap(snap, s.youId);
    });
    return unsub;
  }, [p2p.send, p2p.postSnap, wantHost]);

  function sendAct(act: NetAct) {
    if (tableIsHost()) {
      applyAct(useGame.getState().youId, act);
      return;
    }
    p2p.send(act);
    p2p.postAct(act);
  }

  useEffect(() => {
    bindNetSend((act) => sendAct(act as NetAct));
    return () => bindNetSend(null);
  }, [p2p.send, p2p.postAct, wantHost, p2p.selfId]);

  return (
    <NetCtx.Provider
      value={{
        sendAct,
        setLocalAudio: p2p.setLocalAudio,
        remoteStreams: p2p.remoteStreams,
        peers: p2p.peers,
        roster: p2p.roster,
        joined: p2p.joined,
        hostId: p2p.hostId,
        selfId: p2p.selfId,
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
