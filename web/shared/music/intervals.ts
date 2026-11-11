import { diatonicIndex, letterAt, toMidi, type Pitch } from "./notes.ts";

// Intervals as musicians name them: a number (how many letter names it
// spans) and a quality. "M3" = major third, "P5" = perfect fifth, "m7" =
// minor seventh, "A4" = augmented fourth, "d5" = diminished fifth.

export type Quality = "P" | "M" | "m" | "A" | "d";
export interface Interval {
  num: number; // 1 = unison, 8 = octave, 9 = ninth …
  quality: Quality;
}

const IV_RE = /^(P|M|m|A|d)(\d+)$/;
const MAJOR_SEMIS = [0, 2, 4, 5, 7, 9, 11]; // unison…seventh in a major scale
const PERFECT = new Set([1, 4, 5]); // simple numbers that are "perfect" rather than major/minor

export function isInterval(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    parseInterval(s);
    return true;
  } catch {
    return false;
  }
}

export function parseInterval(s: string): Interval {
  const m = IV_RE.exec(s);
  if (!m) throw new Error(`not an interval: "${s}" (expected e.g. M3, P5, m7)`);
  const iv = { quality: m[1] as Quality, num: Number(m[2]) };
  if (iv.num < 1) throw new Error(`not an interval: "${s}"`);
  const perfect = PERFECT.has(simpleNum(iv.num));
  if (perfect && (iv.quality === "M" || iv.quality === "m")) throw new Error(`"${s}": unisons, fourths, fifths and octaves are perfect, not major or minor`);
  if (!perfect && iv.quality === "P") throw new Error(`"${s}": seconds, thirds, sixths and sevenths are major or minor, not perfect`);
  return iv;
}

function simpleNum(num: number): number {
  return ((num - 1) % 7) + 1;
}

export function intervalText(iv: Interval): string {
  return iv.quality + iv.num;
}

export function semitones(x: Interval | string): number {
  const iv = typeof x === "string" ? parseInterval(x) : x;
  const simple = simpleNum(iv.num);
  const octaves = Math.floor((iv.num - 1) / 7);
  const base = MAJOR_SEMIS[simple - 1] + 12 * octaves;
  if (PERFECT.has(simple)) return base + { P: 0, A: 1, d: -1, M: 0, m: 0 }[iv.quality];
  return base + { M: 0, m: -1, A: 1, d: -2, P: 0 }[iv.quality];
}

/** Move a pitch by an interval, keeping the correct spelling (C up a M3 is E,
 *  C up a d4 is Fb). `dir` -1 moves down. */
export function transpose(p: Pitch, x: Interval | string, dir: 1 | -1 = 1): Pitch {
  const iv = typeof x === "string" ? parseInterval(x) : x;
  const { letter, oct } = letterAt(diatonicIndex(p) + dir * (iv.num - 1));
  const target = toMidi(p) + dir * semitones(iv);
  return { letter, oct, acc: target - toMidi({ letter, acc: 0, oct }) };
}

/** The interval from the lower to the higher of two pitches. */
export function intervalBetween(a: Pitch, b: Pitch): Interval {
  let lo = a;
  let hi = b;
  const da = diatonicIndex(a);
  const db = diatonicIndex(b);
  if (db < da || (db === da && toMidi(b) < toMidi(a))) {
    lo = b;
    hi = a;
  }
  const num = diatonicIndex(hi) - diatonicIndex(lo) + 1;
  const semis = toMidi(hi) - toMidi(lo);
  const simple = simpleNum(num);
  const base = MAJOR_SEMIS[simple - 1] + 12 * Math.floor((num - 1) / 7);
  const diff = semis - base;
  let quality: Quality;
  if (PERFECT.has(simple)) {
    if (diff === 0) quality = "P";
    else if (diff === 1) quality = "A";
    else if (diff === -1) quality = "d";
    else throw new Error("interval needs more than one augmentation");
  } else if (diff === 0) quality = "M";
  else if (diff === -1) quality = "m";
  else if (diff === 1) quality = "A";
  else if (diff === -2) quality = "d";
  else throw new Error("interval needs more than one augmentation");
  return { num, quality };
}

/** The everyday intervals within an octave, in order of size. The tritone is
 *  listed once, as an augmented fourth. */
export const SIMPLE_INTERVALS = ["P1", "m2", "M2", "m3", "M3", "P4", "A4", "P5", "m6", "M6", "m7", "M7", "P8"] as const;

const NAMES: Record<string, string> = {
  P1: "unison",
  m2: "minor second",
  M2: "major second",
  m3: "minor third",
  M3: "major third",
  P4: "perfect fourth",
  A4: "tritone",
  d5: "tritone",
  P5: "perfect fifth",
  m6: "minor sixth",
  M6: "major sixth",
  m7: "minor seventh",
  M7: "major seventh",
  P8: "octave",
};
const ORDINALS = ["", "unison", "second", "third", "fourth", "fifth", "sixth", "seventh", "octave", "ninth", "tenth", "eleventh", "twelfth", "thirteenth"];
const QUALITY_WORDS: Record<Quality, string> = { P: "perfect", M: "major", m: "minor", A: "augmented", d: "diminished" };

export function intervalName(x: Interval | string): string {
  const text = typeof x === "string" ? x : intervalText(x);
  if (NAMES[text]) return NAMES[text];
  const iv = parseInterval(text);
  return `${QUALITY_WORDS[iv.quality]} ${ORDINALS[iv.num] ?? `${iv.num}th`}`;
}

/** Default name for a number of semitones (0–12). */
export function intervalOfSemitones(n: number): string {
  if (n < 0 || n > 12) throw new Error(`no simple interval of ${n} semitones`);
  return SIMPLE_INTERVALS[n];
}

/** The small whole-number frequency ratio an interval approximates in equal
 *  temperament (just intonation), e.g. P5 → [3, 2]. */
export const JUST_RATIOS: Record<string, [number, number]> = {
  P1: [1, 1],
  m2: [16, 15],
  M2: [9, 8],
  m3: [6, 5],
  M3: [5, 4],
  P4: [4, 3],
  A4: [45, 32],
  d5: [64, 45],
  P5: [3, 2],
  m6: [8, 5],
  M6: [5, 3],
  m7: [9, 5],
  M7: [15, 8],
  P8: [2, 1],
};
