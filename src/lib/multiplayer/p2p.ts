import { MqttSignaling } from "./mqtt-signal";

export type SignalKind = "offer" | "answer" | "ice";

export interface PeerRow {
  id: string;
  name: string;
}
export interface SignalRow {
  id: number;
  from: string;
  kind: SignalKind;
  payload: unknown;
}
export interface RoomAct {
  id: number;
  from: string;
  act: unknown;
}
export interface RtcPollResponse {
  peers: PeerRow[];
  signals: SignalRow[];
  hostId?: string | null;
  snap?: unknown | null;
  acts?: RoomAct[];
}

export interface RoomState {
  peers: PeerRow[];
  hostId: string | null;
  snap: unknown | null;
  acts: RoomAct[];
}

export interface PeerInfo {
  id: string;
  name: string;
  connectionState: RTCPeerConnectionState;
  /** Selected local ICE candidate type: host | srflx | prflx | relay. */
  candidateType: string | null;
  /** Data-channel ping RTT (ms), measured every 2s once connected. */
  rttMs: number | null;
}

export interface P2PRoomOptions {
  room: string;
  selfId: string;
  name?: string;
  wantHost?: boolean;
  /** Defaults to VITE_STUN_URLS (comma-separated) or Google public STUN. */
  iceServers?: RTCIceServer[];
  onPeersChanged?: (peers: PeerInfo[]) => void;
  /** Fires for both the unreliable "state" and reliable "reliable" channels. */
  onMessage?: (from: string, data: unknown, channel: "state" | "reliable") => void;
  /** Fires once, on the first successful signaling poll (registration). */
  onConnected?: () => void;
  onRemoteStream?: (peerId: string, stream: MediaStream | null) => void;
  onRoomState?: (state: RoomState) => void;
}

interface PeerSlot {
  pc: RTCPeerConnection;
  state?: RTCDataChannel;
  reliable?: RTCDataChannel;
  makingOffer: boolean;
  ignoreOffer: boolean;
  pendingCandidates: RTCIceCandidateInit[];
  lastProgressAt: number;
  recoveryAttempts: number;
  terminal?: boolean;
  recreatedForOffer?: boolean;
  info: PeerInfo;
  pingSentAt?: number;
}

const FAST_POLL_MS = 400;
const IDLE_POLL_MS = 1200;
const PING_INTERVAL_MS = 2000;
const STALL_MS = 10_000;
const MAX_RECOVERY_ATTEMPTS = 3;
const SIGNAL_RETRY_DELAYS_MS = [250, 750];
const MQTT_TIMEOUT_MS = 6000;

export function defaultIceServers(): RTCIceServer[] {
  const urls = (import.meta.env.VITE_STUN_URLS as string | undefined)
    ?.split(",")
    .map((u) => u.trim())
    .filter(Boolean);
  return [
    {
      urls: urls?.length ? urls : ["stun:stun.l.google.com:19302", "stun:stun.cloudflare.com:3478"],
    },
  ];
}

function mergePeers(a: PeerRow[], b: PeerRow[]): PeerRow[] {
  const map = new Map<string, string>();
  for (const p of [...a, ...b]) map.set(p.id, p.name || map.get(p.id) || p.id);
  return [...map.entries()].map(([id, name]) => ({ id, name }));
}

export class P2PRoom {
  private readonly opts: P2PRoomOptions;
  private readonly peers = new Map<string, PeerSlot>();
  private readonly signalQueues = new Map<string, Promise<void>>();
  private cursor = 0;
  private actCursor = 0;
  private pollTimer: ReturnType<typeof setTimeout> | null = null;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private closed = false;
  private everPolled = false;
  private lastPeersFingerprint = "";
  private localStream: MediaStream | null = null;
  private mqtt: MqttSignaling | null = null;
  private mqttReady = false;
  private lastRoomFp = "";
  private lastHttpPeers: PeerRow[] = [];
  private lastMqttPeers: PeerRow[] = [];

  constructor(opts: P2PRoomOptions) {
    this.opts = opts;
  }

  /**
   * HTTP is the source of truth (shared Neon on deploy). MQTT is a parallel
   * backup so two devices still meet if a serverless instance has no shared DB.
   * Never wait on MQTT before the first HTTP poll — phones often block the WS.
   */
  async join(): Promise<void> {
    try {
      await this.pollOnceHttp();
    } catch {
      /* first poll can fail transiently */
    }
    void this.bootMqtt();
    if (this.closed) return;
    this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
    this.pingTimer = setInterval(() => {
      this.pingAll();
      this.watchdog();
    }, PING_INTERVAL_MS);
  }

