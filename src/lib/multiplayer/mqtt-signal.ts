import type { PeerRow, SignalKind, SignalRow } from "./p2p";

const BROKERS = ["wss://broker.emqx.io:8084/mqtt", "wss://broker.hivemq.com:8884/mqtt"];

function remainingBytes(n: number) {
  const out: number[] = [];
  do {
    let enc = n % 128;
    n = Math.floor(n / 128);
    if (n > 0) enc |= 0x80;
    out.push(enc);
  } while (n > 0);
  return Uint8Array.from(out);
}

function readRemaining(buf: Uint8Array, start: number) {
  let n = 0;
  let mul = 1;
  let i = start;
  while (i < buf.length) {
    const b = buf[i++];
    n += (b & 127) * mul;
    if ((b & 128) === 0) return { n, next: i };
    mul *= 128;
    if (mul > 128 * 128 * 128) break;
  }
  return null;
}

function encStr(s: string) {
  const b = new TextEncoder().encode(s);
  const out = new Uint8Array(2 + b.length);
  out[0] = b.length >> 8;
  out[1] = b.length & 0xff;
  out.set(b, 2);
  return out;
}

function concat(...parts: Uint8Array[]) {
  const n = parts.reduce((a, p) => a + p.length, 0);
  const out = new Uint8Array(n);
  let o = 0;
  for (const p of parts) {
    out.set(p, o);
    o += p.length;
  }
  return out;
}

function packet(type: number, flags: number, variable: Uint8Array) {
  const rh = remainingBytes(variable.length);
  return concat(Uint8Array.of((type << 4) | flags), rh, variable);
}

export class MqttSignaling {
  private ws: WebSocket | null = null;
  private closed = false;
  private pingTimer: ReturnType<typeof setInterval> | null = null;
  private seq = 1;
  private broker = 0;
  private readonly peers = new Map<string, string>();
  private signals: SignalRow[] = [];
  private readonly room: string;
  private readonly selfId: string;
  private readonly name: string;
  onChange: (() => void) | null = null;

  constructor(opts: { room: string; selfId: string; name: string }) {
    this.room = opts.room;
    this.selfId = opts.selfId;
    this.name = opts.name;
  }

  snapshot(): { peers: PeerRow[]; signals: SignalRow[] } {
    const peers: PeerRow[] = [{ id: this.selfId, name: this.name }];
    for (const [id, name] of this.peers) peers.push({ id, name });
    const signals = this.signals;
    this.signals = [];
    return { peers, signals };
  }

  async connect(): Promise<void> {
    if (this.closed) return;
    const url = BROKERS[this.broker % BROKERS.length];
    await new Promise<void>((resolve, reject) => {
      let settled = false;
      const ws = new WebSocket(url, ["mqtt"]);
      ws.binaryType = "arraybuffer";
      this.ws = ws;
      const fail = (err: Error) => {
        if (settled) return;
        settled = true;
        reject(err);
      };
      ws.onopen = () => {
        ws.send(this.connectPacket());
      };
      ws.onmessage = (ev) => {
        const buf = new Uint8Array(ev.data as ArrayBuffer);
        this.onBytes(buf);
        if (!settled && buf[0] === 0x20) {
          settled = true;
          if (buf.length >= 4 && buf[3] !== 0) {
            fail(new Error("mqtt connack"));
            return;
          }
          this.subscribe();
          this.announce();
          this.pingTimer = setInterval(() => this.ping(), 20_000);
          resolve();
        }
      };
      ws.onerror = () => fail(new Error("mqtt socket"));
      ws.onclose = () => {
        if (this.pingTimer) clearInterval(this.pingTimer);
        this.pingTimer = null;
        if (!settled) fail(new Error("mqtt closed"));
        else if (!this.closed) {
          this.broker += 1;
          window.setTimeout(() => void this.connect().catch(() => {}), 1200);
        }
      };
    });
  }

  send(to: string, kind: SignalKind, payload: unknown) {
    const topic = `balalaika/${this.room}/s/${to}`;
    const body = JSON.stringify({
      id: Date.now() + (this.seq++ % 1000),
      from: this.selfId,
      kind,
      payload,
    });
    this.publish(topic, body, false);
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
    if (this.pingTimer) clearInterval(this.pingTimer);
    this.pingTimer = null;
    try {
      this.ws?.close();
    } catch {
      /* ignore */
    }
    this.ws = null;
  }

  private prefix(kind: "p" | "s") {
    return `balalaika/${this.room}/${kind}/`;
  }

  private connectPacket() {
    const willTopic = `balalaika/${this.room}/p/${this.selfId}`;
    const proto = encStr("MQTT");
    const level = Uint8Array.of(4);
    const flags = Uint8Array.of(0x02 | 0x04 | 0x20);
    const keep = Uint8Array.of(0, 30);
    const id = encStr(this.selfId.slice(0, 23) || "peer");
    const willT = encStr(willTopic);
    const willM = encStr("");
    return packet(1, 0, concat(proto, level, flags, keep, id, willT, willM));
  }

  private subscribe() {
    const pid = Uint8Array.of(0, 1);
    const topic = encStr(`balalaika/${this.room}/#`);
    const qos = Uint8Array.of(0);
    this.ws?.send(packet(8, 2, concat(pid, topic, qos)));
  }

  private announce() {
    this.publish(
      `balalaika/${this.room}/p/${this.selfId}`,
      JSON.stringify({ name: this.name, t: Date.now() }),
      true,
    );
  }

  private ping() {
    this.ws?.send(Uint8Array.of(0xc0, 0));
    this.announce();
  }

  private publish(topic: string, body: string, retain: boolean) {
    const payload = new TextEncoder().encode(body);
    const t = encStr(topic);
    this.ws?.send(packet(3, retain ? 1 : 0, concat(t, payload)));
  }

  private onBytes(buf: Uint8Array) {
    let i = 0;
    while (i < buf.length) {
      const type = buf[i] >> 4;
      const rem = readRemaining(buf, i + 1);
      if (!rem) return;
      const start = rem.next;
      const end = start + rem.n;
      if (end > buf.length) return;
      const variable = buf.subarray(start, end);
      if (type === 3) this.onPublish(variable);
      i = end;
    }
  }

  private onPublish(variable: Uint8Array) {
    if (variable.length < 2) return;
    const tlen = (variable[0] << 8) | variable[1];
    const topic = new TextDecoder().decode(variable.subarray(2, 2 + tlen));
    const payload = new TextDecoder().decode(variable.subarray(2 + tlen));
    const pPref = this.prefix("p");
    const sPref = this.prefix("s");
    if (topic.startsWith(pPref)) {
      const id = topic.slice(pPref.length);
      if (!id || id === this.selfId) return;
      if (!payload) {
        this.peers.delete(id);
      } else {
        try {
          const body = JSON.parse(payload) as { name?: string };
          this.peers.set(id, String(body.name ?? id).slice(0, 64));
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
    }
  }
}
