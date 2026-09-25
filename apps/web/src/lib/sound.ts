import { useSettings } from "../state/settings";

// Synthesized sound effects (PROJECT.md 6A.9): no audio files. The audio context starts after the
// first user gesture (browsers block autoplay), and every call respects mute and volume settings.

export type SoundName = "click" | "stamp" | "fail" | "pass" | "rankup" | "hint";

let ctx: AudioContext | undefined;

function audio(): AudioContext | undefined {
  if (typeof window === "undefined" || !("AudioContext" in window)) return undefined;
  ctx ??= new AudioContext();
  if (ctx.state === "suspended") void ctx.resume();
  return ctx;
}

function tone(
  ac: AudioContext,
  out: GainNode,
  {
    freq,
    start,
    dur,
    type = "square",
    slideTo,
  }: { freq: number; start: number; dur: number; type?: OscillatorType; slideTo?: number },
): void {
  const osc = ac.createOscillator();
  const env = ac.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, ac.currentTime + start);
  if (slideTo) osc.frequency.exponentialRampToValueAtTime(slideTo, ac.currentTime + start + dur);
  env.gain.setValueAtTime(0.0001, ac.currentTime + start);
  env.gain.exponentialRampToValueAtTime(1, ac.currentTime + start + 0.01);
  env.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + start + dur);
  osc.connect(env).connect(out);
  osc.start(ac.currentTime + start);
  osc.stop(ac.currentTime + start + dur + 0.02);
}

/** A short low noise burst: the thump of a rubber stamp. */
function thump(ac: AudioContext, out: GainNode): void {
  const len = Math.floor(ac.sampleRate * 0.12);
  const buffer = ac.createBuffer(1, len, ac.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < len; i++) data[i] = (Math.random() * 2 - 1) * (1 - i / len) ** 3;
  const src = ac.createBufferSource();
  const filter = ac.createBiquadFilter();
  filter.type = "lowpass";
  filter.frequency.value = 420;
  src.buffer = buffer;
  src.connect(filter).connect(out);
  src.start();
  tone(ac, out, { freq: 110, start: 0, dur: 0.12, type: "sine", slideTo: 55 });
}

export function playSound(name: SoundName): void {
  const { soundOn, volume } = useSettings.getState();
  if (!soundOn || volume <= 0) return;
  const ac = audio();
  if (!ac) return;
  const out = ac.createGain();
  out.gain.value = 0.3 * volume * (name === "click" ? 0.4 : 1);
  out.connect(ac.destination);
  switch (name) {
    case "click":
      tone(ac, out, { freq: 880, start: 0, dur: 0.04 });
      break;
    case "hint":
      tone(ac, out, { freq: 523, start: 0, dur: 0.08, type: "triangle" });
      tone(ac, out, { freq: 392, start: 0.08, dur: 0.1, type: "triangle" });
      break;
    case "stamp":
      thump(ac, out);
      break;
    case "fail":
      tone(ac, out, { freq: 220, start: 0, dur: 0.18, slideTo: 150 });
      tone(ac, out, { freq: 160, start: 0.2, dur: 0.28, slideTo: 90 });
      break;
    case "pass":
      [523, 659, 784].forEach((f, i) => tone(ac, out, { freq: f, start: i * 0.09, dur: 0.12 }));
      break;
    case "rankup":
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(ac, out, { freq: f, start: i * 0.12, dur: i === 3 ? 0.4 : 0.14 }),
      );
      break;
  }
}
