import { transpose } from "./intervals.ts";
import { parsePitchClass, pc, pcLabel, pcName, pcOfClass, type Pitch, type PitchClass } from "./notes.ts";
import { parseKey, scaleNotes } from "./scales.ts";

export interface ChordType {
  name: string;
  /** What follows the root in a chord symbol: "" for major, "m", "7", "maj7" … */
  suffix: string;
  intervals: readonly string[];
}

export const CHORDS: Record<string, ChordType> = {
  maj: { name: "major", suffix: "", intervals: ["P1", "M3", "P5"] },
  min: { name: "minor", suffix: "m", intervals: ["P1", "m3", "P5"] },
  dim: { name: "diminished", suffix: "dim", intervals: ["P1", "m3", "d5"] },
  aug: { name: "augmented", suffix: "aug", intervals: ["P1", "M3", "A5"] },
  sus2: { name: "suspended second", suffix: "sus2", intervals: ["P1", "M2", "P5"] },
  sus4: { name: "suspended fourth", suffix: "sus4", intervals: ["P1", "P4", "P5"] },
  "5": { name: "power chord", suffix: "5", intervals: ["P1", "P5"] },
  "6": { name: "major sixth", suffix: "6", intervals: ["P1", "M3", "P5", "M6"] },
  m6: { name: "minor sixth", suffix: "m6", intervals: ["P1", "m3", "P5", "M6"] },
  "7": { name: "dominant seventh", suffix: "7", intervals: ["P1", "M3", "P5", "m7"] },
  maj7: { name: "major seventh", suffix: "maj7", intervals: ["P1", "M3", "P5", "M7"] },
  m7: { name: "minor seventh", suffix: "m7", intervals: ["P1", "m3", "P5", "m7"] },
  m7b5: { name: "half-diminished seventh", suffix: "m7b5", intervals: ["P1", "m3", "d5", "m7"] },
  dim7: { name: "diminished seventh", suffix: "dim7", intervals: ["P1", "m3", "d5", "d7"] },
};

/** Chord types from the most common to the least: the order choices are
 *  offered in and identifyChord answers in. (Object.keys(CHORDS) cannot be
 *  used for this: JavaScript lists the number-like keys "5", "6", "7" first.) */
export const CHORD_ORDER: readonly string[] = ["maj", "min", "7", "maj7", "m7", "dim", "aug", "sus4", "sus2", "5", "6", "m6", "m7b5", "dim7"];

export function isChordType(s: unknown): s is string {
  return typeof s === "string" && Object.hasOwn(CHORDS, s);
}

export interface ChordRef {
  root: PitchClass;
  type: string; // key of CHORDS
}

// Longest suffix first so "maj7" is not read as "m" + "aj7".
const SUFFIXES = Object.entries(CHORDS)
  .map(([type, def]) => [def.suffix, type] as const)
  .sort((a, b) => b[0].length - a[0].length);
