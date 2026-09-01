import type { Genre, Song } from "@/lib/songs";
import { songDuration } from "@/lib/songs";

type Buses = {
  ctx: AudioContext;
  master: GainNode;
  music: GainNode;
  sfx: GainNode;
};

let buses: Buses | null = null;
let noiseBuffer: AudioBuffer | null = null;
let musicGain = 0.78;
let sfxGain = 0.85;
let muted = false;
let active: { stop: (when?: number) => void } | null = null;
let keepAlive: OscillatorNode | null = null;
let armedUnlock = false;

function applyGains() {
  if (!buses) return;
  const t = buses.ctx.currentTime;
  const m = muted ? 0 : Math.pow(Math.max(0, musicGain), 1.2);
  const s = muted ? 0 : Math.pow(Math.max(0, sfxGain), 1.2);
  buses.music.gain.setTargetAtTime(m, t, 0.03);
  buses.sfx.gain.setTargetAtTime(s, t, 0.03);
  if (fileEl) {
    fileEl.muted = muted;
    fileEl.volume = muted ? 0 : Math.min(1, Math.pow(Math.max(0, musicGain), 1.2));
  }
  if (previewEl) {
    previewEl.muted = muted;
    previewEl.volume = muted ? 0 : Math.min(1, Math.pow(Math.max(0, musicGain), 1.2));
  }
}

export function setMixer(opts: { music?: number; sfx?: number; muted?: boolean }) {
  if (opts.music != null) musicGain = opts.music;
  if (opts.sfx != null) sfxGain = opts.sfx;
  if (opts.muted != null) muted = opts.muted;
  applyGains();
}

function audioCtor(): typeof AudioContext | null {
  if (typeof window === "undefined") return null;
  const w = window as Window & { webkitAudioContext?: typeof AudioContext };
  return window.AudioContext || w.webkitAudioContext || null;
}

function holdContext(ctx: AudioContext) {
  if (keepAlive) return;
  try {
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.frequency.value = 40;
    g.gain.value = 0.00004;
    osc.connect(g);
    g.connect(ctx.destination);
    osc.start();
    keepAlive = osc;
  } catch {
    keepAlive = null;
  }
}

export function unlockAudio() {
  if (typeof window === "undefined") return null;
  const Ctor = audioCtor();
  if (!Ctor) return null;
  if (!buses) {
    let ctx: AudioContext;
    try {
      ctx = new Ctor();
    } catch {
      ctx = new Ctor({ latencyHint: "playback" });
    }
    const master = ctx.createGain();
    const music = ctx.createGain();
    const sfx = ctx.createGain();
    music.connect(master);
    sfx.connect(master);
    master.connect(ctx.destination);
    buses = { ctx, master, music, sfx };
    noiseBuffer = makeNoise(ctx);
    applyGains();
    const wake = () => {
      if (buses?.ctx.state === "suspended") void buses.ctx.resume();
    };
    document.addEventListener("visibilitychange", () => {
      if (document.visibilityState === "visible") wake();
    });
    window.addEventListener("focus", wake);
  }
  if (buses.ctx.state === "suspended") void buses.ctx.resume();
  holdContext(buses.ctx);
  return buses.ctx;
}

export function armAudioGestures() {
  if (typeof window === "undefined" || armedUnlock) return;
  armedUnlock = true;
  const wake = () => {
    unlockAudio();
  };
  window.addEventListener("pointerdown", wake);
  window.addEventListener("keydown", wake);
  window.addEventListener("touchstart", wake, { passive: true });
}

export function getAudio() {
  return buses;
}

export function audioRunning() {
  return buses?.ctx.state === "running";
}

function startStop(node: AudioScheduledSourceNode, start: number, stop: number) {
  const nowT = node.context.currentTime;
  const a = Math.max(start, nowT);
  const b = Math.max(stop, a + 0.012);
  try {
    node.start(a);
    node.stop(b);
  } catch {
    try {
      node.start();
      node.stop(nowT + 0.05);
    } catch {
      /* already started */
    }
  }
}

