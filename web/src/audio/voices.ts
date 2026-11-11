import type { Timbre } from "../../shared/exercise-types.ts";
import { freqOf } from "../../shared/music/notes.ts";
import { isSampled, pickSample } from "./samples.ts";

// One sounding note = one Voice. Every builder takes the context and the
// node to connect to, so the same code plays live and renders offline (the
// timbre widget draws spectra from offline renders).
//
// Every voice ends in a `gate` gain that is only ever used for the release:
// the tone's own shape (attack, decay) lives on other nodes, so stopping a
// note early never has to interrupt a ramp in progress, which is what makes
// clicks.

export interface Voice {
  /** Fade out quickly, starting at `at` (audio-clock seconds; default now).
   *  A voice that has not started yet never sounds. */
  stop(at?: number): void;
  /** Audio-clock time by which the voice is silent if left alone. */
  readonly end: number;
}

export interface VoiceSpec {
  midi: number;
  timbre: Timbre;
  /** Audio-clock start time. */
  t0: number;
  /** Seconds held before the release begins. */
  duration: number;
  /** 0–1. */
  velocity: number;
}

function finish(ac: BaseAudioContext, dest: AudioNode, sources: AudioScheduledSourceNode[], last: AudioNode, spec: VoiceSpec, releaseTc: number, naturalEnd: number, onEnded?: () => void): Voice {
  const gate = ac.createGain();
  last.connect(gate).connect(dest);
  const releaseAt = spec.t0 + spec.duration;
  gate.gain.setValueAtTime(1, spec.t0);
  gate.gain.setTargetAtTime(0, releaseAt, releaseTc);
  const end = Math.min(naturalEnd, releaseAt + releaseTc * 7);
  for (const s of sources) {
    s.start(spec.t0);
    s.stop(end);
  }
  sources[0].onended = () => {
    gate.disconnect();
    onEnded?.();
  };
  return {
    end,
    stop(at = ac.currentTime) {
      const t = Math.max(at, ac.currentTime);
      gate.gain.cancelScheduledValues(t);
      gate.gain.setTargetAtTime(0, t, 0.012);
      for (const s of sources) {
        try {
          s.stop(t + 0.09);
        } catch {
          /* already stopped */
        }
      }
    },
  };
}

// --- plain waves -------------------------------------------------------------

const WAVE: Record<string, { type: OscillatorType; level: number }> = {
  sine: { type: "sine", level: 0.26 },
  triangle: { type: "triangle", level: 0.26 },
  square: { type: "square", level: 0.1 },
  saw: { type: "sawtooth", level: 0.11 },
};

function waveVoice(ac: BaseAudioContext, dest: AudioNode, spec: VoiceSpec, onEnded?: () => void): Voice {
  const w = WAVE[spec.timbre] ?? WAVE.sine;
  const osc = ac.createOscillator();
  osc.type = w.type;
  osc.frequency.value = freqOf(spec.midi);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, spec.t0);
  amp.gain.linearRampToValueAtTime(w.level * spec.velocity, spec.t0 + 0.012);
  osc.connect(amp);
  return finish(ac, dest, [osc], amp, spec, 0.03, Infinity, onEnded);
}

// --- struck string (the piano stand-in) --------------------------------------

const pianoWaves = new WeakMap<BaseAudioContext, Map<number, PeriodicWave>>();
function pianoWave(ac: BaseAudioContext, partials: number): PeriodicWave {
  let byCount = pianoWaves.get(ac);
  if (!byCount) pianoWaves.set(ac, (byCount = new Map()));
  let wave = byCount.get(partials);
  if (!wave) {
    const real = new Float32Array(partials + 1);
    const imag = new Float32Array(partials + 1);
    // A hammer excites many harmonics, weaker as they go up; the seventh and
    // its multiples are weak because the hammer strikes near their node.
    for (let n = 1; n <= partials; n++) imag[n] = (1 / n ** 1.25) * (n % 7 === 0 ? 0.25 : 1);
    wave = ac.createPeriodicWave(real, imag);
    byCount.set(partials, wave);
  }
  return wave;
}

