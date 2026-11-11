import type { Sound, Timbre } from "../../shared/exercise-types.ts";
import { isSampled, loadSamples, samplesReady, type SampledTimbre } from "./samples.ts";
import { buildClick, buildVoice, type Voice } from "./voices.ts";

// The app's one audio engine. Everything that makes sound goes through here:
//   notes        playNote / playChord / startNote    recorded piano and guitar, synth waves
//   music        playSound                            a Sound played in time on the audio clock
//   time         playClick / startMetronome / audioNow
//   physics      startPartials / pluckPartials        individual harmonics for the sound widgets
//   looking      getAnalyser / renderNote             scopes and spectra
// Piano and guitar are recordings (web/public/samples/, see CREDITS.md there),
// loaded on first use; until they arrive, or if they cannot be fetched, a
// struck-string and a plucked-string synth stand in, so a note always sounds.

export type { Timbre };

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let analyser: AnalyserNode | null = null;

/** The shared context, created on first use. Browsers keep it suspended
 *  until a user gesture; every play function resumes it. */
export function audioContext(): AudioContext {
  if (!ctx) {
    const Ctor: typeof AudioContext | undefined = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) throw new Error("This browser has no Web Audio, so the app cannot make sound.");
    ctx = new Ctor({ latencyHint: "interactive" });
    // iPhone and iPad: by default the ring/silent switch mutes Web Audio as
    // if it were a ringtone. Declaring the page a "playback" session (Safari
    // 16.4+) makes it behave like a music app, which sounds with the switch
    // on silent. Older iOS stays muted by the switch.
    try {
      const session = (navigator as unknown as { audioSession?: { type: string } }).audioSession;
      if (session) session.type = "playback";
    } catch {
      /* not supported: nothing to do */
    }
    master = ctx.createGain();
    master.gain.value = 0.9;
    // A limiter: stacked voices (a six-string chord, eight harmonics at full)
    // are squeezed instead of clipping.
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -9;
    limiter.knee.value = 6;
    limiter.ratio.value = 14;
    limiter.attack.value = 0.003;
    limiter.release.value = 0.2;
    analyser = ctx.createAnalyser();
    analyser.fftSize = 4096;
    analyser.smoothingTimeConstant = 0.6;
    master.connect(limiter).connect(analyser).connect(ctx.destination);
  }
  // "interrupted" is iOS's word for suspended by the system (a call, the
  // page put in the background); it resumes the same way.
  if (ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {});
  return ctx;
}

/** Where every voice connects; widgets that make their own nodes connect here
 *  so the scope sees them and the limiter covers them. */
export function masterInput(): AudioNode {
  audioContext();
  return master!;
}

/** An analyser on the master output, for scopes and spectra. */
export function getAnalyser(): AnalyserNode {
  audioContext();
  return analyser!;
}

/** The analyser if the audio context already exists and is running, else
 *  null. Lets a scope sit idle on a page without creating a context before
 *  the first user gesture (which browsers warn about). */
export function analyserIfRunning(): AnalyserNode | null {
  return ctx && ctx.state === "running" ? analyser : null;
}

/** Seconds on the audio clock — the time base for anything that must line up
 *  with sound (tap grading, cursors). */
export function audioNow(): number {
  return audioContext().currentTime;
}

/** Fetch and decode the recordings for a sampled timbre ahead of first use.
 *  Resolves true when they are ready, false when the synth will stand in.
 *  Other timbres resolve true at once. */
export function preload(timbre: Timbre, opts: { eager?: boolean } = {}): Promise<boolean> {
  if (!isSampled(timbre)) return Promise.resolve(true);
  try {
    return loadSamples(decodeContext(), timbre, opts);
  } catch {
    return Promise.resolve(false); // no Web Audio at all
  }
}

/** A context to decode recordings with. Before the first user gesture the
 *  live context must not be created (browsers warn and keep it suspended),
 *  so a throwaway offline one decodes instead; its buffers play in any context. */
function decodeContext(): BaseAudioContext {
  if (ctx) return ctx;
  const Off = offlineCtor();
  // No offline context (very old Safari had only a prefixed one, or none):
  // decode with the live one, created a little early.
  return Off ? new Off(1, 1, 44100) : audioContext();
}
function offlineCtor(): typeof OfflineAudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  return window.OfflineAudioContext ?? (window as unknown as { webkitOfflineAudioContext?: typeof OfflineAudioContext }).webkitOfflineAudioContext;
}

