import type { MqttClient } from "mqtt";
import type { PeerRow, RoomAct, SignalKind, SignalRow } from "./p2p";

const BROKERS = [
  "wss://broker.emqx.io:8084/mqtt",
  "wss://broker.hivemq.com:8884/mqtt",
  "wss://test.mosquitto.org:8081/mqtt",
];

export class MqttSignaling {
  private client: MqttClient | null = null;
  private closed = false;
  private seq = 1;
  private broker = 0;
  private readonly peers = new Map<string, string>();
  private signals: SignalRow[] = [];
  private acts: RoomAct[] = [];
  private snap: unknown | null = null;
  private hostId: string | null = null;
  private readonly room: string;
  private readonly selfId: string;
  private readonly name: string;
  private readonly wantHost: boolean;
  onChange: (() => void) | null = null;

  constructor(opts: { room: string; selfId: string; name: string; wantHost?: boolean }) {
    this.room = opts.room;
    this.selfId = opts.selfId;
    this.name = opts.name;
    this.wantHost = Boolean(opts.wantHost);
    if (this.wantHost) this.hostId = this.selfId;
  }

  snapshot(): {
    peers: PeerRow[];
    signals: SignalRow[];
    hostId: string | null;
    snap: unknown | null;
    acts: RoomAct[];
  } {
    const peers: PeerRow[] = [{ id: this.selfId, name: this.name }];
    for (const [id, name] of this.peers) peers.push({ id, name });
    const signals = this.signals;
    this.signals = [];
    const acts = this.acts;
    this.acts = [];
    return { peers, signals, hostId: this.hostId, snap: this.snap, acts };
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    const mqttMod = await import("mqtt");
    const mqtt = mqttMod.default ?? mqttMod;
    const url = BROKERS[this.broker % BROKERS.length];
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      let timer: number | undefined;
      let client: MqttClient;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        if (timer) window.clearTimeout(timer);
        try {
          client?.end(true);
        } catch {
          /* ignore */
        }
        reject(err);
      };
      client = mqtt.connect(url, {
        clientId: this.selfId.slice(0, 23) || "peer",
        protocolVersion: 4,
        keepalive: 30,
        clean: true,
        reconnectPeriod: 0,
        connectTimeout: 4000,
        protocolId: "MQTT",
        will: {
          topic: `balalaika/${this.room}/p/${this.selfId}`,
          payload: "",
          retain: true,
          qos: 0,
        },
      });
      this.client = client;
      timer = window.setTimeout(() => fail(new Error("mqtt timeout")), 4500);
      client.on("connect", () => {
        if (settled) return;
        settled = true;
        window.clearTimeout(timer);
        client.subscribe(`balalaika/${this.room}/#`, { qos: 0 }, () => {
          this.announce();
          resolve();
        });
      });
      client.on("message", (topic, payload) => this.onMessage(topic, payload.toString()));
      client.on("error", () => fail(new Error("mqtt socket")));
      client.on("close", () => {
        window.clearTimeout(timer);
        if (!settled) fail(new Error("mqtt closed"));
        else if (!this.closed) {
          this.broker += 1;
          window.setTimeout(() => void this.connect().catch(() => {}), 1200);
        }
      });
    });
  }

  send(to: string, kind: SignalKind, payload: unknown) {
    this.publish(`balalaika/${this.room}/s/${to}`, {
      id: Date.now() + (this.seq++ % 1000),
      from: this.selfId,
      kind,
      payload,
    });
  }

  sendAct(act: unknown) {
    this.publish(`balalaika/${this.room}/a/${this.selfId}`, {
      id: Date.now() + (this.seq++ % 1000),
      from: this.selfId,
      act,
    });
  }

  sendSnap(snap: unknown, hostId: string) {
    this.hostId = hostId;
    this.snap = snap;
    this.publish(`balalaika/${this.room}/snap`, { hostId, snap, t: Date.now() }, true);
  }

  leave() {
    this.publish(`balalaika/${this.room}/p/${this.selfId}`, "", true);
  }

  close() {
    this.closed = true;
    try {
      this.leave();
    } catch {
      /* ignore */
    }
    try {
      this.client?.end(true);
    } catch {
      /* ignore */
    }
    this.client = null;
  }

  private prefix(kind: "p" | "s" | "a") {
    return `balalaika/${this.room}/${kind}/`;
  }

  private announce() {
    this.publish(
      `balalaika/${this.room}/p/${this.selfId}`,
      { name: this.name, t: Date.now(), host: this.wantHost },
      true,
    );
  }

  private publish(topic: string, body: unknown, retain = false) {
    if (!this.client?.connected) return;
    const payload = typeof body === "string" ? body : JSON.stringify(body);
    this.client.publish(topic, payload, { qos: 0, retain });
  }

  private onMessage(topic: string, payload: string) {
    const pPref = this.prefix("p");
    const sPref = this.prefix("s");
    const aPref = this.prefix("a");
    if (topic === `balalaika/${this.room}/snap` && payload) {
      try {
        const body = JSON.parse(payload) as { hostId?: string; snap?: unknown };
        if (body.hostId) this.hostId = String(body.hostId);
        if (body.snap) this.snap = body.snap;
        this.onChange?.();
      } catch {
        /* ignore */
      }
      return;
    }
    if (topic.startsWith(pPref)) {
      const id = topic.slice(pPref.length);
      if (!id || id === this.selfId) return;
      if (!payload) {
        this.peers.delete(id);
      } else {
        try {
          const body = JSON.parse(payload) as { name?: string; host?: boolean };
          this.peers.set(id, String(body.name ?? id).slice(0, 64));
          if (body.host) this.hostId = id;
        } catch {
          this.peers.set(id, id);
        }
      }
      this.onChange?.();
      return;
    }
    if (topic === `${sPref}${this.selfId}` && payload) {
      try {
        const body = JSON.parse(payload) as {
          id?: number;
          from?: string;
          kind?: SignalKind;
          payload?: unknown;
        };
        if (!body.from || !body.kind) return;
        this.signals.push({
          id: Number(body.id) || Date.now(),
          from: String(body.from),
          kind: body.kind,
          payload: body.payload,
        });
        this.onChange?.();
      } catch {
        /* ignore */
      }
      return;
    }
    if (topic.startsWith(aPref) && payload) {
      try {
        const body = JSON.parse(payload) as { id?: number; from?: string; act?: unknown };
        const from = String(body.from ?? topic.slice(aPref.length));
        if (!from || from === this.selfId || body.act === undefined) return;
        this.acts.push({
          id: Number(body.id) || Date.now(),
          from,
          act: body.act,
        });
        this.onChange?.();
      } catch {
        /* ignore */
      }
    }
  }
}