function struckVoice(ac: BaseAudioContext, dest: AudioNode, spec: VoiceSpec, onEnded?: () => void): Voice {
  const f = freqOf(spec.midi);
  const osc = ac.createOscillator();
  osc.setPeriodicWave(pianoWave(ac, Math.max(2, Math.min(20, Math.floor(9000 / f)))));
  osc.frequency.value = f;
  // Bright at the strike, mellowing as the high harmonics die first.
  const lp = ac.createBiquadFilter();
  lp.type = "lowpass";
  lp.Q.value = 0.5;
  lp.frequency.setValueAtTime(Math.min(11000, f * 12 * (0.5 + spec.velocity)), spec.t0);
  lp.frequency.setTargetAtTime(Math.min(6000, f * 3), spec.t0, 0.5);
  const amp = ac.createGain();
  const level = 0.3 * spec.velocity;
  // Low strings ring longer than high ones.
  const tau = Math.min(3.2, Math.max(0.3, 1.6 * (220 / f) ** 0.45));
  amp.gain.setValueAtTime(0, spec.t0);
  amp.gain.linearRampToValueAtTime(level, spec.t0 + 0.004);
  amp.gain.setTargetAtTime(0, spec.t0 + 0.004, tau);
  osc.connect(lp).connect(amp);
  return finish(ac, dest, [osc], amp, spec, 0.07, spec.t0 + tau * 7, onEnded);
}

// --- plucked string (the guitar stand-in): Karplus–Strong ---------------------

const plucked = new Map<string, AudioBuffer>();

/** A burst of noise circulating in a delay line one period long, averaged on
 *  each pass: the averaging is the string losing its high harmonics first,
 *  exactly what a real plucked string does. */
function pluckBuffer(ac: BaseAudioContext, midi: number): AudioBuffer {
  const sr = ac.sampleRate;
  const key = `${midi}@${sr}`;
  const hit = plucked.get(key);
  if (hit) return hit;
  const f = freqOf(midi);
  const seconds = Math.min(4, Math.max(1.2, 3.2 * (110 / f) ** 0.4));
  const len = Math.floor(sr * seconds);
  const out = new Float32Array(len);
  const delay = sr / f - 0.5; // the two-point average adds half a sample
  const n = Math.floor(delay);
  const frac = delay - n;
  // Deterministic noise so the same note always sounds the same.
  let seed = 0x9e3779b9 ^ (midi * 2654435761);
  const rand = () => {
    seed ^= seed << 13;
    seed ^= seed >>> 17;
    seed ^= seed << 5;
    return ((seed >>> 0) / 0xffffffff) * 2 - 1;
  };
  const fill = n + 3;
  for (let i = 0; i < fill; i++) out[i] = rand();
  // Soften the pick, then remove the harmonics with a node at the pluck point
  // (about a fifth of the way along).
  for (let pass = 0; pass < 2; pass++) for (let i = fill - 1; i > 0; i--) out[i] = 0.5 * (out[i] + out[i - 1]);
  const comb = Math.max(1, Math.round(n * 0.2));
  for (let i = fill - 1; i >= comb; i--) out[i] -= out[i - comb];
  const t60 = Math.min(5, Math.max(1, 4 * (110 / f) ** 0.3));
  const loss = 10 ** (-3 / (f * t60));
  for (let i = fill; i < len; i++) {
    const a = out[i - n];
    const b = out[i - n - 1];
    const c = out[i - n - 2];
    out[i] = loss * 0.5 * (a + (b - a) * frac + b + (c - b) * frac);
  }
  let peak = 0;
  for (let i = 0; i < len; i++) peak = Math.max(peak, Math.abs(out[i]));
  const fade = Math.floor(sr * 0.05);
  for (let i = 0; i < len; i++) out[i] = (out[i] / (peak || 1)) * (i > len - fade ? (len - i) / fade : 1);
  const buf = ac.createBuffer(1, len, sr);
  buf.copyToChannel(out, 0);
  plucked.set(key, buf);
  return buf;
}