function makeNoise(ctx: AudioContext) {
  const buffer = ctx.createBuffer(1, ctx.sampleRate * 1.2, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

function midiToFreq(m: number) {
  return 440 * Math.pow(2, (m - 69) / 12);
}

function envGain(ctx: AudioContext, dest: AudioNode, start: number, peak: number, attack: number, release: number) {
  const g = ctx.createGain();
  g.gain.setValueAtTime(0.0001, start);
  g.gain.exponentialRampToValueAtTime(Math.max(peak, 0.0002), start + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, start + attack + release);
  g.connect(dest);
  return g;
}

function kick(ctx: AudioContext, dest: AudioNode, t: number, vel = 0.9) {
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = "sine";
  osc.frequency.setValueAtTime(180, t);
  osc.frequency.exponentialRampToValueAtTime(55, t + 0.12);
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
  osc.connect(g);
  g.connect(dest);
  startStop(osc, t, t + 0.24);

  const click = ctx.createOscillator();
  const cg = ctx.createGain();
  click.type = "square";
  click.frequency.value = 1800;
  cg.gain.setValueAtTime(vel * 0.12, t);
  cg.gain.exponentialRampToValueAtTime(0.0001, t + 0.03);
  click.connect(cg);
  cg.connect(dest);
  startStop(click, t, t + 0.04);
}

function snare(ctx: AudioContext, dest: AudioNode, t: number, vel = 0.35) {
  if (!noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const bp = ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.value = 1800;
  bp.Q.value = 0.7;
  const g = ctx.createGain();
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.14);
  src.connect(bp);
  bp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + 0.16);
  const osc = ctx.createOscillator();
  const og = ctx.createGain();
  osc.frequency.value = 180;
  og.gain.setValueAtTime(vel * 0.35, t);
  og.gain.exponentialRampToValueAtTime(0.0001, t + 0.08);
  osc.connect(og);
  og.connect(dest);
  startStop(osc, t, t + 0.1);
}

function hat(ctx: AudioContext, dest: AudioNode, t: number, vel = 0.12, open = false) {
  if (!noiseBuffer) return;
  const src = ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const hp = ctx.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 7000;
  const g = ctx.createGain();
  const dur = open ? 0.12 : 0.04;
  g.gain.setValueAtTime(vel, t);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  src.connect(hp);
  hp.connect(g);
  g.connect(dest);
  src.start(t);
  src.stop(t + dur + 0.02);
}

function bassNote(ctx: AudioContext, dest: AudioNode, t: number, midi: number, dur: number, genre: Genre) {
  const osc = ctx.createOscillator();
  osc.type = genre === "ballad" || genre === "lofi" || genre === "folk" ? "triangle" : "sawtooth";
  osc.frequency.value = midiToFreq(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = genre === "hyperpop" ? 1400 : 920;
  const g = envGain(ctx, dest, t, 0.28, 0.01, dur * 0.9);
  osc.connect(filter);
  filter.connect(g);
  startStop(osc, t, t + dur);
}

function padChord(ctx: AudioContext, dest: AudioNode, t: number, notes: number[], dur: number, genre: Genre) {
  const peak = genre === "ballad" ? 0.14 : genre === "folk" ? 0.12 : 0.1;
  for (const n of notes) {
    const osc = ctx.createOscillator();
    osc.type = genre === "folk" ? "sawtooth" : "triangle";
    osc.frequency.value = midiToFreq(n);
    const g = envGain(ctx, dest, t, peak, 0.04, dur * 0.85);
    osc.connect(g);
    startStop(osc, t, t + dur);
  }
}

function leadNote(ctx: AudioContext, dest: AudioNode, t: number, midi: number, dur: number) {
  const osc = ctx.createOscillator();
  osc.type = "square";
  osc.frequency.value = midiToFreq(midi);
  const filter = ctx.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 1400;
  const g = envGain(ctx, dest, t, 0.11, 0.01, dur * 0.7);
  osc.connect(filter);
  filter.connect(g);
  startStop(osc, t, t + dur);
}

const PROGRESSIONS = [
  [0, 7, 9, 5],
  [0, 5, 7, 4],
  [0, 9, 5, 7],
];

function patternFor(genre: Genre) {
  if (genre === "ballad" || genre === "lofi") return { hats: 4, kick: [0], snare: [2], openHat: false };
  if (genre === "folk") return { hats: 4, kick: [0, 2], snare: [1, 3], openHat: false };
  if (genre === "rnb") return { hats: 8, kick: [0, 2.5], snare: [1, 3], openHat: true };
  if (genre === "hyperpop") return { hats: 16, kick: [0, 1, 2, 3], snare: [1, 3], openHat: true };
  return { hats: 8, kick: [0, 1, 2, 3], snare: [1, 3], openHat: false };
}

export function playUiTick() {
  const ctx = unlockAudio();
  const b = buses;
  if (!ctx || !b) return;
  const t = b.ctx.currentTime;
  const osc = b.ctx.createOscillator();
  osc.frequency.value = 880;
  const g = envGain(b.ctx, b.sfx, t, 0.08, 0.005, 0.06);
  osc.connect(g);
  startStop(osc, t, t + 0.08);
}

export function playSpinWhoosh() {
  const ctx = unlockAudio();
  const b = buses;
  if (!ctx || !b || !noiseBuffer) return;
  const t = b.ctx.currentTime;
  const src = b.ctx.createBufferSource();
  src.buffer = noiseBuffer;
  const bp = b.ctx.createBiquadFilter();
  bp.type = "bandpass";
  bp.frequency.setValueAtTime(400, t);
  bp.frequency.exponentialRampToValueAtTime(1800, t + 0.35);
  const g = b.ctx.createGain();
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(0.22, t + 0.08);
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.55);
  src.connect(bp);
  bp.connect(g);
  g.connect(b.sfx);
  src.start(t);
  src.stop(t + 0.56);
}

export function playStopClink() {
  const ctx = unlockAudio();
  const b = buses;
  if (!ctx || !b) return;
  const t = b.ctx.currentTime;
  for (const [freq, delay] of [
    [2460, 0],
    [1840, 0.04],
    [3120, 0.07],
  ] as const) {
    const osc = b.ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.value = freq;
    const g = envGain(b.ctx, b.sfx, t + delay, 0.18, 0.004, 0.22);
    osc.connect(g);
    startStop(osc, t + delay, t + delay + 0.26);
  }
}

function scheduleSong(ctx: AudioContext, dest: AudioNode, song: Song, start: number) {
  const beat = 60 / song.bpm;
  const bar = beat * 4;
  const total = songDuration(song);
  const bars = Math.ceil(total / bar);
  const prog = PROGRESSIONS[Math.abs(song.title.length) % PROGRESSIONS.length];
  const style = patternFor(song.genre);
  const root = song.key;

  for (let barI = 0; barI < bars; barI++) {
    try {
      const t0 = start + barI * bar;
      const degree = prog[barI % 4];
      const chordRoot = root + degree;
      padChord(ctx, dest, t0, [chordRoot, chordRoot + 4, chordRoot + 7], bar * 0.95, song.genre);
      bassNote(ctx, dest, t0, chordRoot - 12, beat * 1.8, song.genre);
      if (song.genre !== "ballad") bassNote(ctx, dest, t0 + beat * 2, chordRoot - 12, beat * 1.5, song.genre);

      for (const k of style.kick) kick(ctx, dest, t0 + k * beat, 0.85);
      for (const s of style.snare) snare(ctx, dest, t0 + s * beat, 0.38);

      const hatStep = 4 / style.hats;
      for (let i = 0; i < style.hats; i++) {
        const open = style.openHat && i % 4 === 2;
        hat(ctx, dest, t0 + i * hatStep * beat, open ? 0.16 : 0.11, open);
      }

      if (barI % 2 === 0) {
        const melody = [0, 2, 4, 5, 7, 9, 7, 4];
        leadNote(ctx, dest, t0 + beat * 0.5, chordRoot + 12 + melody[barI % melody.length], beat * 0.45);
        leadNote(ctx, dest, t0 + beat * 2.5, chordRoot + 12 + melody[(barI + 3) % melody.length], beat * 0.4);
      }
    } catch {
      /* skip a bar rather than kill the track */
    }
  }
}

function wireKaraoke(source: AudioNode, dest: AudioNode, minus: boolean) {
  if (!minus) {
    source.connect(dest);
    return;
  }
  const ctx = source.context;
  const split = ctx.createChannelSplitter(2);
  const merge = ctx.createChannelMerger(2);
  const inv = ctx.createGain();
  inv.gain.value = -1;
  const side = ctx.createGain();
  side.gain.value = 1.15;
  const bass = ctx.createGain();
  bass.gain.value = 0.5;
  const lp = ctx.createBiquadFilter();
  lp.type = "lowpass";
  lp.frequency.value = 170;
  lp.Q.value = 0.6;

  source.connect(split);
  split.connect(side, 0);
  split.connect(inv, 1);
  inv.connect(side);
  side.connect(merge, 0, 0);
  side.connect(merge, 0, 1);
  split.connect(bass, 0);
  split.connect(bass, 1);
  bass.connect(lp);
  lp.connect(merge, 0, 0);
  lp.connect(merge, 0, 1);
  merge.connect(dest);
}

let previewEl: HTMLAudioElement | null = null;
let fileEl: HTMLAudioElement | null = null;

export function trackTime(): number | null {
  if (fileEl && Number.isFinite(fileEl.currentTime)) return fileEl.currentTime;
  return null;
}

export function previewTime() {
  return previewEl?.currentTime ?? 0;
}

export function isFilePlaying() {
  return Boolean((fileEl && !fileEl.paused) || (previewEl && !previewEl.paused));
}

export function stopPreview() {
  if (!previewEl) return;
  try {
    previewEl.pause();
    previewEl.removeAttribute("src");
    previewEl.load();
  } catch {
    /* ignore */
  }
  previewEl = null;
}

export function previewFile(url: string) {
  unlockAudio();
  stopPreview();
  stopTrack();
  const el = new Audio();
  el.src = url;
  el.preload = "auto";
  previewEl = el;
  void el.play().catch(() => {
    /* overlay / next tap */
  });
}

export function stopTrack() {
  stopPreview();
  if (!active) return;
  active.stop();
  active = null;
}

export function startTrack(song: Song): { startedAt: number; duration: number } | null {
  const ctx = unlockAudio();
  const b = buses;
  if (!ctx || !b) return null;
  stopTrack();
  const startedAt = ctx.currentTime + 0.08;
  const duration = songDuration(song);
  const duck = ctx.createGain();
  duck.gain.value = 1;
  duck.connect(b.music);

  let element: HTMLAudioElement | null = null;
  let elementSrc: MediaElementAudioSourceNode | null = null;

  if (song.audioUrl && !song.minus) {
    element = new Audio();
    element.preload = "auto";
    element.src = song.audioUrl;
    fileEl = element;
    applyGains();
    void element.play().catch(() => {
      /* karaoke overlay asks for a tap */
    });
  } else if (song.audioUrl) {
    element = new Audio();
    element.crossOrigin = "anonymous";
    element.preload = "auto";
    element.src = song.audioUrl;
    try {
      elementSrc = ctx.createMediaElementSource(element);
      wireKaraoke(elementSrc, duck, true);
    } catch {
      elementSrc = null;
    }
    fileEl = element;
    void element.play().catch(() => {
      /* karaoke overlay */
    });
  } else {
    scheduleSong(ctx, duck, song, startedAt);
  }

  const stop = (when?: number) => {
    const t = when ?? ctx.currentTime;
    duck.gain.setTargetAtTime(0, t, 0.04);
    if (element) {
      try {
        element.pause();
        element.removeAttribute("src");
        element.load();
      } catch {
        /* ignore */
      }
    }
    if (fileEl === element) fileEl = null;
    window.setTimeout(() => {
      try {
        duck.disconnect();
        elementSrc?.disconnect();
      } catch {
        /* ignore */
      }
    }, 200);
  };

  active = { stop };
  window.setTimeout(() => {
    if (active && active.stop === stop) stop();
  }, (duration + 0.4) * 1000);

  return { startedAt, duration };
}

export function now() {
  return buses?.ctx.currentTime ?? 0;
}

export type MicHandle = {
  level: () => number;
  stop: () => void;
};

export async function startMic(): Promise<MicHandle | null> {
  const b = buses;
  if (!b || typeof navigator === "undefined" || !navigator.mediaDevices) return null;
  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
    const src = b.ctx.createMediaStreamSource(stream);
    const analyser = b.ctx.createAnalyser();
    analyser.fftSize = 512;
    analyser.smoothingTimeConstant = 0.65;
    src.connect(analyser);
    const data = new Uint8Array(analyser.fftSize);
    return {
      level: () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        return Math.min(1, Math.sqrt(sum / data.length) * 3.4);
      },
      stop: () => {
        src.disconnect();
        stream.getTracks().forEach((tr) => tr.stop());
      },
    };
  } catch {
    return null;
  }
}