let warmed = false;
/** Fetch and decode both recorded instruments in the background, so that the
 *  very first note of a session is already the recording and not the stand-in
 *  synth. Safe to call before any user gesture and more than once. Runs by
 *  itself once the page is idle (see the bottom of this file). */
export function preloadSamples(opts: { eager?: boolean } = {}): void {
  if (warmed && samplesReady("piano") && samplesReady("guitar")) return;
  warmed = true;
  void preload("piano", opts);
  void preload("guitar", opts);
}
/** Whether a timbre is currently played from recordings. */
export function usingSamples(timbre: Timbre): boolean {
  return isSampled(timbre) && samplesReady(timbre as SampledTimbre);
}

// --- voices ------------------------------------------------------------------

export interface NoteOptions {
  timbre?: Timbre;
  /** Seconds the note is held before release. Default 1.2 (guitar 2: a
   *  plucked string is left to ring). */
  duration?: number;
  /** 0–1. Default 0.8. */
  velocity?: number;
  /** Seconds from now. Default 0. */
  delay?: number;
}

interface Live {
  voice: Voice;
  /** Which playSound playback owns it, if any. */
  owner: number;
}
const live = new Set<Live>();
const MAX_VOICES = 48;

function spawn(midi: number, opts: NoteOptions, owner = 0): Voice {
  const ac = audioContext();
  const timbre = opts.timbre ?? "piano";
  if (isSampled(timbre) && !samplesReady(timbre)) void loadSamples(ac, timbre); // not there yet, or an earlier load failed: (re)try
  if (live.size >= MAX_VOICES) {
    const oldest = live.values().next().value;
    if (oldest) {
      oldest.voice.stop();
      live.delete(oldest);
    }
  }
  const entry: Live = { voice: null as unknown as Voice, owner };
  entry.voice = buildVoice(
    ac,
    masterInput(),
    { midi, timbre, t0: ac.currentTime + Math.max(0, opts.delay ?? 0), duration: opts.duration ?? (timbre === "guitar" ? 2 : 1.2), velocity: Math.min(1, Math.max(0, opts.velocity ?? 0.8)) },
    () => live.delete(entry),
  );
  live.add(entry);
  return entry.voice;
}

export function playNote(midi: number, opts: NoteOptions = {}): void {
  spawn(midi, opts);
}

/** Like playNote, but returns a handle so a held key can be released early. */
export function startNote(midi: number, opts: NoteOptions = {}): { stop(): void } {
  const v = spawn(midi, { duration: 8, ...opts });
  return { stop: () => v.stop() };
}

/** Several notes at once; `strum` staggers them (seconds between notes,
 *  lowest first), as a guitar does. */
export function playChord(midis: number[], opts: NoteOptions & { strum?: number } = {}): void {
  const each = Math.min(1, 1.6 / Math.sqrt(Math.max(1, midis.length))); // a full chord is not six times as loud as one note
  [...midis].sort((a, b) => a - b).forEach((m, i) => spawn(m, { ...opts, velocity: (opts.velocity ?? 0.8) * each, delay: (opts.delay ?? 0) + i * (opts.strum ?? 0) }));
}

/** A short metronome tick. The handle cancels it if it has not sounded yet
 *  (ticks are put on the audio clock ahead of time, so whoever schedules a
 *  run of them must cancel the rest when it stops). */
export function playClick(opts: { accent?: boolean; delay?: number } = {}): { stop(): void } {
  const ac = audioContext();
  const entry: Live = { voice: null as unknown as Voice, owner: 0 };
  entry.voice = buildClick(ac, masterInput(), ac.currentTime + Math.max(0, opts.delay ?? 0), Boolean(opts.accent), () => live.delete(entry));
  live.add(entry);
  return {
    stop() {
      if (!live.delete(entry)) return;
      entry.voice.stop();
    },
  };
}

// --- music in time -----------------------------------------------------------

export interface Playback {
  stop(): void;
}

const LOOKAHEAD = 0.2; // seconds of audio scheduled ahead of the clock
const TICK_MS = 40;
let nextOwner = 1;
const playbacks = new Set<Playback>();

/** Play a Sound in time. `onEvent(i)` fires as event i starts (for cursors
 *  and highlights), `onEnd` once after the last event finishes (not after
 *  stop()). `click` adds a metronome tick on every beat. Notes are scheduled
 *  on the audio clock a little ahead of time, so the rhythm does not depend
 *  on how busy the page is. */
