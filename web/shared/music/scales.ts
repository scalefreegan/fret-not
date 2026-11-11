import { transpose, semitones } from "./intervals.ts";
import { parsePitch, parsePitchClass, pcName, type Letter, type Pitch, type PitchClass } from "./notes.ts";

export interface ScaleType {
  name: string;
  intervals: readonly string[]; // from the tonic, without the octave
}

export const SCALES: Record<string, ScaleType> = {
  major: { name: "major", intervals: ["P1", "M2", "M3", "P4", "P5", "M6", "M7"] },
  "natural-minor": { name: "natural minor", intervals: ["P1", "M2", "m3", "P4", "P5", "m6", "m7"] },
  "harmonic-minor": { name: "harmonic minor", intervals: ["P1", "M2", "m3", "P4", "P5", "m6", "M7"] },
  "melodic-minor": { name: "melodic minor", intervals: ["P1", "M2", "m3", "P4", "P5", "M6", "M7"] },
  "major-pentatonic": { name: "major pentatonic", intervals: ["P1", "M2", "M3", "P5", "M6"] },
  "minor-pentatonic": { name: "minor pentatonic", intervals: ["P1", "m3", "P4", "P5", "m7"] },
  blues: { name: "blues", intervals: ["P1", "m3", "P4", "d5", "P5", "m7"] },
  dorian: { name: "Dorian", intervals: ["P1", "M2", "m3", "P4", "P5", "M6", "m7"] },
  phrygian: { name: "Phrygian", intervals: ["P1", "m2", "m3", "P4", "P5", "m6", "m7"] },
  lydian: { name: "Lydian", intervals: ["P1", "M2", "M3", "A4", "P5", "M6", "M7"] },
  mixolydian: { name: "Mixolydian", intervals: ["P1", "M2", "M3", "P4", "P5", "M6", "m7"] },
  locrian: { name: "Locrian", intervals: ["P1", "m2", "m3", "P4", "d5", "m6", "m7"] },
};

export function isScaleType(s: unknown): s is string {
  return typeof s === "string" && Object.hasOwn(SCALES, s);
}

/** The notes of a scale, correctly spelled, starting from `tonic` (a pitch
 *  such as "D4"). With `withOctave` the tonic an octave up is appended. */
export function scaleNotes(tonic: string | Pitch, type: string, withOctave = false): Pitch[] {
  const t = typeof tonic === "string" ? parsePitch(tonic) : tonic;
  const def = SCALES[type];
  if (!def) throw new Error(`unknown scale type: ${type}`);
  const out = def.intervals.map((iv) => transpose(t, iv));
  if (withOctave) out.push({ ...t, oct: t.oct + 1 });
  return out;
}

/** Semitone gaps between neighbouring scale notes, octave included: the
 *  major scale gives [2, 2, 1, 2, 2, 2, 1]. */
export function stepPattern(type: string): number[] {
  const def = SCALES[type];
  if (!def) throw new Error(`unknown scale type: ${type}`);
  const semis = [...def.intervals.map((iv) => semitones(iv)), 12];
  return semis.slice(1).map((s, i) => s - semis[i]);
}
/** "W" whole step, "H" half step, "W+H" a step and a half. */
export function stepLabel(semis: number): string {
  return semis === 1 ? "H" : semis === 2 ? "W" : semis === 3 ? "W+H" : `${semis}`;
}

// --- key signatures -------------------------------------------------------

export const SHARP_ORDER: readonly Letter[] = ["F", "C", "G", "D", "A", "E", "B"];
export const FLAT_ORDER: readonly Letter[] = ["B", "E", "A", "D", "G", "C", "F"];
/** Major keys around the circle of fifths: index 7 is C; to the right each
 *  key adds a sharp, to the left a flat. */
const MAJOR_KEYS = ["Cb", "Gb", "Db", "Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#"];
const MINOR_KEYS = ["Ab", "Eb", "Bb", "F", "C", "G", "D", "A", "E", "B", "F#", "C#", "G#", "D#", "A#"];

export type Mode = "major" | "minor";
export interface Key {
  tonic: PitchClass;
  mode: Mode;
}
export interface KeySignature {
  /** Positive = that many sharps, negative = that many flats, 0 = none. */
  count: number;
  /** The letters that carry the accidental, in the order they are written. */
  letters: Letter[];
}

/** "G" = G major, "Em" = E minor, "F#m", "Bb". */
export function parseKey(s: string): Key {
  const minor = s.endsWith("m");
  return { tonic: parsePitchClass(minor ? s.slice(0, -1) : s), mode: minor ? "minor" : "major" };
}
export function isKey(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    keySignature(s);
    return true;
  } catch {
    return false;
  }
}
export function keyName(k: Key): string {
  return `${pcName(k.tonic)}${k.mode === "minor" ? "m" : ""}`;
}

export function keySignature(key: string | Key): KeySignature {
  const k = typeof key === "string" ? parseKey(key) : key;
  const idx = (k.mode === "minor" ? MINOR_KEYS : MAJOR_KEYS).indexOf(pcName(k.tonic));
  if (idx < 0) throw new Error(`no standard key signature for ${keyName(k)}`);
  const count = idx - 7;
  return { count, letters: count >= 0 ? SHARP_ORDER.slice(0, count) : FLAT_ORDER.slice(0, -count) };
}

/** The key with a given signature: count 2 → D (major) or Bm (minor). */
export function keyOfSignature(count: number, mode: Mode = "major"): string {
  if (count < -7 || count > 7) throw new Error("key signatures run from 7 flats to 7 sharps");
  return (mode === "minor" ? MINOR_KEYS : MAJOR_KEYS)[count + 7] + (mode === "minor" ? "m" : "");
}

/** The twelve major keys clockwise from C, as usually drawn on the circle of
 *  fifths (flat spellings on the left side). */
export const CIRCLE_OF_FIFTHS = ["C", "G", "D", "A", "E", "B", "F#", "Db", "Ab", "Eb", "Bb", "F"] as const;
export function relativeMinor(majorKey: string): string {
  return keyOfSignature(keySignature(majorKey).count, "minor");
}