  close(): void {
    this.closed = true;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    if (this.pingTimer) clearInterval(this.pingTimer);
    for (const slot of this.peers.values()) slot.pc.close();
    this.peers.clear();
    void fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ op: "leave", room: this.opts.room, peer: this.opts.selfId }),
      keepalive: true,
    }).catch(() => {});
    this.mqtt?.close();
    this.mqtt = null;
  }

  broadcast(data: unknown): void {
    const wire = JSON.stringify({ t: "d", d: data });
    for (const slot of this.peers.values()) {
      if (slot.state?.readyState === "open") slot.state.send(wire);
    }
  }

  send(data: unknown, peerId?: string): void {
    const wire = JSON.stringify({ t: "d", d: data });
    const targets = peerId ? [this.peers.get(peerId)] : [...this.peers.values()];
    for (const slot of targets) {
      if (slot?.reliable?.readyState === "open") slot.reliable.send(wire);
    }
  }

  postAct(act: unknown): void {
    try {
      this.mqtt?.sendAct(act);
    } catch {
      /* mqtt optional */
    }
    const body = { op: "act", room: this.opts.room, from: this.opts.selfId, act };
    void fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  postSnap(snap: unknown, hostId: string): void {
    try {
      this.mqtt?.sendSnap(snap, hostId);
    } catch {
      /* mqtt optional */
    }
    const body = {
      op: "snap",
      room: this.opts.room,
      from: this.opts.selfId,
      hostId,
      snap,
    };
    void fetch("/api/rtc", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    }).catch(() => {});
  }

  peerList(): PeerInfo[] {
    return [...this.peers.values()].map((s) => ({ ...s.info }));
  }

  setLocalAudio(stream: MediaStream | null): void {
    this.localStream = stream;
    for (const slot of this.peers.values()) this.syncAudio(slot);
  }

  private async bootMqtt(): Promise<void> {
    try {
      await this.ensureMqtt();
      this.mqttReady = true;
      await this.pollMqtt();
    } catch {
      this.mqttReady = false;
      if (!this.closed) {
        window.setTimeout(() => {
          if (!this.closed && !this.mqttReady) void this.bootMqtt();
        }, 2500);
      }
    }
  }

  private schedulePoll(delay: number): void {
    if (this.closed) return;
    if (this.pollTimer) clearTimeout(this.pollTimer);
    this.pollTimer = setTimeout(() => void this.poll(), delay);
  }

  private anyPairConnecting(): boolean {
    for (const s of this.peers.values()) {
      if (s.terminal) continue;
      if (s.info.connectionState !== "connected") return true;
    }
    return false;
  }

  private async ensureMqtt(): Promise<MqttSignaling> {
    if (this.mqtt) return this.mqtt;
    const bus = new MqttSignaling({
      room: this.opts.room,
      selfId: this.opts.selfId,
      name: this.opts.name ?? "",
      wantHost: this.opts.wantHost,
    });
    bus.onChange = () => {
      if (this.closed) return;
      void this.pollMqtt();
    };
    const ok = await Promise.race([
      bus.connect().then(() => true),
      new Promise<boolean>((resolve) => setTimeout(() => resolve(false), MQTT_TIMEOUT_MS)),
    ]);
    if (!ok) {
      bus.close();
      throw new Error("mqtt timeout");
    }
    this.mqtt = bus;
    return bus;
  }

  private emitRoom(peers: PeerRow[], extra: { hostId?: string | null; snap?: unknown | null; acts?: RoomAct[] }) {
    const state: RoomState = {
      peers,
      hostId: extra.hostId ?? null,
      snap: extra.snap ?? null,
      acts: extra.acts ?? [],
    };
    const fp = JSON.stringify({
      peers: state.peers.map((p) => [p.id, p.name]),
      hostId: state.hostId,
      snap: state.snap,
      acts: state.acts.map((a) => a.id),
    });
    if (fp === this.lastRoomFp && state.acts.length === 0) return;
    this.lastRoomFp = fp;
    this.opts.onRoomState?.(state);
  }

  private async pollMqtt(): Promise<void> {
    if (!this.mqtt || this.closed) return;
    const body = this.mqtt.snapshot();
    this.lastMqttPeers = body.peers;
    if (!this.everPolled) {
      this.everPolled = true;
      this.opts.onConnected?.();
    }
    const peers = mergePeers(this.lastHttpPeers, body.peers);
    this.reconcileRoster(peers);
    const roster = new Set(peers.map((p) => p.id));
    for (const sig of body.signals) {
      this.cursor = Math.max(this.cursor, sig.id);
      await this.onSignal(sig.from, sig.kind, sig.payload, roster);
      if (this.closed) return;
    }
    this.emitRoom(peers, { hostId: body.hostId, snap: body.snap, acts: body.acts });
  }

  private async pollOnceHttp(): Promise<void> {
    const params = new URLSearchParams({
      room: this.opts.room,
      peer: this.opts.selfId,
      name: this.opts.name ?? "",
      since: String(this.cursor),
      actSince: String(this.actCursor),
      host: this.opts.wantHost ? "1" : "0",
    });
    const res = await fetch(`/api/rtc?${params}`);
    if (this.closed) return;
    if (!res.ok) {
      if (!this.everPolled) {
        this.everPolled = true;
        this.opts.onConnected?.();
      }
      return;
    }
    const body = (await res.json()) as RtcPollResponse;
    if (this.closed) return;
    if (!this.everPolled) {
      this.everPolled = true;
      this.opts.onConnected?.();
    }
    this.lastHttpPeers = body.peers;
    const peers = mergePeers(body.peers, this.lastMqttPeers);
    this.reconcileRoster(peers);
    const roster = new Set(peers.map((p) => p.id));
    for (const sig of body.signals) {
      this.cursor = Math.max(this.cursor, sig.id);
      await this.onSignal(sig.from, sig.kind, sig.payload, roster);
      if (this.closed) return;
    }
    const acts = body.acts ?? [];
    for (const a of acts) this.actCursor = Math.max(this.actCursor, a.id);
    this.emitRoom(peers, { hostId: body.hostId, snap: body.snap, acts });
  }

  private async poll(): Promise<void> {
    if (this.closed) return;
    try {
      await this.pollOnceHttp();
    } catch {
      /* retry next tick; MQTT may still carry the table */
    }
    if (this.mqttReady) {
      try {
        await this.pollMqtt();
      } catch {
        /* keep http */
      }
    } else if (!this.mqtt) {
      void this.bootMqtt();
    }
    this.schedulePoll(this.anyPairConnecting() ? FAST_POLL_MS : IDLE_POLL_MS);
  }

  private reconcileRoster(peers: { id: string; name: string }[]): void {
    const alive = new Set(peers.map((p) => p.id));
    for (const p of peers) {
      if (p.id === this.opts.selfId) continue;
      const existing = this.peers.get(p.id);
      if (existing) {
        existing.info.name = p.name;
      } else {
        this.connectTo(p.id, p.name, this.opts.selfId > p.id);
      }
    }
    for (const [id, slot] of this.peers) {
      if (!alive.has(id)) {
        slot.pc.close();
        this.peers.delete(id);
      }
    }
    this.emitPeers();
  }

  private connectTo(peerId: string, name: string, initiator: boolean): PeerSlot | null {
    if (this.closed) return null;
    const pc = new RTCPeerConnection({
      iceServers: this.opts.iceServers ?? defaultIceServers(),
    });
    const slot: PeerSlot = {
      pc,
      makingOffer: false,
      ignoreOffer: false,
      pendingCandidates: [],
      lastProgressAt: Date.now(),
      recoveryAttempts: 0,
      info: {
        id: peerId,
        name,
        connectionState: pc.connectionState,
        candidateType: null,
        rttMs: null,
      },
    };
    this.peers.set(peerId, slot);

    pc.ontrack = (e) => {
      const stream = e.streams[0] ?? new MediaStream(e.track ? [e.track] : []);
      this.opts.onRemoteStream?.(peerId, stream);
      e.track?.addEventListener("ended", () => this.opts.onRemoteStream?.(peerId, null));
    };
    pc.onicecandidate = (e) => {
      if (e.candidate) void this.sendSignal(peerId, "ice", e.candidate.toJSON());
    };
    pc.onconnectionstatechange = () => {
      slot.info.connectionState = pc.connectionState;
      if (pc.connectionState === "connecting" || pc.connectionState === "connected") {
        slot.lastProgressAt = Date.now();
      }
      if (pc.connectionState === "connected") {
        slot.recoveryAttempts = 0;
        slot.terminal = false;
        void this.readCandidateType(slot);
      }
      this.emitPeers();
      if (pc.connectionState === "failed") {
        pc.restartIce();
      }
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        this.schedulePoll(FAST_POLL_MS);
      }
    };
    pc.onnegotiationneeded = async () => {
      try {
        slot.makingOffer = true;
        await pc.setLocalDescription();
        await this.sendSignal(peerId, "offer", pc.localDescription!.toJSON());
      } catch {
        /* retried on the next negotiationneeded */
      } finally {
        slot.makingOffer = false;
      }
    };
    pc.ondatachannel = (e) => this.attachChannel(slot, e.channel);

    if (initiator) {
      this.attachChannel(
        slot,
        pc.createDataChannel("state", { ordered: false, maxRetransmits: 0 }),
      );
      this.attachChannel(slot, pc.createDataChannel("reliable", { ordered: true }));
    }
    this.syncAudio(slot);
    return slot;
  }

  private syncAudio(slot: PeerSlot): void {
    const track = this.localStream?.getAudioTracks()[0] ?? null;
    const audioSender = slot.pc.getSenders().find((s) => s.track?.kind === "audio");
    if (track && this.localStream) {
      if (audioSender) void audioSender.replaceTrack(track);
      else slot.pc.addTrack(track, this.localStream);
    } else if (audioSender) {
      void audioSender.replaceTrack(null);
    }
  }

  private attachChannel(slot: PeerSlot, channel: RTCDataChannel): void {
    if (channel.label === "state") slot.state = channel;
    else slot.reliable = channel;
    channel.onopen = () => {
      slot.lastProgressAt = Date.now();
    };
    channel.onmessage = (e) => {
      let msg: { t: string; d?: unknown };
      try {
        msg = JSON.parse(e.data as string) as { t: string; d?: unknown };
      } catch {
        return;
      }
      if (msg.t === "ping") {
        if (slot.state?.readyState === "open") {
          slot.state.send(JSON.stringify({ t: "pong" }));
        }
      } else if (msg.t === "pong") {
        if (slot.pingSentAt) {
          slot.info.rttMs = Math.round(performance.now() - slot.pingSentAt);
          slot.pingSentAt = undefined;
          this.emitPeers();
        }
      } else {
        this.opts.onMessage?.(
          slot.info.id,
          msg.d,
          channel.label === "state" ? "state" : "reliable",
        );
      }
    };
  }

  private async flushPendingCandidates(slot: PeerSlot): Promise<void> {
    while (slot.pendingCandidates.length > 0) {
      const candidate = slot.pendingCandidates.shift()!;
      try {
        await slot.pc.addIceCandidate(candidate);
      } catch (err) {
        if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err);
      }
      if (this.closed) return;
    }
  }

  private async onSignal(
    from: string,
    kind: SignalKind,
    payload: unknown,
    roster: Set<string>,
  ): Promise<void> {
    if (this.closed) return;
    let slot = this.peers.get(from);
    if (!slot) {
      if (!roster.has(from)) return;
      const created = this.connectTo(from, "", false);
      if (!created) return;
      slot = created;
    }
    const polite = this.opts.selfId < from;

    try {
      if (kind === "offer" || kind === "answer") {
        const description = payload as RTCSessionDescriptionInit;
        const collision =
          kind === "offer" && (slot.makingOffer || slot.pc.signalingState !== "stable");
        slot.ignoreOffer = !polite && collision;
        if (slot.ignoreOffer) return;
        try {
          await slot.pc.setRemoteDescription(description);
        } catch (err) {
          if (kind !== "offer" || slot.recreatedForOffer) throw err;
          const attempts = slot.recoveryAttempts;
          const name = slot.info.name;
          slot.pc.close();
          this.peers.delete(from);
          const fresh = this.connectTo(from, name, false);
          if (!fresh) return;
          fresh.recoveryAttempts = attempts;
          fresh.recreatedForOffer = true;
          slot = fresh;
          await slot.pc.setRemoteDescription(description);
        }
        if (this.closed) return;
        await this.flushPendingCandidates(slot);
        if (this.closed) return;
        if (kind === "offer") {
          await slot.pc.setLocalDescription();
          if (this.closed) return;
          await this.sendSignal(from, "answer", slot.pc.localDescription!.toJSON());
        }
      } else if (kind === "ice") {
        const candidate = payload as RTCIceCandidateInit;
        if (!slot.pc.remoteDescription) {
          slot.pendingCandidates.push(candidate);
          return;
        }
        try {
          await slot.pc.addIceCandidate(candidate);
        } catch (err) {
          if (!slot.ignoreOffer) console.warn("[p2p] addIceCandidate failed:", err);
        }
      }
    } catch {
      /* next offer cycle */
    }
  }

  private sendSignal(to: string, kind: SignalKind, payload: unknown): Promise<void> {
    const prev = this.signalQueues.get(to) ?? Promise.resolve();
    const next = prev.then(() => this.postSignal(to, kind, payload));
    this.signalQueues.set(
      to,
      next.catch(() => {}),
    );
    return next;
  }

  private async postSignal(to: string, kind: SignalKind, payload: unknown): Promise<void> {
    if (this.mqttReady && this.mqtt) {
      this.mqtt.send(to, kind, payload);
    }
    for (let attempt = 0; ; attempt++) {
      if (this.closed) return;
      try {
        const res = await fetch("/api/rtc", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            op: "signal",
            room: this.opts.room,
            from: this.opts.selfId,
            to,
            kind,
            payload,
          }),
        });
        if (res.ok) return;
        throw new Error(`signal POST failed: ${res.status}`);
      } catch (err) {
        if (attempt >= SIGNAL_RETRY_DELAYS_MS.length) {
          console.warn(`[p2p] signal ${kind} to ${to} failed after retries`, err);
          return;
        }
        await new Promise((r) => setTimeout(r, SIGNAL_RETRY_DELAYS_MS[attempt]));
      }
    }
  }

  private pingAll(): void {
    const wire = JSON.stringify({ t: "ping" });
    for (const slot of this.peers.values()) {
      if (slot.state?.readyState !== "open") continue;
      const stale =
        slot.pingSentAt !== undefined && performance.now() - slot.pingSentAt > 2 * PING_INTERVAL_MS;
      if (slot.pingSentAt === undefined || stale) {
        slot.pingSentAt = performance.now();
        slot.state.send(wire);
      }
    }
  }

  private watchdog(): void {
    if (this.closed) return;
    const now = Date.now();
    for (const [peerId, slot] of this.peers) {
      const live = slot.pc.connectionState;
      if (live !== slot.info.connectionState) {
        slot.info.connectionState = live;
        if (live === "connecting" || live === "connected") slot.lastProgressAt = now;
        this.emitPeers();
      }
      if (slot.terminal || live === "connected") continue;
      if (now - slot.lastProgressAt <= STALL_MS) continue;
      if (slot.recoveryAttempts >= MAX_RECOVERY_ATTEMPTS) {
        slot.terminal = true;
        this.emitPeers();
        continue;
      }
      slot.recoveryAttempts += 1;
      slot.lastProgressAt = now;
      if (this.opts.selfId > peerId) {
        const { name } = slot.info;
        const attempts = slot.recoveryAttempts;
        slot.pc.close();
        this.peers.delete(peerId);
        const fresh = this.connectTo(peerId, name, true);
        if (fresh) fresh.recoveryAttempts = attempts;
        this.schedulePoll(FAST_POLL_MS);
      }
    }
  }

  private async readCandidateType(slot: PeerSlot): Promise<void> {
    try {
      const stats = await slot.pc.getStats();
      let selected: RTCIceCandidatePairStats | undefined;
      stats.forEach((s) => {
        if (s.type === "candidate-pair" && (s as RTCIceCandidatePairStats).nominated) {
          selected = s as RTCIceCandidatePairStats;
        }
      });
      const localId = selected?.localCandidateId;
      if (localId) {
        const local = stats.get(localId) as { candidateType?: string } | undefined;
        slot.info.candidateType = local?.candidateType ?? null;
        this.emitPeers();
      }
    } catch {
      /* diagnostics only */
    }
  }

  private emitPeers(): void {
    const list = this.peerList();
    const fingerprint = JSON.stringify(
      list.map((p) => [p.id, p.name, p.connectionState, p.candidateType, p.rttMs]),
    );
    if (fingerprint === this.lastPeersFingerprint) return;
    this.lastPeersFingerprint = fingerprint;
    this.opts.onPeersChanged?.(list);
  }
}
