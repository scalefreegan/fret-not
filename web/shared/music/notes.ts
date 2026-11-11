// Pitches. Two representations run through the whole app:
//   - a MIDI number (60 = middle C) for anything about sound or position on
//     an instrument, where C# and Db are the same key;
//   - a spelled Pitch {letter, acc, oct} for anything about notation, where
//     they are different notes on the staff.
// Strings like "C#4" and "Bb3" are the content-file form of a Pitch.

export type Letter = "C" | "D" | "E" | "F" | "G" | "A" | "B";
export const LETTERS: readonly Letter[] = ["C", "D", "E", "F", "G", "A", "B"];
const LETTER_PC: Record<Letter, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/** A spelled pitch class: letter plus accidental (-2 = double flat … +2 = double sharp). */
export interface PitchClass {
  letter: Letter;
  acc: number;
}
/** A spelled pitch in scientific octave numbering (C4 = middle C = MIDI 60). */
export interface Pitch extends PitchClass {
  oct: number;
}

const ACC_TEXT: Record<string, number> = { "": 0, "#": 1, "##": 2, x: 2, b: -1, bb: -2, "♯": 1, "♭": -1, "𝄪": 2, "𝄫": -2 };
const PC_RE = /^([A-Ga-g])(##|#|x|bb|b|♯|♭|𝄪|𝄫)?$/u;
const PITCH_RE = /^([A-Ga-g])(##|#|x|bb|b|♯|♭|𝄪|𝄫)?(-?\d+)$/u;

export function isPitch(s: unknown): s is string {
  return typeof s === "string" && PITCH_RE.test(s);
}
export function isPitchClass(s: unknown): s is string {
  return typeof s === "string" && PC_RE.test(s);
}

export function parsePitch(s: string): Pitch {
  const m = PITCH_RE.exec(s);
  if (!m) throw new Error(`not a pitch: "${s}" (expected e.g. C4, F#3, Bb2)`);
  return { letter: m[1].toUpperCase() as Letter, acc: ACC_TEXT[m[2] ?? ""], oct: Number(m[3]) };
}

export function parsePitchClass(s: string): PitchClass {
  const m = PC_RE.exec(s);
  if (!m) throw new Error(`not a note name: "${s}" (expected e.g. C, F#, Bb)`);
  return { letter: m[1].toUpperCase() as Letter, acc: ACC_TEXT[m[2] ?? ""] };
}

/** "#", "b", "##", "bb" or "" — the content-file spelling. */
export function accText(acc: number): string {
  return acc > 0 ? "#".repeat(acc) : "b".repeat(-acc);
}
/** "♯", "♭", "𝄪", "𝄫" or "" — the spelling shown to the learner. */
export function accSymbol(acc: number): string {
  if (acc === 2) return "𝄪";
  if (acc === -2) return "𝄫";
  return acc > 0 ? "♯".repeat(acc) : "♭".repeat(-acc);
}

export function pcName(p: PitchClass): string {
  return p.letter + accText(p.acc);
}
export function pcLabel(p: PitchClass): string {
  return p.letter + accSymbol(p.acc);
}
export function pitchName(p: Pitch): string {
  return pcName(p) + p.oct;
}
export function pitchLabel(p: Pitch): string {
  return pcLabel(p) + p.oct;
}

export function toMidi(p: Pitch): number {
  return (p.oct + 1) * 12 + LETTER_PC[p.letter] + p.acc;
}
/** Accepts a pitch string, a Pitch or a MIDI number. */
export function midiOf(x: string | Pitch | number): number {
  if (typeof x === "number") return x;
  return toMidi(typeof x === "string" ? parsePitch(x) : x);
}

/** 0–11, C = 0. Safe for negative input. */
export function pc(midi: number): number {
  return ((midi % 12) + 12) % 12;
}
export function pcOfClass(p: PitchClass): number {
  return pc(LETTER_PC[p.letter] + p.acc);
}

const SHARP_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const FLAT_NAMES = ["C", "Db", "D", "Eb", "E", "F", "Gb", "G", "Ab", "A", "Bb", "B"];

/** The default spelling of a MIDI note. Black keys have two names; `prefer`
 *  picks one. Use the scale/chord functions when the spelling matters. */
export function fromMidi(midi: number, prefer: "sharp" | "flat" = "sharp"): Pitch {
  const name = (prefer === "flat" ? FLAT_NAMES : SHARP_NAMES)[pc(midi)];
  return { ...parsePitchClass(name), oct: Math.floor(midi / 12) - 1 };
}
export function midiName(midi: number, prefer: "sharp" | "flat" = "sharp"): string {
  return pitchName(fromMidi(midi, prefer));
}
export function pcNameOf(midi: number, prefer: "sharp" | "flat" = "sharp"): string {
  return (prefer === "flat" ? FLAT_NAMES : SHARP_NAMES)[pc(midi)];
}
/** Both names of a black key ("C♯ / D♭"), or the one name of a white key. */
export function pcBothLabels(midi: number): string {
  const s = SHARP_NAMES[pc(midi)];
  const f = FLAT_NAMES[pc(midi)];
  return s === f ? s : `${pcLabel(parsePitchClass(s))} / ${pcLabel(parsePitchClass(f))}`;
}

export function isBlackKey(midi: number): boolean {
  return [1, 3, 6, 8, 10].includes(pc(midi));
}

/** Equal temperament, A4 = 440 Hz unless told otherwise. */
export function freqOf(midi: number, a4 = 440): number {
  return a4 * 2 ** ((midi - 69) / 12);
}
/** The (fractional) MIDI number of a frequency. */
export function midiOfFreq(hz: number, a4 = 440): number {
  return 69 + 12 * Math.log2(hz / a4);
}
/** Nearest note to a frequency and how far off it is, in cents (-50…+50). */
export function nearestNote(hz: number, a4 = 440): { midi: number; cents: number } {
  const exact = midiOfFreq(hz, a4);
  const midi = Math.round(exact);
  return { midi, cents: Math.round((exact - midi) * 100) };
}

/** Position on the endless ladder of letter names: C0 = 0, D0 = 1 … C1 = 7.
 *  Staff positions and interval numbers are differences of this. */
export function diatonicIndex(p: Pitch): number {
  return p.oct * 7 + LETTERS.indexOf(p.letter);
}
export function letterAt(index: number): { letter: Letter; oct: number } {
  return { letter: LETTERS[((index % 7) + 7) % 7], oct: Math.floor(index / 7) };
}

/** Respell a pitch on a given letter (same sound), or null if that would need
 *  more than a double accidental. */
export function respell(midi: number, letter: Letter): Pitch | null {
  for (const oct of [Math.floor(midi / 12) - 2, Math.floor(midi / 12) - 1, Math.floor(midi / 12)]) {
    const acc = midi - toMidi({ letter, acc: 0, oct });
    if (Math.abs(acc) <= 2) return { letter, acc, oct };
  }
  return null;
}

export function samePitch(a: Pitch, b: Pitch): boolean {
  return a.letter === b.letter && a.acc === b.acc && a.oct === b.oct;
}