function pluckedVoice(ac: BaseAudioContext, dest: AudioNode, spec: VoiceSpec, onEnded?: () => void): Voice {
  const src = ac.createBufferSource();
  src.buffer = pluckBuffer(ac, spec.midi);
  const amp = ac.createGain();
  amp.gain.value = 0.34 * spec.velocity;
  src.connect(amp);
  return finish(ac, dest, [src], amp, spec, 0.06, spec.t0 + src.buffer.duration, onEnded);
}

// --- recorded samples --------------------------------------------------------

function sampleVoice(ac: BaseAudioContext, dest: AudioNode, spec: VoiceSpec, onEnded?: () => void): Voice | null {
  if (!isSampled(spec.timbre)) return null;
  const pick = pickSample(spec.timbre, spec.midi);
  if (!pick) return null;
  const src = ac.createBufferSource();
  src.buffer = pick.buffer;
  src.playbackRate.value = pick.rate;
  const amp = ac.createGain();
  const level = (0.34 / pick.def.peak) * spec.velocity;
  amp.gain.setValueAtTime(level, spec.t0);
  // The guitar recordings sustain like an amplified string; ease them down so
  // a held note sits back the way an acoustic one does.
  if (spec.timbre === "guitar") amp.gain.setTargetAtTime(level * 0.3, spec.t0 + 0.08, 1.4);
  src.connect(amp);
  const gate = ac.createGain();
  amp.connect(gate).connect(dest);
  const releaseTc = spec.timbre === "piano" ? 0.09 : 0.07;
  const releaseAt = spec.t0 + spec.duration;
  gate.gain.setValueAtTime(1, spec.t0);
  gate.gain.setTargetAtTime(0, releaseAt, releaseTc);
  const natural = spec.t0 + (pick.buffer.duration - pick.def.onset) / pick.rate;
  const end = Math.min(natural, releaseAt + releaseTc * 7);
  src.start(spec.t0, pick.def.onset);
  src.stop(end);
  src.onended = () => {
    gate.disconnect();
    onEnded?.();
  };
  return {
    end,
    stop(at = ac.currentTime) {
      const t = Math.max(at, ac.currentTime);
      gate.gain.cancelScheduledValues(t);
      gate.gain.setTargetAtTime(0, t, 0.012);
      try {
        src.stop(t + 0.09);
      } catch {
        /* already stopped */
      }
    },
  };
}

/** Build and schedule one note. Piano and guitar use the recordings when
 *  they are loaded and in range, and otherwise the struck / plucked synth
 *  voices, so there is always a plausible sound straight away. */
export function buildVoice(ac: BaseAudioContext, dest: AudioNode, spec: VoiceSpec, onEnded?: () => void): Voice {
  const sampled = sampleVoice(ac, dest, spec, onEnded);
  if (sampled) return sampled;
  if (spec.timbre === "piano") return struckVoice(ac, dest, spec, onEnded);
  if (spec.timbre === "guitar") return pluckedVoice(ac, dest, spec, onEnded);
  return waveVoice(ac, dest, spec, onEnded);
}

/** A metronome tick: a short high blip, higher for the accent. */
export function buildClick(ac: BaseAudioContext, dest: AudioNode, t0: number, accent: boolean, onEnded?: () => void): Voice {
  const osc = ac.createOscillator();
  osc.type = "triangle";
  osc.frequency.setValueAtTime(accent ? 1760 : 1175, t0);
  const amp = ac.createGain();
  amp.gain.setValueAtTime(0, t0);
  amp.gain.linearRampToValueAtTime(accent ? 0.5 : 0.34, t0 + 0.001);
  amp.gain.setTargetAtTime(0, t0 + 0.001, 0.012);
  osc.connect(amp);
  return finish(ac, dest, [osc], amp, { midi: 0, timbre: "sine", t0, duration: 0.05, velocity: 1 }, 0.01, t0 + 0.12, onEnded);
}
