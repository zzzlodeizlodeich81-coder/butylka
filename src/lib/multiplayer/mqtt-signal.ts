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