export function playSound(sound: Sound, opts: { onEvent?: (index: number) => void; onEnd?: () => void; timbre?: Timbre; click?: boolean; delay?: number } = {}): Playback {
  const ac = audioContext();
  const spb = 60 / sound.tempo;
  const start = ac.currentTime + (opts.delay ?? 0.06);
  const owner = nextOwner++;
  const order = sound.events.map((e, i) => ({ e, i })).sort((a, b) => a.e.at - b.e.at);
  const totalBeats = sound.events.reduce((m, e) => Math.max(m, e.at + e.beats), 0);
  const end = start + totalBeats * spb;
  const timers = new Set<number>();
  const later = (fn: () => void, at: number) => {
    const id = window.setTimeout(() => {
      timers.delete(id);
      fn();
    }, Math.max(0, (at - ac.currentTime) * 1000));
    timers.add(id);
  };
  let next = 0;
  let nextBeat = 0;
  let done = false;

  const tick = () => {
    if (done) return;
    const horizon = ac.currentTime + LOOKAHEAD;
    while (next < order.length && start + order[next].e.at * spb < horizon) {
      const { e, i } = order[next++];
      const at = start + e.at * spb;
      const timbre = e.timbre ?? opts.timbre ?? sound.timbre ?? "piano";
      const held = e.beats * spb;
      // A guitar string rings on past its written length; a piano key is lifted.
      const duration = timbre === "guitar" ? Math.max(held, 1.1) : Math.max(0.12, held * 0.96);
      const each = Math.min(1, 1.6 / Math.sqrt(Math.max(1, e.midis.length)));
      [...e.midis].sort((a, b) => a - b).forEach((m, k) => spawn(m, { timbre, duration, velocity: 0.8 * each, delay: Math.max(0, at - ac.currentTime) + k * (e.strum ?? 0) }, owner));
      later(() => opts.onEvent?.(i), at);
    }
    if (opts.click) {
      while (nextBeat < totalBeats - 1e-6 && start + nextBeat * spb < horizon) {
        const entry: Live = { voice: null as unknown as Voice, owner };
        entry.voice = buildClick(ac, masterInput(), Math.max(ac.currentTime, start + nextBeat * spb), false, () => live.delete(entry));
        live.add(entry);
        nextBeat++;
      }
    }
    if (next >= order.length && (!opts.click || nextBeat >= totalBeats - 1e-6)) {
      later(() => {
        done = true;
        playbacks.delete(handle);
        opts.onEnd?.();
      }, end);
      return;
    }
    const id = window.setTimeout(() => {
      timers.delete(id);
      tick();
    }, TICK_MS);
    timers.add(id);
  };

  const handle: Playback = {
    stop() {
      if (done) return;
      done = true;
      playbacks.delete(handle);
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      for (const l of [...live]) {
        if (l.owner === owner) {
          l.voice.stop();
          live.delete(l);
        }
      }
    },
  };
  playbacks.add(handle);
  tick();
  return handle;
}

/** Silence everything now: sounding notes, notes scheduled but not yet
 *  started, running playSound playbacks and held partials. (Metronomes keep
 *  their own stop handle.) */
export function stopAll(): void {
  for (const p of [...playbacks]) p.stop();
  for (const l of [...live]) l.voice.stop();
  live.clear();
  for (const p of [...partials]) p.stop();
  stage?.();
  stage = null;
}

export interface MetronomeHandle {
  stop(): void;
  /** Audio-clock time of beat 0 (the first tick). */
  readonly startTime: number;
}

/** Tick steadily. `onBeat(beatInBar, bar, time)` is called as each beat
 *  sounds; `time` is that beat's audio-clock time. `beatsPerBar` beats, the
 *  first accented. */
export function startMetronome(tempo: number, beatsPerBar: number, onBeat?: (beatInBar: number, bar: number, time: number) => void, opts: { silent?: boolean } = {}): MetronomeHandle {
  const ac = audioContext();
  const spb = 60 / tempo;
  const startTime = ac.currentTime + 0.1;
  const timers = new Set<number>();
  const ahead = new Set<{ stop(): void }>(); // ticks scheduled but not yet sounded
  let n = 0;
  let stopped = false;
  const tick = () => {
    if (stopped) return;
    while (startTime + n * spb < ac.currentTime + LOOKAHEAD) {
      const t = startTime + n * spb;
      const beat = n % beatsPerBar;
      const bar = Math.floor(n / beatsPerBar);
      const click = opts.silent ? null : playClick({ accent: beat === 0, delay: Math.max(0, t - ac.currentTime) });
      if (click) ahead.add(click);
      const id = window.setTimeout(() => {
        timers.delete(id);
        if (click) ahead.delete(click);
        if (!stopped) onBeat?.(beat, bar, t);
      }, Math.max(0, (t - ac.currentTime) * 1000));
      timers.add(id);
      n++;
    }
    const id = window.setTimeout(() => {
      timers.delete(id);
      tick();
    }, TICK_MS);
    timers.add(id);
  };
  tick();
  return {
    startTime,
    stop() {
      stopped = true;
      for (const id of timers) window.clearTimeout(id);
      timers.clear();
      for (const c of ahead) c.stop();
      ahead.clear();
    },
  };
}

