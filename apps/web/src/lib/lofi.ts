// Lofi focus radio: three generative beats synthesized with WebAudio. No audio files, so nothing to
// license. A lookahead scheduler queues notes about a second ahead; the chain is warm keys, sine bass,
// soft drums and vinyl crackle through a low-pass filter and a small room.

export type LofiThemeId = "night-shift" | "rainy-precinct" | "coffee-and-code";

export interface LofiTheme {
  id: LofiThemeId;
  name: string;
  mood: string;
  bpm: number;
  swing: number; // delay of every second 16th, as a fraction of a 16th
  chords: number[][]; // MIDI notes, one chord per bar
  bass: number[]; // MIDI root per bar
  scale: number[]; // melody notes (MIDI)
  kick: number[]; // 16th steps
  snare: number[];
  hats: number[];
  restrike: number[]; // extra chord hits within the bar
  cutoff: number; // master low-pass in Hz
  rain: number; // 0..1 rain-noise level
  crackle: number; // 0..1 vinyl level
}

export const LOFI_THEMES: LofiTheme[] = [
  {
    id: "night-shift",
    name: "Night Shift",
    mood: "Warm and slow, for long reading sessions.",
    bpm: 72,
    swing: 0.28,
    chords: [
      [53, 57, 60, 64],
      [52, 55, 59, 62],
      [50, 53, 57, 60],
      [48, 52, 55, 59],
    ],
    bass: [41, 40, 38, 36],
    scale: [69, 72, 74, 76, 79, 81],
    kick: [0, 10],
    snare: [4, 12],
    hats: [0, 2, 4, 6, 8, 10, 12, 14],
    restrike: [],
    cutoff: 1900,
    rain: 0,
    crackle: 0.5,
  },
  {
    id: "rainy-precinct",
    name: "Rainy Precinct",
    mood: "Minor and hushed, rain on the window.",
    bpm: 66,
    swing: 0.2,
    chords: [
      [57, 60, 64, 71],
      [53, 57, 60, 64],
      [48, 52, 55, 59],
      [55, 59, 62, 64],
    ],
    bass: [45, 41, 36, 43],
    scale: [69, 72, 74, 76, 79],
    kick: [0, 7, 10],
    snare: [12],
    hats: [2, 6, 10, 14],
    restrike: [],
    cutoff: 1500,
    rain: 0.7,
    crackle: 0.35,
  },
  {
    id: "coffee-and-code",
    name: "Coffee and Code",
    mood: "Jazzy and upbeat, for the final push.",
    bpm: 84,
    swing: 0.34,
    chords: [
      [50, 53, 57, 60, 64],
      [53, 57, 59, 64],
      [52, 55, 59, 62],
      [55, 58, 61, 64],
    ],
    bass: [38, 43, 36, 45],
    scale: [62, 65, 67, 69, 72, 74, 76],
    kick: [0, 3, 10],
    snare: [4, 12],
    hats: [0, 2, 3, 4, 6, 8, 10, 11, 12, 14],
    restrike: [10],
    cutoff: 2600,
    rain: 0,
    crackle: 0.45,
  },
];

const LOOKAHEAD = 1.2; // seconds of audio queued ahead (keeps playing in background tabs)
const TICK_MS = 200;

const midiHz = (m: number) => 440 * 2 ** ((m - 69) / 12);

/** Small deterministic random, so each bar's melody repeats every phrase instead of wandering. */
function seeded(seed: number): () => number {
  let s = seed >>> 0 || 1;
  return () => {
    s ^= s << 13;
    s ^= s >>> 17;
    s ^= s << 5;
    return ((s >>> 0) % 10000) / 10000;
  };
}

interface Rig {
  ac: AudioContext;
  master: GainNode;
  filter: BiquadFilterNode;
  bus: GainNode; // instruments enter here
  crackle: GainNode;
  rain: GainNode;
  noise: AudioBuffer;
}

let rig: Rig | undefined;
let theme: LofiTheme = LOFI_THEMES[0] as LofiTheme;
let volume = 0.4;
let timer: number | undefined;
let nextTime = 0;
let step = 0; // 16th steps since start
let wanted = false; // the player asked for music; it starts at the first gesture if needed

