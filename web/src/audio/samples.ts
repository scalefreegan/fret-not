// The recorded instruments: which files exist, what note each one sounds,
// where its attack begins and how loud it is. Licences and sources are in
// web/public/samples/CREDITS.md. Notes between samples are made by changing
// the playback rate.

export interface SampleDef {
  midi: number;
  url: string;
  /** Seconds of near-silence before the attack; playback starts here. */
  onset: number;
  /** Peak level of the recording (0–1), to even out loudness. */
  peak: number;
}

const P = (name: string, midi: number, onsetMs: number, peak: number): SampleDef => ({ midi, url: `/samples/piano/${name}.mp3`, onset: Math.max(0, onsetMs - 4) / 1000, peak });
const G = (name: string, midi: number, onsetMs: number, peak: number): SampleDef => ({ midi, url: `/samples/guitar/${name}.mp3`, onset: Math.max(0, onsetMs - 4) / 1000, peak });

// Onsets and peaks measured from the files (first sample above 5% of peak).
export const SAMPLE_SETS: Record<"piano" | "guitar", SampleDef[]> = {
  piano: [
    P("C1", 24, 27.1, 0.41), P("Ds1", 27, 16.2, 0.42), P("Fs1", 30, 21.7, 0.45), P("A1", 33, 8.6, 0.38),
    P("C2", 36, 11.5, 0.39), P("Ds2", 39, 10.7, 0.38), P("Fs2", 42, 8.0, 0.38), P("A2", 45, 9.6, 0.25),
    P("C3", 48, 14.3, 0.36), P("Ds3", 51, 12.2, 0.22), P("Fs3", 54, 16.1, 0.32), P("A3", 57, 14.3, 0.2),
    P("C4", 60, 14.4, 0.23), P("Ds4", 63, 13.3, 0.24), P("Fs4", 66, 15.0, 0.18), P("A4", 69, 12.9, 0.2),
    P("C5", 72, 10.0, 0.2), P("Ds5", 75, 15.6, 0.1), P("Fs5", 78, 14.9, 0.22), P("A5", 81, 11.3, 0.15),
    P("C6", 84, 16.0, 0.22), P("Ds6", 87, 13.9, 0.25), P("Fs6", 90, 13.5, 0.24), P("A6", 93, 12.9, 0.2),
    P("C7", 96, 12.2, 0.21), P("Ds7", 99, 15.4, 0.13), P("Fs7", 102, 14.9, 0.19), P("A7", 105, 13.6, 0.11),
  ],
  guitar: [G("E2", 40, 64.9, 0.71), G("A2", 45, 23.0, 0.71), G("D3", 50, 46.7, 0.69), G("G3", 55, 23.3, 0.71), G("B3", 59, 14.5, 0.73), G("E4", 64, 44.6, 0.71)],
};

export type SampledTimbre = keyof typeof SAMPLE_SETS;
export function isSampled(t: string): t is SampledTimbre {
  return t === "piano" || t === "guitar";
}

type State = "idle" | "loading" | "ready" | "failed";
const state: Record<SampledTimbre, State> = { piano: "idle", guitar: "idle" };
const pending: Partial<Record<SampledTimbre, Promise<boolean>>> = {};
const buffers = new Map<string, AudioBuffer>();

export function samplesReady(t: SampledTimbre): boolean {
  return state[t] === "ready";
}

/** Fetch and decode a set once. Resolves true when every file loaded; false
 *  (and the synth keeps standing in) when any failed. Never rejects. */
export function loadSamples(ac: BaseAudioContext, t: SampledTimbre): Promise<boolean> {
  if (pending[t]) return pending[t];
  state[t] = "loading";
  const run = Promise.all(
    SAMPLE_SETS[t].map(async (s) => {
      const res = await fetch(s.url);
      if (!res.ok) throw new Error(`${s.url}: ${res.status}`);
      buffers.set(s.url, await ac.decodeAudioData(await res.arrayBuffer()));
    }),
  ).then(
    () => {
      state[t] = "ready";
      return true;
    },
    (e) => {
      console.warn(`[audio] ${t} samples unavailable, using the synth instead:`, e);
      state[t] = "failed";
      return false;
    },
  );
  pending[t] = run;
  return run;
}

/** The sample to play a note from, and how much to speed it up or slow it
 *  down. Piano uses the nearest sample; guitar uses the nearest open string
 *  at or below the note (a string only ever gets shorter). Returns null when
 *  the note is too far from any sample to sound right. */
export function pickSample(t: SampledTimbre, midi: number): { def: SampleDef; buffer: AudioBuffer; rate: number } | null {
  const set = SAMPLE_SETS[t];
  let best: SampleDef | null = null;
  if (t === "guitar") {
    for (const s of set) if (s.midi <= midi + 2) best = s; // sorted ascending: the highest sample not above the note (two semitones of slack below E2)
    if (!best || midi - best.midi > 17) return null;
  } else {
    for (const s of set) if (!best || Math.abs(s.midi - midi) < Math.abs(best.midi - midi)) best = s;
    if (!best || Math.abs(best.midi - midi) > 4) return null;
  }
  const buffer = buffers.get(best.url);
  if (!buffer) return null;
  return { def: best, buffer, rate: 2 ** ((midi - best.midi) / 12) };
}