// --- one thing at a time -----------------------------------------------------

let stage: (() => void) | null = null;

/** A widget that holds a continuous sound calls this as it starts, passing
 *  how to stop itself. Whoever held the stage before is stopped, so two
 *  widgets never drone over each other. Returns a function to call when the
 *  widget stops on its own. */
export function claimStage(stop: () => void): () => void {
  const prev = stage;
  stage = stop;
  if (prev && prev !== stop) prev();
  return () => {
    if (stage === stop) stage = null;
  };
}

// --- harmonics, for the physics widgets --------------------------------------

export interface PartialsHandle {
  /** New strength per harmonic (index 0 = the fundamental). Negative values
   *  flip that harmonic's phase. */
  setAmplitudes(amplitudes: readonly number[]): void;
  setFrequency(fundamentalHz: number): void;
  /** Overall loudness, 0–1. */
  setLevel(level: number): void;
  stop(): void;
}

const partials = new Set<PartialsHandle>();
/** Level of one harmonic at amplitude 1. */
const PARTIAL_LEVEL = 0.14;

/** A held tone made of pure sine waves at f, 2f, 3f … with the given
 *  strengths, all starting in phase (so the sum is Σ aₙ·sin(2π·n·f·t), the
 *  same sum the widgets draw). Harmonics above the range of hearing are
 *  left out. */
export function startPartials(fundamentalHz: number, amplitudes: readonly number[], opts: { level?: number } = {}): PartialsHandle {
  const ac = audioContext();
  const out = ac.createGain();
  out.gain.value = 0;
  out.gain.setTargetAtTime(opts.level ?? 1, ac.currentTime, 0.015);
  out.connect(masterInput());
  const nyquist = ac.sampleRate / 2;
  const t0 = ac.currentTime + 0.01;
  const oscs = amplitudes.map((a, i) => {
    const osc = ac.createOscillator();
    const g = ac.createGain();
    const f = fundamentalHz * (i + 1);
    osc.frequency.value = Math.min(f, nyquist - 1);
    g.gain.value = f < nyquist * 0.9 ? a * PARTIAL_LEVEL : 0;
    osc.connect(g).connect(out);
    osc.start(t0);
    return { osc, g };
  });
  let f0 = fundamentalHz;
  let amps = [...amplitudes];
  let stopped = false;
  const apply = () => {
    const t = ac.currentTime;
    oscs.forEach(({ osc, g }, i) => {
      const f = f0 * (i + 1);
      osc.frequency.setTargetAtTime(Math.min(f, nyquist - 1), t, 0.008);
      g.gain.setTargetAtTime(f < nyquist * 0.9 ? (amps[i] ?? 0) * PARTIAL_LEVEL : 0, t, 0.02);
    });
  };
  const handle: PartialsHandle = {
    setAmplitudes(next) {
      amps = [...next];
      apply();
    },
    setFrequency(hz) {
      f0 = hz;
      apply();
    },
    setLevel(level) {
      out.gain.setTargetAtTime(level, ac.currentTime, 0.02);
    },
    stop() {
      if (stopped) return;
      stopped = true;
      partials.delete(handle);
      const t = ac.currentTime;
      out.gain.cancelScheduledValues(t);
      out.gain.setTargetAtTime(0, t, 0.02);
      for (const { osc } of oscs) osc.stop(t + 0.2);
      window.setTimeout(() => out.disconnect(), 400);
    },
  };
  partials.add(handle);
  return handle;
}

/** A string set ringing and left alone: each harmonic starts at its given
 *  strength and dies away on its own, the higher ones faster. `decay` is the
 *  fundamental's time constant in seconds; `damping` is how much faster each
 *  higher harmonic dies (harmonic n lasts decay / (1 + damping·(n−1))). */