function takeMime() {
  const types = ["audio/webm;codecs=opus", "audio/webm", "audio/mp4"];
  for (const t of types) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return "audio/webm";
}

export type MixedTake = {
  time: () => number;
  duration: () => number;
  level: () => number;
  stop: () => Promise<Blob>;
};

export async function startMixedTake(playUrl: string): Promise<MixedTake | null> {
  const ctx = unlockAudio();
  const b = buses;
  if (!ctx || !b || typeof navigator === "undefined" || !navigator.mediaDevices) return null;
  stopTrack();
  let stream: MediaStream;
  try {
    stream = await navigator.mediaDevices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch {
    return null;
  }

  const el = new Audio();
  el.crossOrigin = "anonymous";
  el.preload = "auto";
  el.src = playUrl;
  fileEl = el;
  applyGains();

  const dest = ctx.createMediaStreamDestination();
  const mix = ctx.createGain();
  mix.gain.value = 1;
  mix.connect(dest);
  mix.connect(b.music);

  let elementSrc: MediaElementAudioSourceNode | null = null;
  try {
    elementSrc = ctx.createMediaElementSource(el);
    elementSrc.connect(mix);
  } catch {
    elementSrc = null;
  }

  const micSrc = ctx.createMediaStreamSource(stream);
  const micGain = ctx.createGain();
  micGain.gain.value = 1.2;
  micSrc.connect(micGain);
  micGain.connect(dest);
  const analyser = ctx.createAnalyser();
  analyser.fftSize = 512;
  analyser.smoothingTimeConstant = 0.65;
  micSrc.connect(analyser);
  const data = new Uint8Array(analyser.fftSize);

  const mime = takeMime();
  const rec = new MediaRecorder(dest.stream, { mimeType: mime, audioBitsPerSecond: 96_000 });
  const chunks: BlobPart[] = [];
  rec.ondataavailable = (e) => {
    if (e.data.size) chunks.push(e.data);
  };
  rec.start(800);
  void el.play().catch(() => {
    /* overlay tap */
  });

  let finished: ((blob: Blob) => void) | null = null;
  rec.onstop = () => {
    finished?.(new Blob(chunks, { type: mime.split(";")[0] }));
  };

  const stop = () =>
    new Promise<Blob>((resolve) => {
      finished = resolve;
      try {
        if (rec.state !== "inactive") rec.stop();
        else resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      } catch {
        resolve(new Blob(chunks, { type: mime.split(";")[0] }));
      }
      try {
        el.pause();
        el.removeAttribute("src");
        el.load();
      } catch {
        /* ignore */
      }
      if (fileEl === el) fileEl = null;
      stream.getTracks().forEach((t) => t.stop());
      window.setTimeout(() => {
        try {
          mix.disconnect();
          micSrc.disconnect();
          elementSrc?.disconnect();
        } catch {
          /* ignore */
        }
      }, 120);
    });

  return {
    time: () => (Number.isFinite(el.currentTime) ? el.currentTime : 0),
    duration: () => (Number.isFinite(el.duration) && el.duration > 0 ? el.duration : 0),
    level: () => {
      analyser.getByteTimeDomainData(data);
      let sum = 0;
      for (let i = 0; i < data.length; i++) {
        const v = (data[i] - 128) / 128;
        sum += v * v;
      }
      return Math.min(1, Math.sqrt(sum / data.length) * 3.4);
    },
    stop,
  };
}