function noiseBuffer(ac: AudioContext, seconds: number): AudioBuffer {
  const b = ac.createBuffer(1, Math.floor(ac.sampleRate * seconds), ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
  return b;
}

/** Vinyl: faint hiss with sparse pops, looped. */
function vinylBuffer(ac: AudioContext): AudioBuffer {
  const b = ac.createBuffer(1, ac.sampleRate * 4, ac.sampleRate);
  const d = b.getChannelData(0);
  for (let i = 0; i < d.length; i++) {
    d[i] = (Math.random() * 2 - 1) * 0.04;
    if (Math.random() < 0.0004) d[i] = (Math.random() * 2 - 1) * 0.9;
  }
  return b;
}

/** A short decaying-noise impulse response: a small, soft room. */
function roomImpulse(ac: AudioContext): AudioBuffer {
  const len = Math.floor(ac.sampleRate * 1.8);
  const b = ac.createBuffer(2, len, ac.sampleRate);
  for (let ch = 0; ch < 2; ch++) {
    const d = b.getChannelData(ch);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 2.5;
  }
  return b;
}

function loop(ac: AudioContext, buffer: AudioBuffer, out: AudioNode): void {
  const src = ac.createBufferSource();
  src.buffer = buffer;
  src.loop = true;
  src.connect(out);
  src.start();
}

function build(): Rig {
  const ac = new AudioContext();
  const master = ac.createGain();
  master.gain.value = 0;
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.Q.value = 0.6;
  const bus = ac.createGain();
  const room = ac.createConvolver();
  room.buffer = roomImpulse(ac);
  const wet = ac.createGain();
  wet.gain.value = 0.22;
  bus.connect(filter);
  bus.connect(room).connect(wet).connect(filter);
  filter.connect(master).connect(ac.destination);

  const crackle = ac.createGain();
  const hp = ac.createBiquadFilter();
  hp.type = "highpass";
  hp.frequency.value = 900;
  loop(ac, vinylBuffer(ac), hp);
  hp.connect(crackle).connect(master);

  const rain = ac.createGain();
  const rainFilter = ac.createBiquadFilter();
  rainFilter.type = "bandpass";
  rainFilter.frequency.value = 1200;
  rainFilter.Q.value = 0.4;
  const noise = noiseBuffer(ac, 3);
  loop(ac, noise, rainFilter);
  rainFilter.connect(rain).connect(master);

  return { ac, master, filter, bus, crackle, rain, noise };
}

function applyTheme(r: Rig): void {
  const t = r.ac.currentTime;
  r.filter.frequency.setTargetAtTime(theme.cutoff, t, 0.5);
  r.crackle.gain.setTargetAtTime(theme.crackle * 0.5, t, 0.5);
  r.rain.gain.setTargetAtTime(theme.rain * 0.12, t, 0.8);
}

function envelope(r: Rig, at: number, peak: number, attack: number, decay: number): GainNode {
  const g = r.ac.createGain();
  g.gain.setValueAtTime(0.0001, at);
  g.gain.exponentialRampToValueAtTime(peak, at + attack);
  g.gain.exponentialRampToValueAtTime(0.0001, at + attack + decay);
  g.connect(r.bus);
  return g;
}

/** Electric-piano-like voice: a triangle and a slightly detuned sine. */
function keys(r: Rig, notes: number[], at: number, length: number, level: number): void {
  for (const n of notes) {
    const g = envelope(r, at, level / notes.length, 0.03, length);
    for (const [type, detune] of [
      ["triangle", -4],
      ["sine", 5],
    ] as const) {
      const o = r.ac.createOscillator();
      o.type = type;
      o.frequency.value = midiHz(n);
      o.detune.value = detune;
      o.connect(g);
      o.start(at);
      o.stop(at + length + 0.1);
    }
  }
}

function tone(r: Rig, midi: number, at: number, length: number, level: number, type: OscillatorType): void {
  const g = envelope(r, at, level, 0.01, length);
  const o = r.ac.createOscillator();
  o.type = type;
  o.frequency.value = midiHz(midi);
  o.connect(g);
  o.start(at);
  o.stop(at + length + 0.05);
}

function kick(r: Rig, at: number): void {
  const g = envelope(r, at, 0.9, 0.005, 0.32);
  const o = r.ac.createOscillator();
  o.frequency.setValueAtTime(115, at);
  o.frequency.exponentialRampToValueAtTime(42, at + 0.25);
  o.connect(g);
  o.start(at);
  o.stop(at + 0.4);
}

function noiseHit(
  r: Rig,
  at: number,
  level: number,
  decay: number,
  type: BiquadFilterType,
  freq: number,
): void {
  const src = r.ac.createBufferSource();
  src.buffer = r.noise;
  const f = r.ac.createBiquadFilter();
  f.type = type;
  f.frequency.value = freq;
  const g = envelope(r, at, level, 0.003, decay);
  src.connect(f).connect(g);
  src.start(at, Math.random() * 2);
  src.stop(at + decay + 0.05);
}

function scheduleStep(r: Rig, s: number, at: number): void {
  const pos = s % 16;
  const bar = Math.floor(s / 16);
  const chordIndex = bar % theme.chords.length;
  const chord = theme.chords[chordIndex] as number[];
  const sixteenth = 60 / theme.bpm / 4;
  const barLength = sixteenth * 16;

  if (pos === 0) {
    keys(r, chord, at, barLength * 0.95, 0.22);
    tone(r, theme.bass[chordIndex] as number, at, sixteenth * 7, 0.34, "sine");
  }
  if (theme.restrike.includes(pos)) keys(r, chord, at, sixteenth * 5, 0.12);
  if (pos === 8) tone(r, (theme.bass[chordIndex] as number) + 7, at, sixteenth * 5, 0.2, "sine");
  if (theme.kick.includes(pos)) kick(r, at);
  if (theme.snare.includes(pos)) noiseHit(r, at, 0.22, 0.16, "bandpass", 1800);
  if (theme.hats.includes(pos)) noiseHit(r, at, pos % 4 === 0 ? 0.06 : 0.035, 0.05, "highpass", 7000);

  // A sparse melody that repeats every 8 bars.
  const rand = seeded((bar % 8) * 97 + pos * 13 + theme.bpm);
  if (pos % 2 === 0 && rand() < 0.22) {
    const note = theme.scale[Math.floor(rand() * theme.scale.length)] as number;
    tone(r, note, at, sixteenth * 3, 0.07, "triangle");
  }
}

function tick(): void {
  const r = rig;
  if (!r) return;
  const sixteenth = 60 / theme.bpm / 4;
  while (nextTime < r.ac.currentTime + LOOKAHEAD) {
    const swung = step % 2 === 1 ? sixteenth * theme.swing : 0;
    scheduleStep(r, step, nextTime + swung);
    nextTime += sixteenth;
    step++;
  }
}

export function setLofiVolume(v: number): void {
  volume = Math.min(1, Math.max(0, v));
  if (rig && timer !== undefined) rig.master.gain.setTargetAtTime(volume * 0.6, rig.ac.currentTime, 0.2);
}

export function setLofiTheme(id: LofiThemeId): void {
  theme = LOFI_THEMES.find((t) => t.id === id) ?? theme;
  if (rig) applyTheme(rig);
}

export function isLofiPlaying(): boolean {
  return timer !== undefined;
}

/** Starts the radio. Browsers only allow audio after a user gesture; call it from one, or it waits. */
export function startLofi(): void {
  wanted = true;
  if (timer !== undefined || typeof window === "undefined" || !("AudioContext" in window)) return;
  // Before the first click or key press the browser would refuse to play; wait for resumeLofi.
  if (navigator.userActivation && !navigator.userActivation.hasBeenActive) return;
  rig ??= build();
  const r = rig;
  if (r.ac.state === "suspended") void r.ac.resume();
  applyTheme(r);
  nextTime = r.ac.currentTime + 0.1;
  step = 0;
  timer = window.setInterval(tick, TICK_MS);
  tick();
  r.master.gain.setTargetAtTime(volume * 0.6, r.ac.currentTime, 0.6);
}

export function stopLofi(): void {
  wanted = false;
  if (timer === undefined || !rig) return;
  window.clearInterval(timer);
  timer = undefined;
  const r = rig;
  r.master.gain.setTargetAtTime(0, r.ac.currentTime, 0.15);
  window.setTimeout(() => {
    if (timer === undefined) void r.ac.suspend();
  }, 900);
}

/** Called on every click or key press: starts a radio that was waiting for the first gesture. */
export function resumeLofi(): void {
  if (wanted && timer === undefined) startLofi();
  else if (rig && timer !== undefined && rig.ac.state === "suspended") void rig.ac.resume();
}