export function pluckPartials(fundamentalHz: number, amplitudes: readonly number[], opts: { decay?: number; damping?: number; level?: number } = {}): { stop(): void } {
  const ac = audioContext();
  const decay = opts.decay ?? 1.8;
  const damping = opts.damping ?? 0.35;
  const out = ac.createGain();
  out.gain.value = opts.level ?? 1;
  out.connect(masterInput());
  const nyquist = ac.sampleRate / 2;
  const t0 = ac.currentTime + 0.01;
  const oscs: OscillatorNode[] = [];
  amplitudes.forEach((a, i) => {
    const f = fundamentalHz * (i + 1);
    if (f > nyquist * 0.9 || Math.abs(a) < 1e-4) return;
    const osc = ac.createOscillator();
    const g = ac.createGain();
    osc.frequency.value = f;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(a * PARTIAL_LEVEL * 1.1, t0 + 0.003);
    g.gain.setTargetAtTime(0, t0 + 0.003, decay / (1 + damping * i));
    osc.connect(g).connect(out);
    osc.start(t0);
    osc.stop(t0 + decay * 6);
    oscs.push(osc);
  });
  let stopped = false;
  const handle = {
    setAmplitudes() {},
    setFrequency() {},
    setLevel() {},
    stop() {
      if (stopped) return;
      stopped = true;
      partials.delete(handle);
      const t = ac.currentTime;
      out.gain.setTargetAtTime(0, t, 0.02);
      for (const osc of oscs) {
        try {
          osc.stop(t + 0.2);
        } catch {
          /* already stopped */
        }
      }
      window.setTimeout(() => out.disconnect(), 400);
    },
  };
  partials.add(handle);
  window.setTimeout(() => handle.stop(), decay * 6000 + 200);
  return handle;
}

// --- looking at a sound ------------------------------------------------------

/** Render one note to samples without playing it, for drawing its waveform
 *  and spectrum. Uses the recordings for piano and guitar when they can be
 *  loaded (waits for them), the synth otherwise. */
export async function renderNote(midi: number, timbre: Timbre, seconds = 0.6): Promise<{ samples: Float32Array; sampleRate: number; sampled: boolean }> {
  // Decode with a throwaway context when the live one does not exist yet, so
  // drawing a spectrum on page load does not start audio before a user gesture.
  const sampled = isSampled(timbre) ? await loadSamples(decodeContext(), timbre) : false;
  const sampleRate = 44100;
  const Off = offlineCtor();
  if (!Off) throw new Error("This browser cannot render a sound to draw it.");
  const off = new Off(1, Math.ceil(sampleRate * seconds), sampleRate);
  buildVoice(off, off.destination, { midi, timbre, t0: 0, duration: seconds, velocity: 0.8 });
  const buf = await off.startRendering();
  return { samples: buf.getChannelData(0), sampleRate, sampled };
}

// --- warm-up -----------------------------------------------------------------

// Load the recordings as soon as the page is idle, without waiting for the
// first note to ask for them. If that load failed (offline for a moment),
// each later touch, click or key press tries again, at most once every
// second and a half, until both instruments are in.
//
// The same gestures keep the audio context alive on phones and tablets. iOS
// only lets sound start from inside a touch, click or key handler, and
// suspends the context when the page goes to the background or a call comes
// in; so every gesture resumes it if it is not running, and so does coming
// back to the page (which works where the browser allows it, and is
// otherwise picked up by the next touch).
if (typeof window !== "undefined") {
  const idle: (fn: () => void) => void = typeof window.requestIdleCallback === "function" ? (fn) => window.requestIdleCallback(fn, { timeout: 2000 }) : (fn) => window.setTimeout(fn, 400);
  idle(() => preloadSamples());
  const wake = () => {
    if (ctx && ctx.state !== "running" && ctx.state !== "closed") void ctx.resume().catch(() => {});
  };
  // The context is CREATED here, inside the first real gesture, not by the
  // first note: that note is often an exercise playing its own question from
  // a timer, and iOS leaves a context made outside a gesture suspended until
  // the next touch (the question would sound late, or not at all).
  const onGesture = () => {
    try {
      audioContext();
    } catch {
      return; // no Web Audio in this browser
    }
    wake();
    if (!samplesReady("piano") || !samplesReady("guitar")) preloadSamples({ eager: true });
  };
  for (const type of ["pointerdown", "pointerup", "touchend", "click", "keydown"]) window.addEventListener(type, onGesture, { capture: true, passive: true });
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") wake();
  });
  window.addEventListener("pageshow", wake);
}