const SYMBOL_RE = /^([A-G](?:##|#|bb|b)?)(.*)$/;

/** "C" → C major, "F#m7" → F sharp minor seventh. Throws on anything else. */
export function parseChord(symbol: string): ChordRef {
  const m = SYMBOL_RE.exec(symbol);
  if (m) {
    const hit = SUFFIXES.find(([suffix]) => suffix === m[2]);
    if (hit) return { root: parsePitchClass(m[1]), type: hit[1] };
  }
  throw new Error(`not a chord symbol this app knows: "${symbol}" (e.g. C, Am, G7, Fmaj7)`);
}
export function isChordSymbol(s: unknown): s is string {
  if (typeof s !== "string") return false;
  try {
    parseChord(s);
    return true;
  } catch {
    return false;
  }
}

export function chordSymbol(c: ChordRef): string {
  return pcName(c.root) + CHORDS[c.type].suffix;
}
export function chordLabel(c: ChordRef): string {
  return pcLabel(c.root) + CHORDS[c.type].suffix.replace("b5", "♭5");
}
export function chordFullName(c: ChordRef): string {
  return `${pcLabel(c.root)} ${CHORDS[c.type].name}`;
}

/** The notes of a chord in root position, correctly spelled, with the root in
 *  octave `oct`. */
export function chordNotes(chord: string | ChordRef, oct = 4): Pitch[] {
  const c = typeof chord === "string" ? parseChord(chord) : chord;
  const root: Pitch = { ...c.root, oct };
  return CHORDS[c.type].intervals.map((iv) => transpose(root, iv));
}

/** Pitch classes (0–11) of a chord, root first. */
export function chordPcs(chord: string | ChordRef): number[] {
  const c = typeof chord === "string" ? parseChord(chord) : chord;
  return chordNotes(c, 4).map((p) => pcOfClass(p));
}

/** Move the lowest `n` notes up an octave: 1 = first inversion, 2 = second. */
export function invert(notes: Pitch[], n: number): Pitch[] {
  const out = notes.map((p) => ({ ...p }));
  for (let i = 0; i < n; i++) {
    const low = out.shift();
    if (low) out.push({ ...low, oct: low.oct + 1 });
  }
  return out;
}

const MAJOR_ROOTS = ["C", "Db", "D", "Eb", "E", "F", "F#", "G", "Ab", "A", "Bb", "B"];
const MINOR_ROOTS = ["C", "C#", "D", "Eb", "E", "F", "F#", "G", "G#", "A", "Bb", "B"];

/** Every chord whose pitch classes are exactly the given set, most common
 *  types first. `bass` (a MIDI note) puts chords rooted on it first. */
export function identifyChord(midis: number[], bass?: number): ChordRef[] {
  const set = new Set(midis.map(pc));
  if (set.size < 2) return [];
  const out: ChordRef[] = [];
  for (const type of CHORD_ORDER) {
    const shape = chordPcs({ root: { letter: "C", acc: 0 }, type });
    // The usual spelling of a black-key root depends on the chord: D♭ and A♭
    // major, but C♯ and G♯ minor (four and five sharps, not eight and seven flats).
    const minorish = CHORDS[type].intervals[1] === "m3";
    const names = minorish ? MINOR_ROOTS : MAJOR_ROOTS;
    for (let root = 0; root < 12; root++) {
      const pcs = shape.map((x) => pc(root + x));
      if (pcs.length === set.size && pcs.every((p) => set.has(p))) out.push({ root: parsePitchClass(names[root]), type });
    }
  }
  if (bass !== undefined) out.sort((a, b) => Number(pcOfClass(b.root) === pc(bass)) - Number(pcOfClass(a.root) === pc(bass)));
  return out;
}

// --- chords in a key ------------------------------------------------------

export interface DiatonicChord {
  degree: number; // 1–7
  roman: string; // "I", "ii", "vii°" …
  chord: ChordRef;
}

const ROMAN = ["I", "II", "III", "IV", "V", "VI", "VII"];

function triadType(notes: Pitch[]): string {
  const [r, t, f] = notes.map((p) => pcOfClass(p));
  const third = pc(t - r);
  const fifth = pc(f - r);
  if (third === 4 && fifth === 7) return "maj";
  if (third === 3 && fifth === 7) return "min";
  if (third === 3 && fifth === 6) return "dim";
  return "aug";
}

/** The seven triads built on the notes of a major or natural-minor key. */
export function diatonicTriads(key: string): DiatonicChord[] {
  const k = parseKey(key);
  const scale = scaleNotes({ ...k.tonic, oct: 4 }, k.mode === "minor" ? "natural-minor" : "major");
  return scale.map((root, i) => {
    const notes = [root, scale[(i + 2) % 7], scale[(i + 4) % 7]];
    const type = triadType(notes);
    const numeral = type === "maj" || type === "aug" ? ROMAN[i] : ROMAN[i].toLowerCase();
    return {
      degree: i + 1,
      roman: numeral + (type === "dim" ? "°" : type === "aug" ? "+" : ""),
      chord: { root: { letter: root.letter, acc: root.acc }, type },
    };
  });
}

/** Resolve a Roman numeral in a key: ("C", "vi") → Am; ("G", "V7") → D7.
 *
 *  In a minor key the plain numerals stand on the natural minor scale, as
 *  diatonicTriads writes them: in A minor III = C, VI = F, VII = G. Song
 *  charts often write those same chords measured from the major scale, as
 *  ♭III, ♭VI and ♭VII; both spellings are accepted and mean the same chord
 *  (a flat on 3, 6 or 7 in minor does not lower the root a second time). The
 *  diminished chord on the seventh degree, vii°, is the one built on the
 *  raised leading tone (G♯dim in A minor), as harmonic minor gives it; a
 *  sharp raises the natural-minor degree (♯vi° = F♯dim). */
export function romanToChord(key: string, roman: string): ChordRef {
  const m = /^(b|#)?(VII|VI|IV|V|III|II|I|vii|vi|iv|v|iii|ii|i)(°|\+|7|maj7|m7)?$/.exec(roman);
  if (!m) throw new Error(`not a Roman numeral: "${roman}"`);
  const k = parseKey(key);
  const scale = scaleNotes({ ...k.tonic, oct: 4 }, k.mode === "minor" ? "natural-minor" : "major");
  const degree = ROMAN.indexOf(m[2].toUpperCase());
  let shift = m[1] === "b" ? -1 : m[1] === "#" ? 1 : 0;
  if (k.mode === "minor") {
    const alreadyFlat = degree === 2 || degree === 5 || degree === 6; // 3, 6 and 7 of natural minor
    const writtenFlat = shift === -1;
    if (writtenFlat && alreadyFlat) shift = 0;
    // Only the unmarked vii° is the leading-tone chord; a written flat asks
    // for the chord on the natural-minor seventh (♭vii° = Gdim in A minor).
    if (shift === 0 && !writtenFlat && degree === 6 && m[3] === "°") shift = 1;
  }
  const root = { letter: scale[degree].letter, acc: scale[degree].acc + shift };
  const upper = m[2] === m[2].toUpperCase();
  let type = upper ? "maj" : "min";
  if (m[3] === "°") type = "dim";
  else if (m[3] === "+") type = "aug";
  else if (m[3] === "7") type = upper ? "7" : "m7";
  else if (m[3] === "maj7") type = "maj7";
  else if (m[3] === "m7") type = "m7";
  return { root, type };
}
