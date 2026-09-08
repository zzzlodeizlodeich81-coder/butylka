/**
 * React binding for P2PRoom. Identity and room id are captured once on mount
 * (useState initializers) so re-renders never tear down the mesh: the P2PRoom
 * instance lives exactly as long as the component that mounted it, and
 * changing `room`/`name` requires a remount (key the component on them).
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { P2PRoom, type PeerInfo, type PeerRow, type RoomAct } from "./p2p";

export interface UseP2PRoomOptions {
  room?: string;
  name?: string;
  wantHost?: boolean;
}

export interface P2PRoomHandle {
  selfId: string;
  room: string;
  peers: PeerInfo[];
  roster: PeerRow[];
  hostId: string | null;
  joined: boolean;
  broadcast: (data: unknown) => void;
  send: (data: unknown, peerId?: string) => void;
  postAct: (act: unknown) => void;
  postSnap: (snap: unknown, hostId: string) => void;
  onMessage: (
    fn: (from: string, data: unknown, channel: "state" | "reliable") => void,
  ) => () => void;
  onAct: (fn: (from: string, act: unknown) => void) => () => void;
  onSnap: (fn: (snap: unknown) => void) => () => void;
  setLocalAudio: (stream: MediaStream | null) => void;
  remoteStreams: Record<string, MediaStream>;
}

function defaultRoom(): string {
  if (typeof window === "undefined") return "room-ssr";
  return `room-${window.location.hostname.split(".")[0]}`.slice(0, 64);
}

function readSavedSelfId(room: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(sessionStorage.getItem("bottle-net") || "null") as {
      roomCode?: string;
      selfId?: string;
    } | null;
    if (!saved?.selfId || !saved.roomCode) return null;
    if (`b${saved.roomCode}` !== room && saved.roomCode !== room) return null;
    if (!/^p-[a-z0-9]+$/.test(saved.selfId)) return null;
    return saved.selfId;
  } catch {
    return null;
  }
}

function writeSavedSelfId(selfId: string) {
  if (typeof window === "undefined") return;
  try {
    const prev = JSON.parse(sessionStorage.getItem("bottle-net") || "{}") as Record<string, unknown>;
    sessionStorage.setItem("bottle-net", JSON.stringify({ ...prev, selfId }));
  } catch {
    /* ignore */
  }
}

export function useP2PRoom(options: UseP2PRoomOptions = {}): P2PRoomHandle {
  const [room] = useState(() => options.room ?? defaultRoom());
  const [selfId] = useState(() => {
    const saved = readSavedSelfId(options.room ?? defaultRoom());
    if (saved) return saved;
    const id = `p-${Math.random().toString(36).slice(2, 10)}`;
    writeSavedSelfId(id);
    return id;
  });
  const [name] = useState(() => options.name ?? selfId);
  const [wantHost] = useState(() => Boolean(options.wantHost));
  const [peers, setPeers] = useState<PeerInfo[]>([]);
  const [roster, setRoster] = useState<PeerRow[]>([]);
  const [hostId, setHostId] = useState<string | null>(wantHost ? selfId : null);
  const [joined, setJoined] = useState(false);
  const [remoteStreams, setRemoteStreams] = useState<Record<string, MediaStream>>({});
  const roomRef = useRef<P2PRoom | null>(null);
  const listeners = useRef(
    new Set<(from: string, data: unknown, channel: "state" | "reliable") => void>(),
  );
  const actListeners = useRef(new Set<(from: string, act: unknown) => void>());
  const snapListeners = useRef(new Set<(snap: unknown) => void>());
  const seenActs = useRef(new Set<number>());
  const lastSnapFp = useRef("");

  useEffect(() => {
    const p2p = new P2PRoom({
      room,
      selfId,
      name,
      wantHost,
      onPeersChanged: setPeers,
      onRemoteStream: (peerId, stream) => {
        setRemoteStreams((prev) => {
          if (!stream) {
            const next = { ...prev };
            delete next[peerId];
            return next;
          }
          return { ...prev, [peerId]: stream };
        });
      },
      onMessage: (from, data, channel) => {
        for (const fn of listeners.current) fn(from, data, channel);
      },
      onConnected: () => setJoined(true),
      onRoomState: (state) => {
        setRoster(state.peers);
        if (state.hostId) setHostId(state.hostId);
        if (state.snap) {
          const fp = JSON.stringify(state.snap);
          if (fp !== lastSnapFp.current) {
            lastSnapFp.current = fp;
            for (const fn of snapListeners.current) fn(state.snap);
          }
        }
        for (const act of state.acts as RoomAct[]) {
          if (seenActs.current.has(act.id)) continue;
          seenActs.current.add(act.id);
          if (seenActs.current.size > 400) {
            seenActs.current = new Set([...seenActs.current].slice(-200));
          }
          for (const fn of actListeners.current) fn(act.from, act.act);
        }
      },
    });
    roomRef.current = p2p;
    void p2p.join();
    return () => {
      roomRef.current = null;
      p2p.close();
    };
  }, [room, selfId, name, wantHost]);

  const broadcast = useCallback((data: unknown) => roomRef.current?.broadcast(data), []);
  const send = useCallback(
    (data: unknown, peerId?: string) => roomRef.current?.send(data, peerId),
    [],
  );
  const postAct = useCallback((act: unknown) => roomRef.current?.postAct(act), []);
  const postSnap = useCallback(
    (snap: unknown, nextHost: string) => roomRef.current?.postSnap(snap, nextHost),
    [],
  );
  const setLocalAudio = useCallback((stream: MediaStream | null) => {
    roomRef.current?.setLocalAudio(stream);
  }, []);
  const onMessage = useCallback(
    (fn: (from: string, data: unknown, channel: "state" | "reliable") => void) => {
      listeners.current.add(fn);
      return () => {
        listeners.current.delete(fn);
      };
    },
    [],
  );
  const onAct = useCallback((fn: (from: string, act: unknown) => void) => {
    actListeners.current.add(fn);
    return () => {
      actListeners.current.delete(fn);
    };
  }, []);
  const onSnap = useCallback((fn: (snap: unknown) => void) => {
    snapListeners.current.add(fn);
    return () => {
      snapListeners.current.delete(fn);
    };
  }, []);

  return {
    selfId,
    room,
    peers,
    roster,
    hostId,
    joined,
    broadcast,
    send,
    postAct,
    postSnap,
    onMessage,
    onAct,
    onSnap,
    setLocalAudio,
    remoteStreams,
  };
}
